const service = require('../services/api')
const logger = require('../utils/logger')
const store = require('../utils/db')

const getMailRequest = (ctx) => ctx.method === 'GET' ? ctx.query : ctx.request.body

const resolveAccount = (request) => {
  if (request.account_id != null) {
    const account = store.getAccountCredentials(request.account_id)
    if (!account) {
      const error = new Error('邮箱账号不存在')
      error.status = 404
      throw error
    }
    return account
  }

  if (!request.refresh_token || !request.client_id || !request.email || !request.mailbox) {
    const error = new Error('缺少邮箱收取参数')
    error.status = 400
    throw error
  }

  return request
}

const controller = {
  async mail_all(ctx) {
    try {
      const request = getMailRequest(ctx)
      const account = resolveAccount(request)
      const since = account.id ? store.getSyncState(account.id, request.mailbox) : ''
      const syncStartedAt = new Date().toISOString()
      const data = await service.mail_all(account.refresh_token, account.client_id, account.email, request.mailbox, request.socks5, request.http, since)
      if (account.id) {
        if (Array.isArray(data) && data.length > 0) {
          store.saveMessages(account.id, request.mailbox, data)
        }
        store.setSyncState(account.id, request.mailbox, syncStartedAt)
        ctx.body = { code: "200", data: store.listMessages(account.id, request.mailbox) }
      } else {
        ctx.body = { code: "200", data }
      }
    } catch (err) {
      logger.error('Failed to mail_all', err)
      ctx.throw(500, err.message || 'Failed to mail_all')
    }
  },

  async mail_new(ctx) {
    try {
      const request = getMailRequest(ctx)
      const account = resolveAccount(request)
      const data = await service.mail_new(account.refresh_token, account.client_id, account.email, request.mailbox, request.socks5, request.http)
      if (account.id) store.saveMessages(account.id, request.mailbox, data)
      ctx.body = { code: "200", data }
    } catch (err) {
      logger.error('Failed to mail_new', err)
      ctx.throw(500, err.message || 'Failed to mail_new')
    }
  },

  async test_proxy(ctx) {
    try {
      const { socks5, http } = ctx.method === "GET" ? ctx.query : ctx.request.body;
      const data = await service.test_proxy(socks5, http)
      ctx.body = { code: "200", data }
    } catch (err) {
      logger.error('Failed to test_proxy', err)
      ctx.throw(500, 'Failed to test_proxy')
    }
  },
}

module.exports = controller
