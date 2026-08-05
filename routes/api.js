const Router = require('koa-router')
const controller = require('../controllers/api')
const accountController = require('../controllers/accounts')

const router = new Router()

router.post('/accounts/list', accountController.list)
router.post('/accounts', accountController.upsert)
router.put('/accounts/:id', accountController.upsert)
router.delete('/accounts/:id', accountController.remove)
router.post('/accounts/:id/delete', accountController.remove)
router.post('/accounts/:id/messages/list', accountController.listMessages)
router.post('/accounts/:id/messages/cache', accountController.cacheMessages)
router.post('/accounts/:id/messages/body', accountController.messageBody)
router.post('/messages/list', accountController.listUnifiedMessages)
router.post('/sync', controller.sync)
router.post('/sync/all', controller.syncAll)
router.post('/test-proxy', controller.testProxy)

module.exports = router
