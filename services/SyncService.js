const logger = require('../utils/logger')
const store = require('../utils/db')
const mailService = require('./api')
const tokenService = require('./TokenService')

const normalizeMailbox = (mailbox) => {
  if (mailbox !== 'INBOX' && mailbox !== 'Junk') {
    const error = new Error('mailbox 仅支持 INBOX 或 Junk')
    error.status = 400
    throw error
  }
  return mailbox
}

const syncAccount = async (accountId, mailbox, options = {}) => {
  const normalizedMailbox = normalizeMailbox(mailbox)
  const account = store.getAccountCredentials(accountId)
  if (!account) {
    const error = new Error('邮箱账号不存在')
    error.status = 404
    throw error
  }
  const state = store.getSyncState(account.id, normalizedMailbox)

  try {
    const result = await mailService.syncMailbox(
      account,
      normalizedMailbox,
      state,
      options.socks5,
      options.http
    )
    if (result.refresh_token && result.refresh_token !== account.refresh_token) {
      store.updateRefreshToken(account.id, result.refresh_token)
    }
    store.saveMessages(account.id, normalizedMailbox, result.messages)
    store.deleteMessages(account.id, normalizedMailbox, result.removed)
    const syncedAt = new Date().toISOString()
    store.setSyncState(account.id, normalizedMailbox, {
      last_synced_at: syncedAt,
      sync_cursor: result.cursor,
      last_error: '',
      provider: result.provider
    })
    const page = store.listMessages({ accountId: account.id, mailbox: normalizedMailbox, limit: 1 })
    return {
      account_id: account.id,
      email: account.email,
      mailbox: normalizedMailbox,
      provider: result.provider,
      synced_at: syncedAt,
      received: result.messages.length,
      total: page.total
    }
  } catch (error) {
    store.setSyncState(account.id, normalizedMailbox, {
      last_error: error.message || '同步失败'
    })
    throw error
  }
}

const mapLimit = async (items, limit, worker) => {
  const results = new Array(items.length)
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current])
    }
  })
  await Promise.all(runners)
  return results
}

const syncAll = async ({ mailboxes = ['INBOX', 'Junk'], concurrency = 3 } = {}) => {
  const accounts = store.listAccountCredentials()
  const jobs = accounts.flatMap((account) => mailboxes.map((mailbox) => ({ account, mailbox: normalizeMailbox(mailbox) })))
  return mapLimit(jobs, Math.min(Math.max(Number(concurrency) || 3, 1), 5), async ({ account, mailbox }) => {
    try {
      return { ok: true, ...(await syncAccount(account.id, mailbox)) }
    } catch (error) {
      return {
        ok: false,
        account_id: account.id,
        email: account.email,
        mailbox,
        error: error.message || '同步失败'
      }
    }
  })
}

let scheduler = null
let schedulerRunning = false
let tokenScheduler = null
let tokenSchedulerRunning = false

const runTokenRefresh = async () => {
  if (tokenSchedulerRunning) return
  tokenSchedulerRunning = true
  try {
    const results = await tokenService.refreshAllTokens()
    const failed = results.filter((result) => !result.ok).length
    logger.info(`Scheduled token refresh completed: ${results.length - failed} succeeded, ${failed} failed`)
  } catch (error) {
    logger.error('Scheduled token refresh failed', error)
  } finally {
    tokenSchedulerRunning = false
  }
}

const startTokenScheduler = () => {
  const configuredMinutes = process.env.TOKEN_REFRESH_INTERVAL_MINUTES
  const minutes = configuredMinutes == null || configuredMinutes === ''
    ? 720
    : Number(configuredMinutes)
  if (!Number.isFinite(minutes) || minutes <= 0 || tokenScheduler) return
  tokenScheduler = setInterval(runTokenRefresh, minutes * 60 * 1000)
  tokenScheduler.unref()
  logger.info(`Scheduled token refresh enabled: every ${minutes} minute(s)`)
  void runTokenRefresh()
}

const startScheduler = () => {
  startTokenScheduler()
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES || 0)
  if (!Number.isFinite(minutes) || minutes <= 0 || scheduler) return
  scheduler = setInterval(async () => {
    if (schedulerRunning) return
    schedulerRunning = true
    try {
      const results = await syncAll()
      const failed = results.filter((result) => !result.ok).length
      logger.info(`Scheduled mailbox sync completed: ${results.length - failed} succeeded, ${failed} failed`)
    } catch (error) {
      logger.error('Scheduled mailbox sync failed', error)
    } finally {
      schedulerRunning = false
    }
  }, minutes * 60 * 1000)
  scheduler.unref()
  logger.info(`Scheduled mailbox sync enabled: every ${minutes} minute(s)`)
}

module.exports = {
  normalizeMailbox,
  syncAccount,
  syncAll,
  startScheduler
}
