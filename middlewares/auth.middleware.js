const crypto = require('node:crypto')

const cookieName = 'monkey_mail_session'
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000

const expectedPassword = () => process.env.PASSWORD?.trim() || ''
const sessionSecret = () => `${process.env.SESSION_SECRET?.trim() || 'monkey-mail-session'}:${expectedPassword()}`

const loginAttempts = new Map()
const maxLoginAttempts = 5
const loginWindowMs = 15 * 60 * 1000

const safeEqual = (left, right) => {
  const leftBuffer = crypto.createHash('sha256').update(String(left || '')).digest()
  const rightBuffer = crypto.createHash('sha256').update(String(right || '')).digest()
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const sign = (payload) => crypto
  .createHmac('sha256', sessionSecret())
  .update(payload)
  .digest('base64url')

const createToken = () => {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + sessionLifetimeMs,
    nonce: crypto.randomBytes(12).toString('base64url')
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

const validateToken = (token) => {
  if (!token || !sessionSecret()) return false
  const [payload, signature] = String(token).split('.')
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number(data.exp) > Date.now()
  } catch {
    return false
  }
}

const cookieOptions = (ctx) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production' || ctx.get('x-forwarded-proto') === 'https',
  overwrite: true,
  maxAge: sessionLifetimeMs
})

const login = async (ctx) => {
  const configured = expectedPassword()
  if (!configured) ctx.throw(503, '服务尚未配置访问密码')
  const now = Date.now()
  const previous = loginAttempts.get(ctx.ip)
  const attempt = previous && now - previous.started_at < loginWindowMs
    ? previous
    : { count: 0, started_at: now }
  if (attempt.count >= maxLoginAttempts) ctx.throw(429, '登录尝试次数过多，请稍后再试')
  if (!safeEqual(ctx.request.body?.password, configured)) {
    loginAttempts.set(ctx.ip, { ...attempt, count: attempt.count + 1 })
    ctx.throw(401, '访问密码错误')
  }
  loginAttempts.delete(ctx.ip)
  ctx.cookies.set(cookieName, createToken(), cookieOptions(ctx))
  ctx.body = { code: 200, data: { authenticated: true } }
}

const logout = async (ctx) => {
  ctx.cookies.set(cookieName, '', { ...cookieOptions(ctx), maxAge: 0 })
  ctx.body = { code: 200, data: { authenticated: false } }
}

const status = async (ctx) => {
  ctx.body = {
    code: 200,
    data: {
      configured: Boolean(expectedPassword()),
      authenticated: validateToken(ctx.cookies.get(cookieName))
    }
  }
}

const authPasswordMiddleware = async (ctx, next) => {
  if (!expectedPassword()) ctx.throw(503, '服务尚未配置访问密码')
  if (!validateToken(ctx.cookies.get(cookieName))) ctx.throw(401, '登录状态已失效，请重新输入访问密码')
  await next()
}

module.exports = {
  login,
  logout,
  status,
  authPasswordMiddleware
}
