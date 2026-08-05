const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const configuredPath = process.env.SQLITE_PATH || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'monkey-mail.sqlite')
const databasePath = path.resolve(configuredPath)
fs.mkdirSync(path.dirname(databasePath), { recursive: true })

const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS mail_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    client_id TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mail_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
    mailbox TEXT NOT NULL CHECK (mailbox IN ('INBOX', 'Junk')),
    message_key TEXT NOT NULL,
    send TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    html TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, mailbox, message_key)
  );

  CREATE INDEX IF NOT EXISTS idx_mail_messages_account_mailbox
    ON mail_messages(account_id, mailbox, date DESC, id DESC);

  CREATE TABLE IF NOT EXISTS mail_sync_state (
    account_id INTEGER NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
    mailbox TEXT NOT NULL CHECK (mailbox IN ('INBOX', 'Junk')),
    last_synced_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (account_id, mailbox)
  );
`)

const encryptionSecret = process.env.DATA_ENCRYPTION_KEY || process.env.PASSWORD || 'monkey-mail-local-development-key'
const encryptionKey = crypto.createHash('sha256').update(encryptionSecret).digest()

const encrypt = (value) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

const decrypt = (value) => {
  if (!value) return ''
  if (!String(value).startsWith('v1:')) return String(value)

  const [ivText, tagText, encryptedText] = String(value).slice(3).split('.')
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(ivText, 'base64')
  )
  decipher.setAuthTag(Buffer.from(tagText, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final()
  ]).toString('utf8')
}

const publicAccount = (row) => ({
  id: row.id,
  email: row.email,
  client_id: row.client_id,
  created_at: row.created_at,
  updated_at: row.updated_at
})

const normalizeMailbox = (mailbox) => mailbox === 'Junk' ? 'Junk' : 'INBOX'

const listAccounts = () => db.prepare(`
  SELECT id, email, client_id, created_at, updated_at
  FROM mail_accounts
  ORDER BY id ASC
`).all().map(publicAccount)

const getAccountCredentials = (id) => {
  const row = db.prepare(`
    SELECT id, email, client_id, refresh_token, created_at, updated_at
    FROM mail_accounts
    WHERE id = ?
  `).get(Number(id))
  if (!row) return null
  return { ...publicAccount(row), refresh_token: decrypt(row.refresh_token) }
}

const upsertAccount = ({ id, email, client_id, refresh_token }) => {
  const normalizedEmail = String(email || '').trim()
  const normalizedClientId = String(client_id || '').trim()
  const normalizedRefreshToken = refresh_token == null ? null : String(refresh_token).trim()

  if (!normalizedEmail || !normalizedClientId || (id == null && !normalizedRefreshToken)) {
    throw new Error('邮箱、客户端 ID 和刷新令牌不能为空')
  }

  if (id != null) {
    const result = db.prepare(`
      UPDATE mail_accounts
      SET email = ?, client_id = ?,
          refresh_token = COALESCE(?, refresh_token),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalizedEmail,
      normalizedClientId,
      normalizedRefreshToken ? encrypt(normalizedRefreshToken) : null,
      Number(id)
    )
    if (result.changes === 0) return null
    return publicAccount(db.prepare('SELECT * FROM mail_accounts WHERE id = ?').get(Number(id)))
  }

  db.prepare(`
    INSERT INTO mail_accounts (email, client_id, refresh_token)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      client_id = excluded.client_id,
      refresh_token = excluded.refresh_token,
      updated_at = datetime('now')
  `).run(normalizedEmail, normalizedClientId, encrypt(normalizedRefreshToken))

  return publicAccount(db.prepare('SELECT * FROM mail_accounts WHERE email = ?').get(normalizedEmail))
}

const deleteAccount = (id) => db.prepare('DELETE FROM mail_accounts WHERE id = ?').run(Number(id)).changes > 0

const messageKey = (message, index) => {
  if (message.id != null && String(message.id).trim()) return String(message.id).trim()
  return crypto.createHash('sha256').update(JSON.stringify([
    message.send || '',
    message.subject || '',
    message.date || '',
    message.text || '',
    index
  ])).digest('hex')
}

const saveMessages = (accountId, mailbox, messages, replace = false) => {
  const normalizedMailbox = normalizeMailbox(mailbox)
  const insert = db.prepare(`
    INSERT INTO mail_messages
      (account_id, mailbox, message_key, send, subject, text, html, date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(account_id, mailbox, message_key) DO UPDATE SET
      send = excluded.send,
      subject = excluded.subject,
      text = excluded.text,
      html = excluded.html,
      date = excluded.date,
      updated_at = datetime('now')
  `)
  const transaction = db.transaction((items) => {
    if (replace) {
      db.prepare('DELETE FROM mail_messages WHERE account_id = ? AND mailbox = ?')
        .run(Number(accountId), normalizedMailbox)
    }
    items.forEach((message, index) => {
      insert.run(
        Number(accountId),
        normalizedMailbox,
        messageKey(message, index),
        String(message.send || ''),
        String(message.subject || ''),
        String(message.text || ''),
        String(message.html || ''),
        message.date ? new Date(message.date).toISOString() : ''
      )
    })
  })
  transaction(Array.isArray(messages) ? messages : [])
}

const replaceMessages = (accountId, mailbox, messages) => saveMessages(accountId, mailbox, messages, true)

const listMessages = (accountId, mailbox) => db.prepare(`
  SELECT message_key AS id, send, subject, substr(text, 1, 300) AS text, date
  FROM mail_messages
  WHERE account_id = ? AND mailbox = ?
  ORDER BY date DESC, id DESC
`).all(Number(accountId), normalizeMailbox(mailbox))

const getMessage = (accountId, mailbox, messageKeyValue) => db.prepare(`
  SELECT message_key AS id, send, subject, text, html, date
  FROM mail_messages
  WHERE account_id = ? AND mailbox = ? AND message_key = ?
`).get(Number(accountId), normalizeMailbox(mailbox), String(messageKeyValue || '')) || null

const getSyncState = (accountId, mailbox) => {
  const row = db.prepare(`
    SELECT last_synced_at
    FROM mail_sync_state
    WHERE account_id = ? AND mailbox = ?
  `).get(Number(accountId), normalizeMailbox(mailbox))
  return row?.last_synced_at || ''
}

const setSyncState = (accountId, mailbox, lastSyncedAt) => {
  db.prepare(`
    INSERT INTO mail_sync_state (account_id, mailbox, last_synced_at)
    VALUES (?, ?, ?)
    ON CONFLICT(account_id, mailbox) DO UPDATE SET last_synced_at = excluded.last_synced_at
  `).run(Number(accountId), normalizeMailbox(mailbox), String(lastSyncedAt || ''))
}

const close = () => {
  if (db.open) db.close()
}

module.exports = {
  databasePath,
  listAccounts,
  getAccountCredentials,
  upsertAccount,
  deleteAccount,
  replaceMessages,
  saveMessages,
  listMessages,
  getMessage,
  getSyncState,
  setSyncState,
  close
}
