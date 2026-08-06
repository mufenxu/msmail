<template>
  <div class="mail-app">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
          </svg>
        </div>
        <div class="brand-text">
          <div class="brand-name">Monkey Mail</div>
          <div class="brand-sub">Outlook 多账号收件中心</div>
        </div>
      </div>
      <div class="topbar-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input v-model="searchKeyword" placeholder="搜索发件人、主题、正文…" />
      </div>
      <div class="topbar-right">
        <button class="pill" :class="passwordSet ? 'ok' : 'warn'" @click="openPasswordDialog">
          <span class="dot"></span>
          {{ passwordSet ? '已安全登录' : '需要登录' }}
        </button>
        <div class="top-avatar">管</div>
      </div>
    </header>

    <div class="mail-body">
      <EmailSidebar
        :accounts="accounts"
        :selected-account-id="selectedAccountId"
        :folder="folder"
        :counts="counts"
        :password-set="passwordSet"
        :last-sync="lastSync"
        @select="handleSelectAccount"
        @add="importDialogVisible = true"
        @edit="openEdit"
        @remove="handleDeleteAccount"
        @folder="handleSwitchFolder"
        @manage="managerVisible = true"
        @configure-password="openPasswordDialog"
      />
      <MessageList
        :folder="folder"
        :messages="messages"
        :selected-message-id="selectedMessageId"
        :search-keyword="searchKeyword"
        :password-set="passwordSet"
        :has-account="hasAccount"
        :list-loading="listLoading"
        :receive-loading="receiveLoading"
        :unified="selectedAccountId === null"
        :total="totalMessages"
        :limit="pageLimit"
        :offset="pageOffset"
        :has-more="hasMore"
        @receive="handleReceive"
        @refresh="handleRefreshList"
        @select="selectMessage"
        @page="handlePage"
      />
      <ReadingPane
        :message="selectedMessage"
        :body-html="bodyHtml"
        :body-text="bodyText"
        :body-loading="bodyLoading"
        :account-email="selectedMessage?.account_email ?? selectedAccount?.email ?? ''"
        @close="selectedMessageId = null"
      />
    </div>

    <ImportDialog v-model="importDialogVisible" @imported="handleImported" />
    <AccountManager
      v-model="managerVisible"
      :accounts="accounts"
      @edit="openEdit"
      @delete-accounts="handleDeleteAccounts"
      @import="importDialogVisible = true"
      @configure-password="openPasswordDialog"
    />

    <el-dialog v-model="editDialogVisible" title="编辑账号" width="520" class="mm-dialog" append-to-body>
      <el-form label-width="96px" @submit.prevent>
        <el-form-item label="邮箱" required>
          <el-input v-model="editForm.email" placeholder="name@outlook.com" />
        </el-form-item>
        <el-form-item label="客户端 ID" required>
          <el-input v-model="editForm.client_id" placeholder="Azure AD 应用客户端 ID" />
        </el-form-item>
        <el-form-item label="刷新令牌">
          <el-input v-model="editRefreshToken" type="password" show-password placeholder="留空表示不修改" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordDialogVisible" title="登录 Monkey Mail" width="420" class="mm-dialog" append-to-body>
      <p class="dialog-desc">输入服务访问密码以建立安全会话，密码不会保存在浏览器本地存储中。</p>
      <el-input
        v-model="passwordInput"
        type="password"
        show-password
        placeholder="请输入服务访问密码"
        @keyup.enter="handleSavePassword"
      />
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loginLoading" @click="handleSavePassword">登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Account, Mailbox, MailboxCounts, Message, MessagePage } from '@/types'
import { messageKey } from '@/utils/format'
import EmailSidebar from './components/EmailSidebar.vue'
import MessageList from './components/MessageList.vue'
import ReadingPane from './components/ReadingPane.vue'
import ImportDialog from './components/ImportDialog.vue'
import AccountManager from './components/AccountManager.vue'

