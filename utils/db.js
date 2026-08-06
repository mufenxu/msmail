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
    mail_password TEXT,
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
    provider TEXT NOT NULL DEFAULT 'legacy',
    body_loaded INTEGER NOT NULL DEFAULT 1,
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
    sync_cursor TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (account_id, mailbox)
  );
`)

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

ensureColumn('mail_messages', 'provider', "TEXT NOT NULL DEFAULT 'legacy'")
ensureColumn('mail_messages', 'body_loaded', 'INTEGER NOT NULL DEFAULT 1')
ensureColumn('mail_accounts', 'mail_password', 'TEXT')
ensureColumn('mail_sync_state', 'sync_cursor', "TEXT NOT NULL DEFAULT ''")
ensureColumn('mail_sync_state', 'last_error', "TEXT NOT NULL DEFAULT ''")
ensureColumn('mail_sync_state', 'provider', "TEXT NOT NULL DEFAULT ''")

const encryptionSecrets = [
  process.env.DATA_ENCRYPTION_KEY,
  process.env.PASSWORD,
  'monkey-mail-local-development-key'
].filter((value, index, items) => value && items.indexOf(value) === index)
const encryptionKey = crypto.createHash('sha256').update(encryptionSecrets[0]).digest()

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
  let lastError
  for (const secret of encryptionSecrets) {
    try {
      const key = crypto.createHash('sha256').update(secret).digest()
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'))
      decipher.setAuthTag(Buffer.from(tagText, 'base64'))
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64')),
        decipher.final()
      ]).toString('utf8')
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

const publicAccount = (row) => ({
  id: row.id,
  email: row.email,
  client_id: row.client_id,
  has_mail_password: Boolean(row.mail_password),
  created_at: row.created_at,
  updated_at: row.updated_at
})

const normalizeMailbox = (mailbox) => mailbox === 'Junk' ? 'Junk' : 'INBOX'

const listAccounts = () => {
  const accounts = db.prepare(`
  SELECT id, email, client_id, mail_password, created_at, updated_at
  FROM mail_accounts
  ORDER BY id ASC
  `).all().map(publicAccount)
  const states = db.prepare(`
    SELECT account_id, mailbox, last_synced_at, last_error, provider
    FROM mail_sync_state
  `).all()
  const counts = db.prepare(`
    SELECT account_id, mailbox, COUNT(*) AS count
    FROM mail_messages
    GROUP BY account_id, mailbox
  `).all()

  return accounts.map((account) => ({
    ...account,
    sync: Object.fromEntries(
      states
        .filter((state) => state.account_id === account.id)
        .map((state) => [state.mailbox, {
          last_synced_at: state.last_synced_at,
          last_error: state.last_error,
          provider: state.provider
        }])
    ),
    counts: Object.fromEntries(
      counts
        .filter((item) => item.account_id === account.id)
        .map((item) => [item.mailbox, item.count])
    )
  }))
}

const listAccountCredentials = () => db.prepare(`
  SELECT id, email, client_id, refresh_token, mail_password, created_at, updated_at
  FROM mail_accounts
  ORDER BY id ASC
`).all().map((row) => ({ ...publicAccount(row), refresh_token: decrypt(row.refresh_token) }))

const getAccountCredentials = (id) => {
  const row = db.prepare(`
    SELECT id, email, client_id, refresh_token, mail_password, created_at, updated_at
    FROM mail_accounts
    WHERE id = ?
  `).get(Number(id))
  if (!row) return null
  return { ...publicAccount(row), refresh_token: decrypt(row.refresh_token) }
}

const getAccountMailPassword = (id) => {
  const row = db.prepare(`
    SELECT mail_password
    FROM mail_accounts
    WHERE id = ?
  `).get(Number(id))
  return row ? decrypt(row.mail_password) : null
}

const upsertAccount = ({ id, email, client_id, refresh_token, mail_password }) => {
  const normalizedEmail = String(email || '').trim()
  const normalizedClientId = String(client_id || '').trim()
  const normalizedRefreshToken = refresh_token == null ? null : String(refresh_token).trim()
  const normalizedMailPassword = mail_password == null ? null : String(mail_password).trim()

  if (!normalizedEmail || !normalizedClientId || (id == null && !normalizedRefreshToken)) {
    throw new Error('邮箱、客户端 ID 和刷新令牌不能为空')
  }

  if (id != null) {
    const result = db.prepare(`
      UPDATE mail_accounts
      SET email = ?, client_id = ?,
          refresh_token = COALESCE(?, refresh_token),
          mail_password = COALESCE(?, mail_password),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalizedEmail,
      normalizedClientId,
      normalizedRefreshToken ? encrypt(normalizedRefreshToken) : null,
      normalizedMailPassword ? encrypt(normalizedMailPassword) : null,
      Number(id)
    )
    if (result.changes === 0) return null
    return publicAccount(db.prepare('SELECT * FROM mail_accounts WHERE id = ?').get(Number(id)))
  }

  db.prepare(`
    INSERT INTO mail_accounts (email, client_id, refresh_token, mail_password)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      client_id = excluded.client_id,
      refresh_token = excluded.refresh_token,
      mail_password = COALESCE(excluded.mail_password, mail_accounts.mail_password),
      updated_at = datetime('now')
  `).run(
    normalizedEmail,
    normalizedClientId,
    encrypt(normalizedRefreshToken),
    normalizedMailPassword ? encrypt(normalizedMailPassword) : null
  )

  return publicAccount(db.prepare('SELECT * FROM mail_accounts WHERE email = ?').get(normalizedEmail))
}

const deleteAccount = (id) => db.prepare('DELETE FROM mail_accounts WHERE id = ?').run(Number(id)).changes > 0

