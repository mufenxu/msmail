export interface Account {
  id?: number
  email: string
  client_id: string
  refresh_token?: string
  created_at?: string
  updated_at?: string
}

export interface Message {
  id?: string
  send: string
  subject: string
  text: string
  html: string
  date: string
}

export type Mailbox = 'INBOX' | 'Junk'

export interface MailboxCounts {
  INBOX: number | null
  Junk: number | null
}