const authenticated = ref(false)
const passwordSet = computed(() => authenticated.value)

const requestApi = async (url: string, method = 'POST', body: Record<string, unknown> = {}, timeoutMs = 60000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body),
      signal: controller.signal
    })
    const data = await response.json()
    if (!response.ok || data.code != 200) {
      if (response.status === 401) authenticated.value = false
      throw new Error(data.error || data.message || `请求失败（HTTP ${response.status}）`)
    }
    return data.data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 旧版本地数据迁移 ----------
const readLegacyAccounts = (): Array<Partial<Account> & { password?: string; mail_password?: string }> => {
  try {
    const parsed = JSON.parse(localStorage.getItem('localMailList') || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const storedMailList = readLegacyAccounts()
let legacyPassword = localStorage.getItem('monkey-mail-api-password') || storedMailList.find((item) => item.password)?.password || ''
localStorage.removeItem('monkey-mail-api-password')
const legacyMailList = storedMailList.map((item) => ({
  email: item.email || '',
  client_id: item.client_id || '',
  refresh_token: item.refresh_token || '',
  mail_password: item.mail_password || ''
}))
if (storedMailList.length) {
  localStorage.setItem('localMailList', JSON.stringify(legacyMailList))
}

const migrateLocalData = async () => {
  for (const legacyAccount of legacyMailList) {
    if (!legacyAccount.email || !legacyAccount.client_id || !legacyAccount.refresh_token) continue
    const account = (await requestApi('/api/accounts', 'POST', {
      email: legacyAccount.email,
      client_id: legacyAccount.client_id,
      refresh_token: legacyAccount.refresh_token,
      mail_password: legacyAccount.mail_password || undefined
    })) as Account

    for (const mailbox of ['INBOX', 'Junk'] as Mailbox[]) {
      const cached = localStorage.getItem(legacyAccount.email + mailbox)
      if (!cached) continue
      try {
        const mailMessages = JSON.parse(cached)
        if (Array.isArray(mailMessages) && mailMessages.length > 0) {
          await requestApi(`/api/accounts/${account.id}/messages/cache`, 'POST', { mailbox, messages: mailMessages })
        }
      } catch (error) {
        console.warn('旧邮件缓存迁移失败:', error)
      }
    }
  }

  localStorage.removeItem('localMailList')
  legacyMailList.forEach((account) => {
    localStorage.removeItem(account.email + 'INBOX')
    localStorage.removeItem(account.email + 'Junk')
  })
  storedMailList.length = 0
  legacyMailList.length = 0
}

// ---------- 账号 ----------
const accounts = ref<Account[]>([])
const selectedAccountId = ref<number | null>(null)
const selectedAccount = computed(() => accounts.value.find((a) => a.id === selectedAccountId.value) ?? null)
const hasAccount = computed(() => accounts.value.length > 0)

const loadAccounts = async (reloadMessages = true) => {
  if (!passwordSet.value) {
    accounts.value = []
    selectedAccountId.value = null
    messages.value = []
    return
  }
  try {
    let list = (await requestApi('/api/accounts/list')) as Account[]
    if (legacyMailList.length > 0) {
      await migrateLocalData()
      list = (await requestApi('/api/accounts/list')) as Account[]
      if (list.length > 0) ElMessage.success('本地邮箱数据已迁移到服务端')
    }
    accounts.value = list
    counts.value = Object.fromEntries(list.map((account) => [accountKey(account), {
      INBOX: account.counts?.INBOX ?? null,
      Junk: account.counts?.Junk ?? null
    }]))
    const syncDates = list.flatMap((account) => Object.values(account.sync || {}).map((state) => state?.last_synced_at || ''))
    const sortedSyncDates = syncDates.filter(Boolean).sort()
    const latestSync = sortedSyncDates[sortedSyncDates.length - 1]
    lastSync.value = latestSync
      ? new Date(latestSync).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : ''
    if (!list.length) {
      selectedAccountId.value = null
      messages.value = []
    } else if (selectedAccountId.value !== null && !list.some((a) => a.id === selectedAccountId.value)) {
      selectedAccountId.value = null
    }
    if (reloadMessages && list.length) await loadMessages(true)
  } catch (error) {
    console.warn('加载服务端账号失败:', error)
    accounts.value = []
  }
}

// ---------- 邮件 ----------
const folder = ref<Mailbox>('INBOX')
const messages = ref<Message[]>([])
const selectedMessageId = ref<string | null>(null)
const selectedMessage = computed(() => messages.value.find((m) => messageKey(m) === selectedMessageId.value) ?? null)
const counts = ref<Record<string, MailboxCounts>>({})
const lastSync = ref('')
const listLoading = ref(false)
const receiveLoading = ref(false)
const searchKeyword = ref('')
const bodyHtml = ref('')
const bodyText = ref('')
const bodyLoading = ref(false)
const bodyCache = ref<Record<string, { html: string; text: string }>>({})
const pageLimit = 100
const pageOffset = ref(0)
const totalMessages = ref(0)
const hasMore = ref(false)

const accountKey = (account: Account) => String(account.id ?? account.email)

const handleSelectAccount = async (account: Account | null) => {
  selectedAccountId.value = account?.id ?? null
  pageOffset.value = 0
  selectedMessageId.value = null
  clearBody()
  messages.value = []
  await loadMessages(true)
}

const handleSwitchFolder = async (mailbox: Mailbox) => {
  if (mailbox === folder.value) return
  folder.value = mailbox
  pageOffset.value = 0
  selectedMessageId.value = null
  clearBody()
  messages.value = []
  await loadMessages(true)
}

const loadMessages = async (fromCache = true) => {
  if (!hasAccount.value || !passwordSet.value) return
  if (!fromCache) return
  listLoading.value = true
  try {
    const endpoint = selectedAccountId.value === null
      ? '/api/messages/list'
      : `/api/accounts/${selectedAccountId.value}/messages/list`
    const page = (await requestApi(endpoint, 'POST', {
      mailbox: folder.value,
      search: searchKeyword.value,
      limit: pageLimit,
      offset: pageOffset.value
    })) as MessagePage
    messages.value = page.items
    totalMessages.value = page.total
    hasMore.value = page.has_more
    await autoSelectFirst()
  } catch (error) {
    console.warn('加载邮件缓存失败:', error)
  } finally {
    listLoading.value = false
  }
}

const autoSelectFirst = async () => {
  const keepCurrent = messages.value.some((m) => messageKey(m) === selectedMessageId.value)
  if (keepCurrent) {
    const current = messages.value.find((m) => messageKey(m) === selectedMessageId.value)
    if (current) await loadBody(current)
    return
  }
  const first = messages.value[0]
  if (first) await selectMessage(first)
  else selectedMessageId.value = null
}

const handleReceive = async () => {
  if (!hasAccount.value) return
  if (!passwordSet.value) {
    ElMessage.warning('请先登录')
    return
  }
  receiveLoading.value = true
  try {
    if (selectedAccountId.value === null) {
      const result = (await requestApi('/api/sync/all', 'POST', { mailbox: folder.value }, 10 * 60 * 1000)) as {
        succeeded: number
        failed: number
      }
      if (result.failed) ElMessage.warning(`同步完成：成功 ${result.succeeded}，失败 ${result.failed}`)
      else ElMessage.success(`已同步 ${result.succeeded} 个邮箱`)
    } else {
      await requestApi('/api/sync', 'POST', {
        account_id: selectedAccountId.value,
        mailbox: folder.value
      }, 5 * 60 * 1000)
      ElMessage.success('收取成功')
    }
    pageOffset.value = 0
    await loadAccounts(false)
    await loadMessages(true)
    lastSync.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '收取失败')
  } finally {
    receiveLoading.value = false
  }
}

const handleRefreshList = () => {
  loadMessages(true)
}

const handlePage = async (offset: number) => {
  pageOffset.value = Math.max(offset, 0)
  selectedMessageId.value = null
  clearBody()
  await loadMessages(true)
}

const selectMessage = async (message: Message) => {
  selectedMessageId.value = messageKey(message)
  await loadBody(message)
}

const clearBody = () => {
  bodyHtml.value = ''
  bodyText.value = ''
  bodyLoading.value = false
}

const loadBody = async (message: Message) => {
  const account = selectedAccount.value
  const messageAccountId = message.account_id ?? account?.id
  const cacheKey = `${messageAccountId ?? 'legacy'}:${folder.value}:${messageKey(message)}`
  const cached = bodyCache.value[cacheKey]
  if (cached) {
    bodyHtml.value = cached.html
    bodyText.value = cached.text
    bodyLoading.value = false
    return
  }
  if (message.html) {
    bodyHtml.value = message.html
    bodyText.value = message.text
    bodyLoading.value = false
    return
  }

  bodyLoading.value = true
  bodyHtml.value = ''
  bodyText.value = ''
  try {
    if (messageAccountId != null) {
      const body = (await requestApi(`/api/accounts/${messageAccountId}/messages/body`, 'POST', {
        mailbox: folder.value,
        id: message.id
      })) as { html: string; text: string }
      bodyCache.value = { ...bodyCache.value, [cacheKey]: { html: body.html || '', text: body.text || '' } }
      bodyHtml.value = body.html || ''
      bodyText.value = body.text || ''
    } else {
      bodyText.value = message.text
    }
  } catch (error) {
    console.warn('加载邮件正文失败:', error)
    bodyText.value = message.text || '（正文加载失败）'
  } finally {
    bodyLoading.value = false
  }
}

// ---------- 账号编辑与删除 ----------
const editDialogVisible = ref(false)
const saving = ref(false)
const editForm = ref<{ email: string; client_id: string }>({ email: '', client_id: '' })
const editRefreshToken = ref('')
const editingId = ref<number | null>(null)

const openEdit = (account: Account) => {
  editingId.value = account.id ?? null
  editForm.value = { email: account.email, client_id: account.client_id }
  editRefreshToken.value = ''
  editDialogVisible.value = true
}

const handleSaveEdit = async () => {
  if (!editForm.value.email || !editForm.value.client_id) {
    ElMessage.warning('请填写邮箱和客户端 ID')
    return
  }
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      email: editForm.value.email,
      client_id: editForm.value.client_id
    }
    if (editRefreshToken.value.trim()) payload.refresh_token = editRefreshToken.value.trim()
    await requestApi(
      editingId.value != null ? `/api/accounts/${editingId.value}` : '/api/accounts',
      editingId.value != null ? 'PUT' : 'POST',
      payload
    )
    await loadAccounts()
    editDialogVisible.value = false
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

const removeAccounts = async (list: Account[]) => {
  const removedKeys = new Set(list.map(accountKey))
  for (const account of list) {
    if (account.id != null) {
      await requestApi(`/api/accounts/${account.id}/delete`)
    } else {
      const index = legacyMailList.findIndex((item) => item.email === account.email)
      if (index >= 0) legacyMailList.splice(index, 1)
    }
  }
  localStorage.setItem('localMailList', JSON.stringify(legacyMailList))
  const nextCounts: Record<string, MailboxCounts> = {}
  Object.entries(counts.value).forEach(([key, value]) => {
    if (!removedKeys.has(key)) nextCounts[key] = value
  })
  counts.value = nextCounts
  await loadAccounts()
}

const handleDeleteAccount = (account: Account) => {
  ElMessageBox.confirm(`确认删除账号 ${account.email} 吗？`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      try {
        await removeAccounts([account])
        ElMessage.success('删除成功')
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '删除失败')
      }
    })
    .catch(() => {
      ElMessage.info('已取消删除')
    })
}

