const mailService = require('../services/api')
const syncService = require('../services/SyncService')

const controller = {
  async sync(ctx) {
    const { account_id: accountId, mailbox, socks5, http } = ctx.request.body || {}
    if (accountId == null) ctx.throw(400, '缺少 account_id')
    const data = await syncService.syncAccount(accountId, mailbox, { socks5, http })
    ctx.body = { code: 200, data }
  },

  async syncAll(ctx) {
    const body = ctx.request.body || {}
    const mailboxes = body.mailbox ? [syncService.normalizeMailbox(body.mailbox)] : ['INBOX', 'Junk']
    const results = await syncService.syncAll({ mailboxes })
    ctx.body = {
      code: 200,
      data: {
        results,
        succeeded: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length
      }
    }
  },

  async testProxy(ctx) {
    const { socks5, http } = ctx.request.body || {}
    const data = await mailService.testProxy(socks5, http)
    ctx.body = { code: 200, data }
  }
}

module.exports = controller
