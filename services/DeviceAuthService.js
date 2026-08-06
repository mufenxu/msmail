const crypto = require('crypto')
const store = require('../utils/db')

const pendingFlows = new Map()
const FLOW_LIFETIME_MS = 15 * 60 * 1000
const DEFAULT_INTERVAL_MS = 5 * 1000
const DEVICE_SCOPE = 'openid profile offline_access https://graph.microsoft.com/Mail.Read'

const tenant = () => process.env.MS_TENANT || 'common'
const tokenBase = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`

const serviceError = (status, message) => {
  const error = new Error(message)
  error.status = status
  return error
}

const accountIdOf = (value) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw serviceError(400, '无效的邮箱账号')
  return id
}

const readResponse = async (response) => {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

const cleanupFlows = () => {
  const now = Date.now()
  for (const [flowId, flow] of pendingFlows) {
    if (flow.expiresAt <= now) pendingFlows.delete(flowId)
  }
}

const clearAccountFlows = (accountId) => {
  for (const [flowId, flow] of pendingFlows) {
    if (flow.accountId === accountId) pendingFlows.delete(flowId)
  }
}

const start = async (rawAccountId) => {
  const accountId = accountIdOf(rawAccountId)
  const account = store.getAccountCredentials(accountId)
  if (!account) throw serviceError(404, '邮箱账号不存在')
  if (!account.client_id) throw serviceError(400, '该账号缺少客户端 ID')

  cleanupFlows()
  clearAccountFlows(accountId)

  const response = await fetch(`${tokenBase()}/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: account.client_id,
      scope: DEVICE_SCOPE
    }).toString()
  })
  const data = await readResponse(response)
  if (!response.ok || !data.device_code || !data.user_code || !data.verification_uri) {
    throw serviceError(502, data.error_description || 'Microsoft 授权流程启动失败，请检查客户端 ID 和应用权限')
  }

  const flowId = crypto.randomUUID()
  const intervalMs = Math.max(Number(data.interval || 5) * 1000, DEFAULT_INTERVAL_MS)
  pendingFlows.set(flowId, {
    flowId,
    accountId,
    deviceCode: data.device_code,
    intervalMs,
    nextPollAt: 0,
    expiresAt: Date.now() + Math.min(Number(data.expires_in || 900) * 1000, FLOW_LIFETIME_MS)
  })

  return {
    flow_id: flowId,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete || '',
    user_code: data.user_code,
    expires_in: Math.floor((pendingFlows.get(flowId).expiresAt - Date.now()) / 1000),
    interval: Math.ceil(intervalMs / 1000)
  }
}

const poll = async (rawAccountId, flowId) => {
  const accountId = accountIdOf(rawAccountId)
  cleanupFlows()
  const flow = pendingFlows.get(String(flowId || ''))
  if (!flow || flow.accountId !== accountId) throw serviceError(404, '授权流程不存在或已过期')

  const now = Date.now()
  if (flow.expiresAt <= now) {
    pendingFlows.delete(flow.flowId)
    return { status: 'expired', message: '授权码已过期，请重新开始授权' }
  }
  if (flow.nextPollAt > now) {
    return {
      status: 'pending',
      retry_after: Math.ceil((flow.nextPollAt - now) / 1000)
    }
  }
  flow.nextPollAt = now + flow.intervalMs

  const response = await fetch(`${tokenBase()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: store.getAccountCredentials(accountId)?.client_id || '',
      device_code: flow.deviceCode
    }).toString()
  })
  const data = await readResponse(response)

  if (response.ok && data.refresh_token) {
    const account = store.getAccountCredentials(accountId)
    if (!account) {
      pendingFlows.delete(flow.flowId)
      throw serviceError(404, '邮箱账号不存在')
    }
    store.upsertAccount({
      id: account.id,
      email: account.email,
      client_id: account.client_id,
      refresh_token: data.refresh_token
    })
    store.setRefreshTokenState(account.id, 'active')
    pendingFlows.delete(flow.flowId)
    return { status: 'completed', account_id: account.id, email: account.email }
  }

  if (response.ok && !data.refresh_token) {
    pendingFlows.delete(flow.flowId)
    return {
      status: 'failed',
      message: 'Microsoft 没有返回刷新令牌，请确认应用请求了 offline_access 权限'
    }
  }

  if (data.error === 'authorization_pending') {
    return { status: 'pending', retry_after: Math.ceil(flow.intervalMs / 1000) }
  }
  if (data.error === 'slow_down') {
    flow.intervalMs += 5000
    return { status: 'pending', retry_after: Math.ceil(flow.intervalMs / 1000) }
  }
  if (data.error === 'expired_token') {
    pendingFlows.delete(flow.flowId)
    return { status: 'expired', message: '授权码已过期，请重新开始授权' }
  }
  if (data.error === 'authorization_declined' || data.error === 'access_denied') {
    pendingFlows.delete(flow.flowId)
    return { status: 'failed', message: 'Microsoft 账号拒绝了本次授权' }
  }

  pendingFlows.delete(flow.flowId)
  return {
    status: 'failed',
    message: data.error_description || 'Microsoft 授权失败，请检查应用权限和账号类型'
  }
}

const cancel = (rawAccountId, flowId) => {
  const accountId = accountIdOf(rawAccountId)
  const flow = pendingFlows.get(String(flowId || ''))
  if (flow && flow.accountId === accountId) pendingFlows.delete(flow.flowId)
  return { status: 'cancelled' }
}

module.exports = { start, poll, cancel }
