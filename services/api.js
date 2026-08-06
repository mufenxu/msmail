const logger = require('../utils/logger')
const tokenService = require('./TokenService')
const {
  GRAPH_SCOPE,
  IMAP_SCOPE,
  isTransientServiceError,
  isAuthError,
  use_graph_api,
  use_get_graph_emails,
  use_get_graph_message_body,
  use_imap_api,
  generateAuthString,
  use_get_imap_emails,
  use_test_proxy
} = require('./MailService')

const createMailError = (error) => {
  const authFailure = isAuthError(error)
  const wrapped = new Error(authFailure
    ? 'Microsoft OAuth 授权失败，请检查 refresh_token、client_id 及邮箱读取权限。'
    : 'Microsoft 邮箱服务暂时不可用，请稍后重试。')
  wrapped.status = authFailure ? 401 : 502
  wrapped.cause = error
  return wrapped
}

const service = {
  async syncMailbox(account, mailbox, state = {}, socks5, http) {
    let refreshToken = account.refresh_token
    try {
      let graph
      try {
        const graphToken = await tokenService.refreshAccountToken(account, GRAPH_SCOPE, socks5, http)
        graph = await use_graph_api(refreshToken, account.client_id, mailbox, account.email, socks5, http, graphToken)
        if (graph.refresh_token) refreshToken = graph.refresh_token
      } catch (error) {
        if (isTransientServiceError(error)) throw error
        graph = { status: false, error }
      }

      if (graph.status) {
        try {
          const cursor = state.provider === 'graph' ? state.sync_cursor : ''
          let graphData
          try {
            graphData = await use_get_graph_emails(graph, cursor, socks5, http)
          } catch (cursorError) {
            if (!cursor) throw cursorError
            logger.warn(`Graph cursor expired for ${account.email}; starting a full delta sync`)
            graphData = await use_get_graph_emails(graph, '', socks5, http)
          }
          return { ...graphData, provider: 'graph', refresh_token: refreshToken }
        } catch (graphError) {
          if (isTransientServiceError(graphError)) throw graphError
          logger.warn(`Graph message sync failed for ${account.email}; using IMAP fallback`, graphError)
        }
      }

      const imapToken = await tokenService.refreshAccountToken(account, IMAP_SCOPE, socks5, http)
      const imap = await use_imap_api(refreshToken, account.client_id, account.email, socks5, http, imapToken)
      const authString = generateAuthString(account.email, imap.access_token)
      const messages = await use_get_imap_emails(
        account.email,
        authString,
        mailbox,
        state.last_synced_at ? 500 : 10000,
        socks5,
        http,
        state.last_synced_at
      )
      return {
        messages,
        removed: [],
        cursor: '',
        provider: 'imap',
        refresh_token: imap.refresh_token || refreshToken
      }
    } catch (error) {
      logger.error(`Mailbox sync failed for ${account.email}`, error)
      throw createMailError(error)
    }
  },

  async loadGraphBody(account, mailbox, messageId, socks5, http) {
    try {
      const graphToken = await tokenService.refreshAccountToken(account, GRAPH_SCOPE, socks5, http)
      const graph = await use_graph_api(account.refresh_token, account.client_id, mailbox, account.email, socks5, http, graphToken)
      if (!graph.status) throw graph.error || new Error('Mail.Read permission is unavailable')
      const body = await use_get_graph_message_body(graph, messageId, socks5, http)
      return { ...body, refresh_token: graph.refresh_token }
    } catch (error) {
      logger.error(`Graph body load failed for ${account.email}`, error)
      throw createMailError(error)
    }
  },

  async testProxy(socks5, http) {
    try {
      return await use_test_proxy(socks5, http)
    } catch (error) {
      logger.error('Proxy test failed', error)
      const wrapped = new Error('代理连接测试失败')
      wrapped.status = 502
      throw wrapped
    }
  }
}

module.exports = service