const handleDeleteAccounts = (list: Account[]) => {
  if (!list.length) {
    ElMessage.warning('请选择要删除的账号')
    return
  }
  ElMessageBox.confirm(`确认删除选中的 ${list.length} 个账号吗？`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      try {
        await removeAccounts(list)
        ElMessage.success('删除成功')
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '删除失败')
      }
    })
    .catch(() => {
      ElMessage.info('已取消删除')
    })
}

// ---------- 访问密码 ----------
const passwordDialogVisible = ref(false)
const passwordInput = ref('')
const loginLoading = ref(false)

const openPasswordDialog = () => {
  passwordInput.value = ''
  passwordDialogVisible.value = true
}

const loginWithPassword = async (password: string) => {
  const response = await fetch('/api/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
  const data = await response.json()
  if (!response.ok || data.code != 200) {
    throw new Error(data.error || data.message || '登录失败')
  }
  authenticated.value = true
}

const handleSavePassword = async () => {
  const value = passwordInput.value.trim()
  if (!value) {
    ElMessage.warning('请输入访问密码')
    return
  }
  loginLoading.value = true
  try {
    await loginWithPassword(value)
    passwordInput.value = ''
    passwordDialogVisible.value = false
    await loadAccounts()
    ElMessage.success('登录成功')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    loginLoading.value = false
  }
}

// ---------- 导入 ----------
const importDialogVisible = ref(false)
const managerVisible = ref(false)

const handleImported = () => {
  loadAccounts()
}

let searchTimer: number | undefined
watch(searchKeyword, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    pageOffset.value = 0
    selectedMessageId.value = null
    clearBody()
    loadMessages(true)
  }, 300)
})

