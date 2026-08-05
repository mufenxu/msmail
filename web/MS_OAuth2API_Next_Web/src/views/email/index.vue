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
          {{ passwordSet ? '访问密码已配置' : '未配置访问密码' }}
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
        @receive="handleReceive"
        @refresh="handleRefreshList"
        @select="handleSelectMessage"
      />
      <ReadingPane :message="selectedMessage" :account-email="selectedAccount?.email ?? ''" @close="selectedMessageId = null" />
    </div>

    <ImportDialog v-model="importDialogVisible" :api-password="apiPassword" @imported="handleImported" @set-password="handleSetPassword" />
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

    <el-dialog v-model="passwordDialogVisible" title="访问密码" width="420" class="mm-dialog" append-to-body>
      <p class="dialog-desc">用于调用服务端业务接口的共享密码，仅保存在当前浏览器本地。</p>
      <el-input
        v-model="passwordInput"
        type="password"
        show-password
        placeholder="请输入服务访问密码"
        @keyup.enter="handleSavePassword"
      />
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSavePassword">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Account, Mailbox, MailboxCounts, Message } from '@/types'
import { messageKey } from '@/utils/format'
import EmailSidebar from './components/EmailSidebar.vue'
import MessageList from './components/MessageList.vue'
import ReadingPane from './components/ReadingPane.vue'
import ImportDialog from './components/ImportDialog.vue'
import AccountManager from './components/AccountManager.vue'

const apiPassword = ref(localStorage.getItem('monkey-mail-api-password') || '')
const passwordSet = computed(() => apiPassword.value.length > 0)

const requestApi = async (url: string, method = 'POST', body: Record<string, unknown> = {}) => {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, password: apiPassword.value })
  })
  const data = await response.json()
  if (!response.ok || data.code != 200) {
    throw new Error(data.error || data.message || `请求失败（HTTP ${response.status}）`)
  }
  return data.data
}

// ---------- 旧版本地数据迁移 ----------
const storedMailList = JSON.parse(localStorage.getItem('localMailList') || '[]') as Array<Partial<Account> & { password?: string }>
const legacyPassword = storedMailList.find((item) => item.password)?.password || ''
if (legacyPassword && !localStorage.getItem('monkey-mail-api-password')) {
  localStorage.setItem('monkey-mail-api-password', legacyPassword)
  apiPassword.value = legacyPassword
}
const legacyMailList = storedMailList.map((item) => ({
  email: item.email || '',
  client_id: item.client_id || '',
  refresh_token: item.refresh_token || ''
}))
if (storedMailList.some((item) => item.password)) {
  localStorage.setItem('localMailList', JSON.stringify(legacyMailList))
}

