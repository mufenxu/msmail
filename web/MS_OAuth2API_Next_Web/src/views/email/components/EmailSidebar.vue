<template>
  <aside class="sidebar">
    <div class="side-head">
      <span>邮箱账号</span>
      <button class="icon-btn" title="导入账号" @click="$emit('add')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <div v-if="!passwordSet" class="side-empty">
      <p>登录后即可加载账号</p>
      <button class="link-btn" @click="$emit('configure-password')">去登录</button>
    </div>
    <template v-else>
      <div
        v-if="accounts.length"
        class="account-item unified-item"
        :class="{ active: selectedAccountId === null }"
        @click="$emit('select', null)"
      >
        <div class="acc-avatar unified-avatar">全</div>
        <div class="acc-body">
          <div class="account-email">统一收件箱</div>
          <div class="account-meta"><span>{{ accounts.length }} 个邮箱账号</span></div>
          <div class="account-summary">
            <span>收件箱 {{ mailboxTotal('INBOX') }}</span>
            <span>垃圾邮件 {{ mailboxTotal('Junk') }}</span>
          </div>
        </div>
      </div>
      <div
        v-for="account in accounts"
        :key="account.id ?? account.email"
        class="account-item"
        :class="{ active: account.id === selectedAccountId }"
        @click="$emit('select', account)"
      >
        <div class="account-top">
          <div class="acc-avatar" :style="avatarStyle(account.email)">{{ senderInitial(account.email) }}</div>
          <div class="acc-body">
            <div class="account-email" :title="account.email">{{ account.email }}</div>
            <div class="account-meta">
              <span>{{ domainLabel(account.email) }}</span>
              <span>{{ providerLabel(account) }}</span>
            </div>
          </div>
          <div class="acc-actions" @click.stop>
            <button class="mini-icon" title="编辑" @click="$emit('edit', account)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <button class="mini-icon danger" title="删除" @click="$emit('remove', account)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </div>
        </div>
        <div class="account-details">
          <div class="account-detail">
            <span>邮件数量</span>
            <span class="account-detail-value">收件 {{ accountMailboxCount(account, 'INBOX') }} · 垃圾 {{ accountMailboxCount(account, 'Junk') }}</span>
          </div>
          <div class="account-detail" :class="statusClass(account)">
            <span>连接状态</span>
            <span class="account-detail-value account-status">
              <i></i>{{ statusLabel(account) }}<span v-if="account.has_mail_password" class="credential-state">密码已保存</span>
            </span>
          </div>
        </div>
      </div>
      <div v-if="!accounts.length" class="side-empty">
        <p>还没有账号，点击右上角 + 导入</p>
      </div>
    </template>

    <div class="side-divider"></div>
    <div class="side-head"><span>文件夹</span></div>
    <div class="folder-item" :class="{ active: folder === 'INBOX' }" @click="$emit('folder', 'INBOX')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      收件箱
      <span class="folder-count">{{ folderCount('INBOX') }}</span>
    </div>
    <div class="folder-item" :class="{ active: folder === 'Junk' }" @click="$emit('folder', 'Junk')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
      垃圾邮件
      <span class="folder-count">{{ folderCount('Junk') }}</span>
    </div>

    <div class="side-footer">
      <div class="sync-row">
        <span class="dot" :class="{ off: !passwordSet }"></span>
        <span>{{ syncText }}</span>
      </div>
      <div class="footer-actions">
        <button class="link-btn" @click="$emit('configure-password')">登录</button>
        <button class="link-btn" @click="$emit('manage')">管理账号</button>
      </div>
    </div>
  </aside>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { Account, Mailbox, MailboxCounts } from '@/types'
import { avatarStyle, senderInitial, domainLabel } from '@/utils/format'

const props = defineProps<{
  accounts: Account[]
  selectedAccountId: number | null
  folder: Mailbox
  counts: Record<string, MailboxCounts | undefined>
  passwordSet: boolean
  lastSync: string
}>()

defineEmits<{
  (e: 'select', account: Account | null): void
  (e: 'add'): void
  (e: 'edit', account: Account): void
  (e: 'remove', account: Account): void
  (e: 'folder', mailbox: Mailbox): void
  (e: 'manage'): void
  (e: 'configure-password'): void
}>()

const accountKey = (account: Account) => String(account.id ?? account.email)
const accountCounts = (account: Account): MailboxCounts | undefined => props.counts[accountKey(account)]
const accountMailboxCount = (account: Account, mailbox: Mailbox): string | number => {
  const counts = accountCounts(account)
  const value = counts?.[mailbox] ?? account.counts?.[mailbox]
  return value == null ? '—' : value
}

const mailboxTotal = (mailbox: Mailbox): string | number => {
  let total = 0
  let hasValue = false
  props.accounts.forEach((account) => {
    const value = accountMailboxCount(account, mailbox)
    if (typeof value === 'number') {
      total += value
      hasValue = true
    }
  })
  return hasValue ? total : '—'
}

const providerLabel = (account: Account): string => {
  const provider = account.sync?.[props.folder]?.provider
  return provider ? provider.toUpperCase() : '待同步'
}