const initialize = async () => {
  try {
    const status = (await requestApi('/api/session/status', 'GET')) as { configured: boolean; authenticated: boolean }
    authenticated.value = status.authenticated
    if (!status.configured) {
      ElMessage.error('服务端尚未配置 PASSWORD')
      return
    }
    if (!authenticated.value && legacyPassword) {
      try {
        await loginWithPassword(legacyPassword)
      } catch {
        authenticated.value = false
      } finally {
        legacyPassword = ''
      }
    }
    if (authenticated.value) await loadAccounts()
    else passwordDialogVisible.value = true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '无法连接服务端')
  }
}

onMounted(() => {
  initialize()
})
</script>

<style scoped>
.mail-app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--mm-bg);
  overflow: hidden;
}

.topbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--mm-panel);
  border-bottom: 1px solid var(--mm-border);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 208px;
}

.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #0f6cbd, #4a9fe0);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 2px 6px rgba(15, 108, 189, 0.25);
  flex-shrink: 0;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.brand-sub {
  font-size: 12px;
  color: var(--mm-text-3);
  margin-top: -1px;
}

.topbar-search {
  flex: 1;
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--mm-bg);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
  padding: 7px 12px;
  color: var(--mm-text-3);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.topbar-search:focus-within {
  border-color: var(--mm-accent-border);
  background: var(--mm-panel);
}

.topbar-search input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: 13.5px;
  color: var(--mm-text);
  min-width: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--mm-text-2);
  background: var(--mm-bg);
  border: 1px solid var(--mm-border);
  border-radius: 999px;
  padding: 5px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pill:hover {
  border-color: var(--mm-accent-border);
  color: var(--mm-text);
}

.pill .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.pill.ok .dot {
  background: var(--mm-ok);
}

.pill.warn .dot {
  background: #c7a24b;
}

.top-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7a8fa6, #4a5d75);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.mail-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.dialog-desc {
  font-size: 12.5px;
  color: var(--mm-text-3);
  margin-bottom: 12px;
  line-height: 1.6;
}
</style>