const migrateLocalData = async () => {
  for (const legacyAccount of legacyMailList) {
    if (!legacyAccount.email || !legacyAccount.client_id || !legacyAccount.refresh_token) continue
    const account = (await requestApi('/api/accounts', 'POST', {
      email: legacyAccount.email,
      client_id: legacyAccount.client_id,
      refresh_token: legacyAccount.refresh_token
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
}

// ---------- 账号 ----------
const accounts = ref<Account[]>([])
const selectedAccountId = ref<number | null>(null)
const selectedAccount = computed(() => accounts.value.find((a) => a.id === selectedAccountId.value) ?? null)
const hasAccount = computed(() => accounts.value.length > 0)

const loadAccounts = async () => {
  if (!passwordSet.value) {
    accounts.value = []
    selectedAccountId.value = null
    messages.value = []
    return
  }
  try {
    let list = (await requestApi('/api/accounts/list')) as Account[]
    if (list.length === 0 && legacyMailList.length > 0) {
      await migrateLocalData()
      list = (await requestApi('/api/accounts/list')) as Account[]
      if (list.length > 0) ElMessage.success('本地邮箱数据已迁移到服务端')
    }
    accounts.value = list
    if (!list.length) {
      selectedAccountId.value = null
      messages.value = []
    } else if (!list.some((a) => a.id === selectedAccountId.value)) {
      const first = list[0]
      if (first) await handleSelectAccount(first)
    }
  } catch (error) {
    console.warn('加载服务端账号失败:', error)
    accounts.value = [...legacyMailList]
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

const accountKey = (account: Account) => String(account.id ?? account.email)

const updateCount = (account: Account, mailbox: Mailbox, count: number) => {
  const key = accountKey(account)
  const current = counts.value[key] ?? { INBOX: null, Junk: null }
  const next = { ...current }
  next[mailbox] = count
  counts.value = { ...counts.value, [key]: next }
}

const handleSelectAccount = async (account: Account) => {
  selectedAccountId.value = account.id ?? null
  selectedMessageId.value = null
  messages.value = []
  await loadMessages(true)
}

const handleSwitchFolder = async (mailbox: Mailbox) => {
  if (mailbox === folder.value) return
  folder.value = mailbox
  selectedMessageId.value = null
  messages.value = []
  await loadMessages(true)
}

const loadMessages = async (fromCache = true) => {
  const account = selectedAccount.value
  if (!account) return
  if (account.id == null) {
    messages.value = JSON.parse(localStorage.getItem(account.email + folder.value) || '[]')
    updateCount(account, folder.value, messages.value.length)
    autoSelectFirst()
    return
  }
  if (!fromCache) return
  listLoading.value = true
  try {
    const list = (await requestApi(`/api/accounts/${account.id}/messages/list`, 'POST', { mailbox: folder.value })) as Message[]
    messages.value = list
    updateCount(account, folder.value, list.length)
    autoSelectFirst()
  } catch (error) {
    console.warn('加载邮件缓存失败:', error)
  } finally {
    listLoading.value = false
  }
}

const autoSelectFirst = () => {
  const keepCurrent = messages.value.some((m) => messageKey(m) === selectedMessageId.value)
  if (keepCurrent) return
  const first = messages.value[0]
  selectedMessageId.value = first ? messageKey(first) : null
}

const handleReceive = async () => {
  const account = selectedAccount.value
  if (!account) return
  if (!passwordSet.value) {
    ElMessage.warning('请先配置访问密码')
    return
  }
  receiveLoading.value = true
  try {
    const payload: Record<string, unknown> = { mailbox: folder.value }
    if (account.id != null) {
      payload.account_id = account.id
    } else {
      payload.email = account.email
      payload.client_id = account.client_id
      payload.refresh_token = account.refresh_token
    }
    const list = (await requestApi('/api/mail_all', 'POST', payload)) as Message[]
    messages.value = list
    updateCount(account, folder.value, list.length)
    autoSelectFirst()
    lastSync.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    ElMessage.success('收取成功')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '收取失败')
  } finally {
    receiveLoading.value = false
  }
}

const handleRefreshList = () => {
  loadMessages(true)
}

const handleSelectMessage = (message: Message) => {
  selectedMessageId.value = messageKey(message)
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

const openPasswordDialog = () => {
  passwordInput.value = apiPassword.value
  passwordDialogVisible.value = true
}

const handleSavePassword = () => {
  const value = passwordInput.value.trim()
  if (!value) {
    ElMessage.warning('请输入访问密码')
    return
  }
  apiPassword.value = value
  localStorage.setItem('monkey-mail-api-password', value)
  passwordDialogVisible.value = false
  loadAccounts()
  ElMessage.success('访问密码已保存')
}

const handleSetPassword = (value: string) => {
  apiPassword.value = value
  localStorage.setItem('monkey-mail-api-password', value)
}

// ---------- 导入 ----------
const importDialogVisible = ref(false)
const managerVisible = ref(false)

const handleImported = () => {
  loadAccounts()
}

onMounted(() => {
  loadAccounts()
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
