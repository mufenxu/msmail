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

  assert.deepEqual(store.listMessages(account.id, 'INBOX'), [{
    id: 'message-1',
    send: 'sender@example.com',
    subject: 'Persistent message',
    text: 'Hello',
    html: '<p>Hello</p>',
    date: '2026-08-05T00:00:00.000Z'
  }])
})

after(() => {
  store.close()
  fs.rmSync(testDir, { recursive: true, force: true })
})
