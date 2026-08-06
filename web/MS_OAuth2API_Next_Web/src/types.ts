export interface Account {
  id?: number
  email: string
  client_id: string
  refresh_token?: string
  has_mail_password?: boolean
  token_status?: 'unknown' | 'active' | 'reauth_required' | 'error'
  token_last_refreshed_at?: string
  token_last_error?: string
  created_at?: string
  updated_at?: string
  sync?: Partial<Record<Mailbox, AccountSyncState>>
  counts?: Partial<Record<Mailbox, number>>
}

export interface AccountSyncState {
  last_synced_at: string
  last_error: string
  provider: string
}

export interface Message {
  id?: string
  send: string
  subject: string
  text: string
  html: string
  date: string
  account_id?: number
  account_email?: string
  provider?: string
  body_loaded?: boolean | number
}

export interface MessagePage {
  items: Message[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

export type Mailbox = 'INBOX' | 'Junk'

export interface MailboxCounts {
  INBOX: number | null
  Junk: number | null
}
