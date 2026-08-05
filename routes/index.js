const Router = require("koa-router");
const apiRoutes = require("./api");
const { login, logout, status, authPasswordMiddleware } = require("../middlewares/auth.middleware");

const router = new Router();

// 根路由
router.get("/", async (ctx) => {
  ctx.body = {
    message: `Welcome to ${process.env.API_NAME || "Monkey Mail"}`,
  };
});

router.get("/api/health", async (ctx) => {
  ctx.body = {
    ok: true,
    service: process.env.API_NAME || "Monkey Mail",
  };
});

router.post('/api/session', login)
router.post('/api/session/logout', logout)
router.get('/api/session/status', status)

// API路由
router.use(
  "/api",
  authPasswordMiddleware,
  apiRoutes.routes(),
  apiRoutes.allowedMethods()
);

module.exports = router;
