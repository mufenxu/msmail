const store = require('../utils/db')
const {
  requestToken,
  GRAPH_SCOPE,
  IMAP_SCOPE,
  isTransientServiceError,
  isAuthError
} = require('./MailService')

const refreshLocks = new Map()
// Access tokens stay in memory only; rotated refresh tokens remain encrypted in SQLite.
const accessTokenCache = new Map()
const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000

const accountKey = (account) => String(account.id ?? account.email)
const tokenCacheKey = (account, scope) => `${accountKey(account)}:${scope}`
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const getCurrentAccount = (account) => account.id == null
  ? account
  : store.getAccountCredentials(account.id)

const getCachedToken = (key, refreshToken) => {
  const cached = accessTokenCache.get(key)
  if (!cached || cached.refreshToken !== refreshToken || cached.expiresAt <= Date.now() + ACCESS_TOKEN_SKEW_MS) {
    if (cached) accessTokenCache.delete(key)
    return null
  }
  return {
    access_token: cached.accessToken,
    refresh_token: cached.refreshToken,
    expires_in: Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000))
  }
}

const refreshAccountToken = async (account, scope, socks5, http) => {
  const current = getCurrentAccount(account)
  if (!current || !current.refresh_token) {
    const error = new Error('Account refresh token is unavailable')
    error.status = 401
    throw error
  }

  const cacheKey = tokenCacheKey(current, scope)
  const cached = getCachedToken(cacheKey, current.refresh_token)
  if (cached) return cached

  const lockKey = tokenCacheKey(current, scope)
  if (refreshLocks.has(lockKey)) return refreshLocks.get(lockKey)

  const task = (async () => {
    const latest = getCurrentAccount(account)
    if (!latest || !latest.refresh_token) {
      const error = new Error('Account refresh token is unavailable')
      error.status = 401
      throw error
    }
    const latestCacheKey = tokenCacheKey(latest, scope)
    const latestCached = getCachedToken(latestCacheKey, latest.refresh_token)
    if (latestCached) return latestCached

    try {
      const data = await requestToken(latest.refresh_token, latest.client_id, scope, socks5, http)
      if (!data?.access_token) {
        const error = new Error('Microsoft token response did not include access_token')
        error.status = 502
        throw error
      }

      const nextRefreshToken = data.refresh_token || latest.refresh_token
      if (latest.id != null && nextRefreshToken !== latest.refresh_token) {
        if (!store.updateRefreshToken(latest.id, nextRefreshToken)) {
          const error = new Error('Mailbox account no longer exists')
          error.status = 404
          throw error
        }
      }
      const lifetimeSeconds = Number(data.expires_in)
      const expiresAt = Date.now() + (Number.isFinite(lifetimeSeconds) && lifetimeSeconds > 0
        ? lifetimeSeconds
        : 3600) * 1000
      accessTokenCache.set(latestCacheKey, {
        accessToken: data.access_token,
        refreshToken: nextRefreshToken,
        expiresAt
      })
      if (latest.id != null) store.setRefreshTokenState(latest.id, 'active')

      return { ...data, refresh_token: nextRefreshToken }
    } catch (error) {
      accessTokenCache.delete(latestCacheKey)
      if (latest.id != null) {
        store.setRefreshTokenState(
          latest.id,
          isAuthError(error) ? 'reauth_required' : 'error',
          error.message
        )
      }
      throw error
    }
  })()

  refreshLocks.set(lockKey, task)
  try {
    return await task
  } finally {
    if (refreshLocks.get(lockKey) === task) refreshLocks.delete(lockKey)
  }
}

const refreshAccount = async (account, socks5, http) => {
  try {
    return { ...(await refreshAccountToken(account, GRAPH_SCOPE, socks5, http)), provider: 'graph' }
  } catch (graphError) {
    if (isTransientServiceError(graphError)) throw graphError
    try {
      return { ...(await refreshAccountToken(account, IMAP_SCOPE, socks5, http)), provider: 'imap' }
    } catch (imapError) {
      imapError.graph_error = graphError.message
      throw imapError
    }
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

const refreshAllTokens = async ({ concurrency = 3, jitterMinutes = 30 } = {}) => {
  const accounts = store.listAccountCredentials()
  return mapLimit(accounts, Math.min(Math.max(Number(concurrency) || 3, 1), 5), async (account) => {
    try {
      const jitter = Math.max(0, Number(jitterMinutes) || 0) * 60 * 1000
      if (jitter > 0) await wait(Math.floor(Math.random() * jitter))
      const result = await refreshAccount(account)
      return {
        ok: true,
        account_id: account.id,
        email: account.email,
        provider: result.provider,
        refreshed_at: new Date().toISOString()
      }
    } catch (error) {
      return {
        ok: false,
        account_id: account.id,
        email: account.email,
        error: error.message || 'Token refresh failed'
      }
    }
  })
}

module.exports = {
  refreshAccountToken,
  refreshAccount,
  refreshAllTokens
}
