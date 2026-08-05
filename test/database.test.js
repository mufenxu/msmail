const assert = require('node:assert/strict')
const { test, after } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monkey-mail-db-'))
process.env.SQLITE_PATH = path.join(testDir, 'mail.sqlite')
process.env.DATA_ENCRYPTION_KEY = 'test-only-key'

const store = require('../utils/db')

test('persists mailbox accounts and cached messages in SQLite', () => {
  const account = store.upsertAccount({
    email: 'persist@example.com',
    client_id: 'client-id',
    refresh_token: 'refresh-token'
  })

  assert.equal(store.listAccounts().length, 1)
  assert.equal(store.getAccountCredentials(account.id).refresh_token, 'refresh-token')

  store.replaceMessages(account.id, 'INBOX', [{
    id: 'message-1',
    send: 'sender@example.com',
    subject: 'Persistent message',
    text: 'Hello',
    html: '<p>Hello</p>',
    date: '2026-08-05T00:00:00.000Z'
  }])

  assert.deepEqual(store.listMessages({ accountId: account.id, mailbox: 'INBOX' }), {
    items: [{
      id: 'message-1',
      account_id: account.id,
      account_email: 'persist@example.com',
      send: 'sender@example.com',
      subject: 'Persistent message',
      text: 'Hello',
      date: '2026-08-05T00:00:00.000Z',
      provider: 'legacy',
      body_loaded: 1
    }],
    total: 1,
    limit: 100,
    offset: 0,
    has_more: false
  })

  assert.deepEqual(store.getMessage(account.id, 'INBOX', 'message-1'), {
    id: 'message-1',
    account_id: account.id,
    mailbox: 'INBOX',
    send: 'sender@example.com',
    subject: 'Persistent message',
    text: 'Hello',
    html: '<p>Hello</p>',
    date: '2026-08-05T00:00:00.000Z',
    provider: 'legacy',
    body_loaded: 1
  })

  assert.deepEqual(store.getSyncState(account.id, 'INBOX'), {
    last_synced_at: '',
    sync_cursor: '',
    last_error: '',
    provider: ''
  })
  store.setSyncState(account.id, 'INBOX', { last_synced_at: '2026-08-05T00:00:00.000Z' })
  assert.deepEqual(store.getSyncState(account.id, 'INBOX'), {
    last_synced_at: '2026-08-05T00:00:00.000Z',
    sync_cursor: '',
    last_error: '',
    provider: ''
  })
})

after(() => {
  store.close()
  fs.rmSync(testDir, { recursive: true, force: true })
})
