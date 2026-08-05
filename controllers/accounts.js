const store = require('../utils/db')

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
        refresh_token: body.refresh_token
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
      data: store.listMessages(account.id, body.mailbox)
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
    const message = store.getMessage(account.id, body.mailbox, body.id)
    if (!message) ctx.throw(404, '邮件不存在')
    ctx.body = { code: '200', data: message }
  }
}

module.exports = controller
