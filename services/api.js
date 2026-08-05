const logger = require('../utils/logger')
const { use_graph_api, use_get_graph_emails, use_imap_api, generateAuthString, use_get_imap_emails, use_test_proxy } = require('../services/MailService')

const createMailError = (err) => {
  const message = err?.message || ''
  const authFailure = message.includes('AADSTS') || /HTTP error! status: (400|401|403)/.test(message)
  const publicMessage = authFailure
    ? 'Microsoft OAuth 授权失败，请检查 refresh_token、client_id 及邮箱读取权限。'
    : 'Microsoft 邮箱服务暂时不可用，请稍后重试。'
  const wrappedError = new Error(publicMessage)
  wrappedError.cause = err
  return wrappedError
}

const service = {
  async mail_all(refresh_token, client_id, email, mailbox, socks5, http) {
    try {

      const graph_api_result = await use_graph_api(refresh_token, client_id, mailbox, email, socks5, http)

      if (graph_api_result.status) {
        const graph_emails = await use_get_graph_emails(graph_api_result, undefined, email, socks5, http)
        return graph_emails
      }

      const imap_api_result = await use_imap_api(refresh_token, client_id, email, socks5, http)
      const authString = generateAuthString(email, imap_api_result.access_token)
      const imap_emails = await use_get_imap_emails(email, authString, mailbox, undefined, socks5, http)

      return imap_emails
    } catch (err) {
      logger.error('Service error when mail_all', err)
      throw createMailError(err)
    }
  },

  async mail_new(refresh_token, client_id, email, mailbox, socks5, http) {
    try {

      const graph_api_result = await use_graph_api(refresh_token, client_id, mailbox, email, socks5, http)

      if (graph_api_result.status) {
        const graph_emails = await use_get_graph_emails(graph_api_result, 1, email, socks5, http)
        return graph_emails
      }

      const imap_api_result = await use_imap_api(refresh_token, client_id, email, socks5, http)
      const authString = generateAuthString(email, imap_api_result.access_token)
      const imap_emails = await use_get_imap_emails(email, authString, mailbox, 1, socks5, http)

      return imap_emails
    } catch (err) {
      logger.error('Service error when mail_new', err)
      throw createMailError(err)
    }
  },

  async test_proxy(socks5, http) {
    try {
      const data = await use_test_proxy(socks5, http)
      return data
    } catch (err) {
      logger.error('Service error when test_proxy', err)
      throw new Error('Failed to test_proxy')
    }
  },
}

module.exports = service
