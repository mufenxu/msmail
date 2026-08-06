const Imap = require('node-imap')
const net = require('node:net')
const { simpleParser } = require('mailparser')
const { SocksClient } = require('socks')
const { autoAgent } = require('./ProxyService')

const oauthTenant = process.env.MS_TENANT || 'common'
const tokenEndpoint = `https://login.microsoftonline.com/${oauthTenant}/oauth2/v2.0/token`
const graphBaseUrl = 'https://graph.microsoft.com/v1.0'
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
const IMAP_SCOPE = 'https://outlook.office.com/IMAP.AccessAsUser.All'
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 2

const mailboxName = (mailbox) => mailbox === 'Junk' ? 'junkemail' : 'inbox'

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const retryAfterMilliseconds = (response) => {
  const value = response.headers?.get('retry-after')
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : Math.max(0, timestamp - Date.now())
}

const backoffMilliseconds = (attempt) => Math.min(
  1000 * (2 ** attempt) + Math.floor(Math.random() * 250),
  30000
)

const fetchWithRetry = async (request) => {
  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await request()
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) return response
      await response.arrayBuffer().catch(() => {})
      await delay(retryAfterMilliseconds(response) || backoffMilliseconds(attempt))
    } catch (error) {
      lastError = error
      if (attempt === MAX_RETRIES) throw error
      await delay(backoffMilliseconds(attempt))
    }
  }
  throw lastError
}

const isTransientServiceError = (error) => RETRYABLE_STATUSES.has(
  Number(error?.status || error?.cause?.status || 0)
)

const tokenRequest = async (refreshToken, clientId, scope, socks5, http) => {
  const agentOptions = autoAgent(socks5, http)
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope
  }).toString()
  const response = await fetchWithRetry(() => agentOptions.fetch(tokenEndpoint, {
    method: 'POST',
    ...agentOptions.proxy,
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }))

  if (!response.ok) {
    const error = new Error(`Microsoft token request failed with status ${response.status}`)
    error.status = response.status
    error.retry_after_ms = retryAfterMilliseconds(response)
    throw error
  }

  return response.json()
}

const use_graph_api = async (refreshToken, clientId, mailbox, email, socks5, http, tokenData = null) => {
  try {
    const data = tokenData || await tokenRequest(refreshToken, clientId, GRAPH_SCOPE, socks5, http)
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      status: Boolean(data.access_token),
      mailbox: mailboxName(mailbox),
      email
    }
  } catch (error) {
    return {
      status: false,
      mailbox: mailboxName(mailbox),
      email,
      error
    }
  }
}

const graphRequest = async (url, accessToken, socks5, http) => {
  const agentOptions = autoAgent(socks5, http)
  const response = await fetchWithRetry(() => agentOptions.fetch(url, {
    method: 'GET',
    ...agentOptions.proxy,
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId", odata.maxpagesize=100'
    }
  }))
  if (!response.ok) {
    const error = new Error(`Microsoft Graph request failed with status ${response.status}`)
    error.status = response.status
    error.retry_after_ms = retryAfterMilliseconds(response)
    throw error
  }
  return response.json()
}

const use_get_graph_emails = async (graphResult, cursor = '', socks5, http) => {
  const messages = []
  const removed = []
  let deltaLink = ''
  let nextUrl = cursor

  if (!nextUrl) {
    const params = new URLSearchParams()
    params.set('$select', 'id,internetMessageId,from,subject,bodyPreview,receivedDateTime')
    nextUrl = `${graphBaseUrl}/me/mailFolders/${graphResult.mailbox}/messages/delta?${params.toString()}`
  }

  while (nextUrl) {
    const page = await graphRequest(nextUrl, graphResult.access_token, socks5, http)
    for (const item of page.value || []) {
      if (item['@removed']) {
        if (item.id) removed.push(String(item.id))
        continue
      }
      messages.push({
        id: String(item.id || item.internetMessageId || ''),
        send: item.from?.emailAddress?.address || '',
        subject: item.subject || '',
        text: item.bodyPreview || '',
        html: '',
        date: item.receivedDateTime || '',
        provider: 'graph',
        body_loaded: false
      })
    }
    nextUrl = page['@odata.nextLink'] || ''
    deltaLink = page['@odata.deltaLink'] || deltaLink
  }

  return { messages, removed, cursor: deltaLink || cursor }
}

const use_get_graph_message_body = async (graphResult, messageId, socks5, http) => {
  const params = new URLSearchParams({ '$select': 'body,bodyPreview' })
  const url = `${graphBaseUrl}/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`
  const item = await graphRequest(url, graphResult.access_token, socks5, http)
  const contentType = String(item.body?.contentType || '').toLowerCase()
  const content = item.body?.content || ''
  return {
    text: contentType === 'text' ? content : (item.bodyPreview || ''),
    html: contentType === 'html' ? content : ''
  }
}

const use_imap_api = async (refreshToken, clientId, email, socks5, http, tokenData = null) => {
  const data = tokenData || await tokenRequest(refreshToken, clientId, IMAP_SCOPE, socks5, http)
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    email
  }
}

const generateAuthString = (email, accessToken) => Buffer.from(
  `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`
).toString('base64')

const toImapDate = (iso) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

