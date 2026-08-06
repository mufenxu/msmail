const store = require('../utils/db')
const mailService = require('../services/api')
const { normalizeMailbox } = require('../services/SyncService')

const getBody = (ctx) => ctx.request.body || {}

const requireAccount = (id) => {
  const account = store.getAccountCredentials(id)
  if (!account) {
    const error = new Error('邮箱账号不存在')
    error.status = 404
    throw error
  }
  return account
}

const controller = {
  async list(ctx) {
    ctx.body = { code: '200', data: store.listAccounts() }
  },

  async upsert(ctx) {
    try {
      const body = getBody(ctx)
      const data = store.upsertAccount({
        id: body.id,
        email: body.email,
        client_id: body.client_id,
        refresh_token: body.refresh_token,
        mail_password: body.mail_password
      })
      if (!data) ctx.throw(404, '邮箱账号不存在')
      ctx.body = { code: '200', data }
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        ctx.throw(409, '邮箱地址已经存在')
      }
      ctx.throw(error.status || 400, error.message)
    }
  },

  async password(ctx) {
    const password = store.getAccountMailPassword(ctx.params.id)
    if (password == null) ctx.throw(404, '邮箱账号不存在')
    ctx.body = { code: '200', data: { password } }
  },

  async remove(ctx) {
    if (!store.deleteAccount(ctx.params.id)) {
      ctx.throw(404, '邮箱账号不存在')
    }
    ctx.body = { code: '200', data: true }
  },

  async listMessages(ctx) {
    const account = requireAccount(ctx.params.id)
    const body = getBody(ctx)
    ctx.body = {
      code: '200',
      data: store.listMessages({
        accountId: account.id,
        mailbox: normalizeMailbox(body.mailbox),
        search: body.search,
        limit: body.limit,
        offset: body.offset
      })
    }
  },

  async listUnifiedMessages(ctx) {
    const body = getBody(ctx)
    ctx.body = {
      code: '200',
      data: store.listMessages({
        mailbox: normalizeMailbox(body.mailbox),
        search: body.search,
        limit: body.limit,
        offset: body.offset
      })
    }
  },

  async cacheMessages(ctx) {
    const account = requireAccount(ctx.params.id)
    const body = getBody(ctx)
    store.replaceMessages(account.id, body.mailbox, body.messages)
    ctx.body = { code: '200', data: true }
  },

  async messageBody(ctx) {
    const account = requireAccount(ctx.params.id)
    const body = getBody(ctx)
    const mailbox = normalizeMailbox(body.mailbox)
    let message = store.getMessage(account.id, mailbox, body.id)
    if (!message) ctx.throw(404, '邮件不存在')
    if (!message.body_loaded && message.provider === 'graph') {
      const loaded = await mailService.loadGraphBody(account, mailbox, message.id)
      if (loaded.refresh_token && loaded.refresh_token !== account.refresh_token) {
        store.updateRefreshToken(account.id, loaded.refresh_token)
      }
      store.saveMessageBody(account.id, mailbox, message.id, loaded)
      message = store.getMessage(account.id, mailbox, message.id)
    }
    ctx.body = { code: '200', data: message }
  }
}

module.exports = controller