const statusLabel = (account: Account): string => {
  if (account.token_status === 'reauth_required') return '需要重新授权'
  if (account.token_status === 'error') return '令牌刷新异常'
  const state = account.sync?.[props.folder]
  if (state?.last_error) return '同步异常'
  if (state?.last_synced_at) {
    return `已同步 ${new Date(state.last_synced_at).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`
  }
  return '尚未同步'
}

const statusClass = (account: Account): string => {
  if (account.token_status === 'reauth_required' || account.token_status === 'error') return 'status-warning'
  const state = account.sync?.[props.folder]
  return state?.last_error ? 'status-warning' : 'status-ok'
}

const folderCount = (mailbox: Mailbox): string | number => {
  if (props.selectedAccountId === null) {
    return props.accounts.reduce((total, account) => total + (account.counts?.[mailbox] || 0), 0)
  }
  const account = props.accounts.find((a) => a.id === props.selectedAccountId)
  if (!account) return '—'
  const counts = props.counts[accountKey(account)]
  return counts && counts[mailbox] != null ? counts[mailbox] : '—'
}

const syncText = computed(() => {
  if (!props.passwordSet) return '尚未登录'
  if (props.lastSync) return `上次同步 ${props.lastSync}`
  return '尚未同步'
})
</script>

<style scoped>
.sidebar {
  width: 304px;
  flex-shrink: 0;
  background: var(--mm-sidebar);
  border-right: 1px solid var(--mm-border);
  display: flex;
  flex-direction: column;
  padding: 16px 12px 12px;
  min-height: 0;
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mm-text-3);
  letter-spacing: 0.4px;
}

.icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--mm-border);
  background: var(--mm-panel);
  color: var(--mm-text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--mm-hover);
  color: var(--mm-accent);
  border-color: var(--mm-accent-border);
}

.account-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 11px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--mm-border);
  border-radius: 10px;
  background: var(--mm-panel);
  cursor: pointer;
  position: relative;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.account-item:hover {
  background: var(--mm-hover);
  border-color: var(--mm-border-strong);
}

.account-item.active {
  background: var(--mm-accent-soft);
  border-color: var(--mm-accent-border);
}

.account-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.unified-item {
  flex-direction: row;
  align-items: flex-start;
}

.acc-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.unified-avatar {
  background: #374151;
}

.acc-body {
  flex: 1;
  min-width: 0;
}

.account-email {
  font-size: 13px;
  line-height: 1.4;
  color: var(--mm-text);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.account-item.active .account-email {
  color: var(--mm-accent);
  font-weight: 600;
}

.account-meta {
  font-size: 11.5px;
  color: var(--mm-text-3);
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 3px;
  line-height: 1.4;
}

.account-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
  color: var(--mm-text-2);
  font-size: 11px;
  line-height: 1.35;
}

.account-summary span,
.credential-state {
  border-radius: 4px;
  background: var(--mm-bg);
  padding: 2px 5px;
}

.account-details {
  display: grid;
  gap: 4px;
  padding-left: 46px;
  margin-top: 1px;
}

.account-detail {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--mm-text-3);
  font-size: 10.5px;
  line-height: 1.45;
}

.account-detail > span:first-child {
  width: 52px;
  flex-shrink: 0;
}

.account-detail-value {
  flex: 1;
  min-width: 0;
  color: var(--mm-text-2);
  text-align: right;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.account-status {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
}

.account-status i {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--mm-text-3);
}

.status-ok .account-status {
  color: var(--mm-ok);
}

.status-ok .account-status i {
  background: var(--mm-ok);
}

.status-warning .account-status {
  color: #a16b10;
}

.status-warning .account-status i {
  background: #c7a24b;
}

.credential-state {
  color: var(--mm-text-3);
  font-size: 10px;
}

.acc-actions {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.mini-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--mm-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mini-icon:hover {
  background: var(--mm-panel);
  color: var(--mm-accent);
  box-shadow: var(--mm-shadow);
}

.mini-icon.danger:hover {
  color: var(--mm-danger);
}

.side-empty {
  padding: 14px 10px;
  font-size: 12.5px;
  color: var(--mm-text-3);
  line-height: 1.7;
}

.side-empty .link-btn {
  margin-top: 2px;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--mm-accent);
  font-size: 12.5px;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

.side-divider {
  height: 1px;
  background: var(--mm-border);
  margin: 14px 6px 12px;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13.5px;
  color: var(--mm-text);
  transition: background 0.12s ease;
}

.folder-item:hover {
  background: var(--mm-hover);
}

.folder-item.active {
  background: var(--mm-accent-soft);
  color: var(--mm-accent);
  font-weight: 600;
}

.folder-item svg {
  color: var(--mm-text-3);
  flex-shrink: 0;
}

.folder-item.active svg {
  color: var(--mm-accent);
}

.folder-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--mm-text-3);
  font-weight: 500;
}

.side-footer {
  margin-top: auto;
  padding: 12px 8px 2px;
  border-top: 1px solid var(--mm-border);
  font-size: 12px;
  color: var(--mm-text-3);
}

.sync-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.sync-row .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--mm-ok);
  flex-shrink: 0;
}

.sync-row .dot.off {
  background: #c7a24b;
}

.footer-actions {
  display: flex;
  gap: 14px;
  margin-top: 10px;
}
</style>
