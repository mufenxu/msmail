const PALETTES: Array<[string, string]> = [
  ['#2d7ff9', '#0f5fc0'],
  ['#13b8a6', '#0a8f80'],
  ['#9b5de5', '#6a36c4'],
  ['#f4a340', '#d97b14'],
  ['#e34c6d', '#b82546'],
  ['#3aa76d', '#1f8a55'],
  ['#5b7cfa', '#3b5bd9'],
  ['#c26e9c', '#9c4a76'],
]

const hashOf = (key: string): number => {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash
}

export const avatarStyle = (key: string): string => {
  const palette = PALETTES[hashOf(key || '?') % PALETTES.length]
  const from = palette?.[0] ?? '#0f6cbd'
  const to = palette?.[1] ?? '#4a9fe0'
  return `background:linear-gradient(135deg, ${from}, ${to})`
}

export const senderName = (send: string): string => {
  const trimmed = (send || '').trim()
  if (!trimmed) return '未知发件人'
  const lt = trimmed.indexOf('<')
  if (lt > 0) {
    const display = trimmed.slice(0, lt).trim()
    if (display) return display
  }
  const at = trimmed.lastIndexOf('@')
  return at > 0 ? trimmed.slice(0, at) : trimmed
}

export const senderInitial = (name: string): string => {
  const first = Array.from((name || '').trim())[0]
  return (first || '?').toUpperCase()
}

const pad = (n: number): string => String(n).padStart(2, '0')

export const formatMailDate = (date: string): string => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date || ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000)
  if (diffDays === 0) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (diffDays === 1) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const formatFullDate = (date: string): string => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date || ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const domainLabel = (email: string): string => {
  const lower = (email || '').toLowerCase()
  if (lower.includes('outlook')) return 'Outlook'
  if (lower.includes('hotmail')) return 'Hotmail'
  if (lower.includes('live')) return 'Live'
  const at = lower.lastIndexOf('@')
  return at > 0 ? lower.slice(at + 1) : '邮箱'
}

export const messageKey = (message: { account_id?: number; id?: string; send?: string; date?: string; subject?: string }): string => {
  const id = message.id || `${message.send || ''}|${message.date || ''}|${message.subject || ''}`
  return message.account_id == null ? id : `${message.account_id}:${id}`
}