const updateRefreshToken = (id, refreshToken) => {
  if (!refreshToken) return false
  return db.prepare(`
    UPDATE mail_accounts
    SET refresh_token = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(encrypt(String(refreshToken)), Number(id)).changes > 0
}

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
      (account_id, mailbox, message_key, send, subject, text, html, date, provider, body_loaded, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(account_id, mailbox, message_key) DO UPDATE SET
      send = excluded.send,
      subject = excluded.subject,
      text = CASE WHEN mail_messages.body_loaded = 1 AND excluded.body_loaded = 0 THEN mail_messages.text ELSE excluded.text END,
      html = CASE WHEN mail_messages.body_loaded = 1 AND excluded.body_loaded = 0 THEN mail_messages.html ELSE excluded.html END,
      date = excluded.date,
      provider = excluded.provider,
      body_loaded = MAX(mail_messages.body_loaded, excluded.body_loaded),
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
        message.date && !Number.isNaN(new Date(message.date).getTime()) ? new Date(message.date).toISOString() : '',
        String(message.provider || 'legacy'),
        message.body_loaded === false ? 0 : 1
      )
    })
  })
  transaction(Array.isArray(messages) ? messages : [])
}

const replaceMessages = (accountId, mailbox, messages) => saveMessages(accountId, mailbox, messages, true)

const deleteMessages = (accountId, mailbox, messageKeys) => {
  const keys = Array.isArray(messageKeys) ? messageKeys.filter(Boolean) : []
  if (!keys.length) return 0
  const remove = db.prepare(`
    DELETE FROM mail_messages
    WHERE account_id = ? AND mailbox = ? AND message_key = ?
  `)
  return db.transaction((items) => items.reduce(
    (total, key) => total + remove.run(Number(accountId), normalizeMailbox(mailbox), String(key)).changes,
    0
  ))(keys)
}

const listMessages = ({ accountId = null, mailbox, search = '', limit = 100, offset = 0 }) => {
  const normalizedMailbox = normalizeMailbox(mailbox)
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200)
  const normalizedOffset = Math.max(Number(offset) || 0, 0)
  const keyword = String(search || '').trim()
  const filters = ['m.mailbox = ?']
  const params = [normalizedMailbox]

  if (accountId != null) {
    filters.push('m.account_id = ?')
    params.push(Number(accountId))
  }
  if (keyword) {
    filters.push("(m.send LIKE ? ESCAPE '\\' OR m.subject LIKE ? ESCAPE '\\' OR m.text LIKE ? ESCAPE '\\')")
    const escaped = keyword.replace(/[\\%_]/g, '\\$&')
    params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`)
  }

  const where = filters.join(' AND ')
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM mail_messages m
    WHERE ${where}
  `).get(...params).count
  const items = db.prepare(`
    SELECT m.message_key AS id, m.account_id, a.email AS account_email,
           m.send, m.subject, substr(m.text, 1, 300) AS text, m.date,
           m.provider, m.body_loaded = 1 AS body_loaded
    FROM mail_messages m
    JOIN mail_accounts a ON a.id = m.account_id
    WHERE ${where}
    ORDER BY m.date DESC, m.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, normalizedLimit, normalizedOffset)

  return {
    items,
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    has_more: normalizedOffset + items.length < total
  }
}

const getMessage = (accountId, mailbox, messageKeyValue) => db.prepare(`
  SELECT message_key AS id, account_id, mailbox, send, subject, text, html, date,
         provider, body_loaded = 1 AS body_loaded
  FROM mail_messages
  WHERE account_id = ? AND mailbox = ? AND message_key = ?
`).get(Number(accountId), normalizeMailbox(mailbox), String(messageKeyValue || '')) || null

const saveMessageBody = (accountId, mailbox, messageKeyValue, { text = '', html = '' }) => db.prepare(`
  UPDATE mail_messages
  SET text = ?, html = ?, body_loaded = 1, updated_at = datetime('now')
  WHERE account_id = ? AND mailbox = ? AND message_key = ?
`).run(
  String(text || ''),
  String(html || ''),
  Number(accountId),
  normalizeMailbox(mailbox),
  String(messageKeyValue || '')
).changes > 0

const getSyncState = (accountId, mailbox) => {
  return db.prepare(`
    SELECT last_synced_at, sync_cursor, last_error, provider
    FROM mail_sync_state
    WHERE account_id = ? AND mailbox = ?
  `).get(Number(accountId), normalizeMailbox(mailbox))
    || { last_synced_at: '', sync_cursor: '', last_error: '', provider: '' }
}

const setSyncState = (accountId, mailbox, state = {}) => {
  const current = getSyncState(accountId, mailbox)
  db.prepare(`
    INSERT INTO mail_sync_state (account_id, mailbox, last_synced_at, sync_cursor, last_error, provider)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, mailbox) DO UPDATE SET
      last_synced_at = excluded.last_synced_at,
      sync_cursor = excluded.sync_cursor,
      last_error = excluded.last_error,
      provider = excluded.provider
  `).run(
    Number(accountId),
    normalizeMailbox(mailbox),
    String(state.last_synced_at ?? current.last_synced_at ?? ''),
    String(state.sync_cursor ?? current.sync_cursor ?? ''),
    String(state.last_error ?? current.last_error ?? ''),
    String(state.provider ?? current.provider ?? '')
  )
}

const close = () => {
  if (db.open) db.close()
}

module.exports = {
  databasePath,
  listAccounts,
  listAccountCredentials,
  getAccountCredentials,
  getAccountMailPassword,
  upsertAccount,
  deleteAccount,
  updateRefreshToken,
  replaceMessages,
  saveMessages,
  deleteMessages,
  listMessages,
  getMessage,
  saveMessageBody,
  getSyncState,
  setSyncState,
  close
}
