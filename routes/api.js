const Router = require('koa-router')
const controller = require('../controllers/api')
const accountController = require('../controllers/accounts')

const router = new Router({
  prefix: '' 
})

router.post('/accounts/list', accountController.list)
router.post('/accounts', accountController.upsert)
router.put('/accounts/:id', accountController.upsert)
router.delete('/accounts/:id', accountController.remove)
router.post('/accounts/:id/delete', accountController.remove)
router.post('/accounts/:id/messages/list', accountController.listMessages)
router.post('/accounts/:id/messages/cache', accountController.cacheMessages)
router.all('/mail_all', controller.mail_all)
router.all('/mail_new', controller.mail_new)
router.all('/test-proxy', controller.test_proxy)

module.exports = router