const connectHttpProxy = (proxyUrl, destination) => new Promise((resolve, reject) => {
  const parsed = new URL(proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`)
  const socket = net.connect(Number(parsed.port || 8080), parsed.hostname)
  const authorization = parsed.username
    ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')}\r\n`
    : ''
  let response = Buffer.alloc(0)

  socket.setTimeout(15000)
  socket.once('connect', () => {
    socket.write(
      `CONNECT ${destination.host}:${destination.port} HTTP/1.1\r\n` +
      `Host: ${destination.host}:${destination.port}\r\n` +
      authorization +
      'Connection: keep-alive\r\n\r\n'
    )
  })
  socket.on('data', (chunk) => {
    response = Buffer.concat([response, chunk])
    const boundary = response.indexOf('\r\n\r\n')
    if (boundary === -1) return
    socket.removeAllListeners('data')
    const statusLine = response.subarray(0, boundary).toString('latin1').split('\r\n')[0]
    if (!/\s200\s/.test(statusLine)) {
      socket.destroy()
      reject(new Error(`HTTP proxy CONNECT failed: ${statusLine}`))
      return
    }
    const remaining = response.subarray(boundary + 4)
    if (remaining.length) socket.unshift(remaining)
    socket.setTimeout(0)
    resolve(socket)
  })
  socket.once('timeout', () => {
    socket.destroy()
    reject(new Error('HTTP proxy connection timed out'))
  })
  socket.once('error', reject)
})

const createImapProxySocket = async (socks5, http) => {
  const destination = { host: 'outlook.office365.com', port: 993 }
  if (socks5) {
    const parsed = new URL(socks5.includes('://') ? socks5 : `socks5://${socks5}`)
    const result = await SocksClient.createConnection({
      command: 'connect',
      destination,
      proxy: {
        host: parsed.hostname,
        port: Number(parsed.port || 1080),
        type: 5,
        userId: decodeURIComponent(parsed.username || ''),
        password: decodeURIComponent(parsed.password || '')
      },
      timeout: 15000
    })
    return result.socket
  }
  if (http) return connectHttpProxy(http, destination)
  return null
}

const use_get_imap_emails = async (email, authString, mailbox = 'INBOX', top = 10000, socks5, http, since = '') => {
  const proxySocket = await createImapProxySocket(socks5, http)
  return new Promise((resolve, reject) => {
    const config = {
      user: email,
      xoauth2: authString,
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      connTimeout: 30000,
      authTimeout: 30000,
      tlsOptions: { rejectUnauthorized: true, servername: 'outlook.office365.com' }
    }
    if (proxySocket) config.sock = proxySocket

    const imap = new Imap(config)
    const emailList = []
    let settled = false
    let uidValidity = ''

    const finish = (error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(emailList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
    }

    imap.once('ready', () => {
      imap.openBox(mailbox, true, (openError, box) => {
        if (openError) {
          finish(openError)
          imap.end()
          return
        }
        uidValidity = String(box.uidvalidity || '')
        const sinceDate = toImapDate(since)
        const criteria = sinceDate ? [['SINCE', sinceDate]] : ['ALL']
        imap.search(criteria, (searchError, results) => {
          if (searchError) {
            finish(searchError)
            imap.end()
            return
          }
          const ids = results.slice(-Math.min(Number(top) || 10000, results.length))
          if (!ids.length) {
            imap.end()
            return
          }

          const tasks = []
          const fetcher = imap.fetch(ids, { bodies: '' })
          fetcher.on('message', (message) => {
            let attributes = null
            let parsedMail = Promise.resolve(null)
            message.once('attributes', (value) => { attributes = value })
            message.on('body', (stream) => {
              parsedMail = simpleParser(stream, { skipHtmlToText: true, skipTextToHtml: true })
            })
            tasks.push(new Promise((taskResolve) => {
              message.once('end', async () => {
                try {
                  const mail = await parsedMail
                  if (!mail) return
                  const stableId = attributes?.uid
                    ? `imap:${uidValidity}:${attributes.uid}`
                    : `imap-message:${mail.messageId || `${mail.date?.toISOString() || ''}:${mail.subject || ''}`}`
                  emailList.push({
                    id: stableId,
                    send: mail.from?.text || '',
                    subject: mail.subject || '',
                    text: mail.text || '',
                    html: typeof mail.html === 'string' ? mail.html : '',
                    date: mail.date || '',
                    provider: 'imap',
                    body_loaded: true
                  })
                } finally {
                  taskResolve()
                }
              })
            }))
          })
          fetcher.once('error', (error) => {
            finish(error)
            imap.end()
          })
          fetcher.once('end', async () => {
            await Promise.all(tasks)
            imap.end()
          })
        })
      })
    })
    imap.once('error', finish)
    imap.once('end', () => finish())
    imap.connect()
  })
}

const use_test_proxy = async (socks5, http) => {
  const agentOptions = autoAgent(socks5, http)
  const response = await agentOptions.fetch('https://unix.xin/api/get_ip', {
    ...agentOptions.proxy,
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error(`Proxy test failed with status ${response.status}`)
  const body = await response.json()
  return { ip: body.ip }
}

module.exports = {
  requestToken: tokenRequest,
  GRAPH_SCOPE,
  IMAP_SCOPE,
  isTransientServiceError,
  use_graph_api,
  use_get_graph_emails,
  use_get_graph_message_body,
  use_imap_api,
  generateAuthString,
  use_get_imap_emails,
  use_test_proxy
}
