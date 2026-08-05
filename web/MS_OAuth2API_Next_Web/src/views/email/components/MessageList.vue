<template>
  <section class="maillist">
    <div class="list-head">
      <div class="list-title">
        <h2>{{ folder === 'INBOX' ? '收件箱' : '垃圾邮件' }}</h2>
        <span class="count">{{ total }} 封</span>
      </div>
      <div class="list-toolbar">
        <button class="tool-btn primary" :disabled="receiveLoading || !canReceive" @click="$emit('receive')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {{ receiveLoading ? '同步中…' : unified ? '同步全部账号' : '收取新邮件' }}
        </button>
        <button class="tool-btn" :disabled="!canReceive" @click="$emit('refresh')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 4v6h6" />
            <path d="M3.5 15a9 9 0 1 0 2-9.5L1 10" />
          </svg>
          刷新
        </button>
      </div>
    </div>

    <div v-loading="listLoading" class="msg-list">
      <div v-if="!passwordSet" class="list-empty">
        <div class="empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <p>请先登录</p>
        <span class="empty-hint">登录后可加载账号与邮件</span>
      </div>
      <div v-else-if="!hasAccount" class="list-empty">
        <div class="empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
        <p>还没有账号</p>
        <span class="empty-hint">在左侧点击 + 导入邮箱账号</span>
      </div>
      <template v-else-if="displayMessages.length">
        <div
          v-for="message in displayMessages"
          :key="messageKey(message)"
          class="msg"
          :class="{ active: isActive(message) }"
          @click="$emit('select', message)"
        >
          <div class="msg-avatar" :style="avatarStyle(message.send)">{{ senderInitial(senderName(message.send)) }}</div>
          <div class="msg-body">
            <div class="msg-top">
              <span class="msg-from">{{ senderName(message.send) }}</span>
              <span class="msg-time">{{ formatMailDate(message.date) }}</span>
            </div>
            <div class="msg-subject">{{ message.subject || '（无主题）' }}</div>
            <div class="msg-snippet">{{ snippet(message.text) }}</div>
            <div v-if="unified && message.account_email" class="msg-account">{{ message.account_email }}</div>
          </div>
        </div>
      </template>
      <div v-else class="list-empty">
        <div class="empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </div>
        <p>{{ searchKeyword ? '没有匹配的邮件' : '这里还没有邮件' }}</p>
        <span class="empty-hint">{{ searchKeyword ? '换个关键词试试' : unified ? '点击「同步全部账号」从服务器拉取' : '点击「收取新邮件」从服务器拉取' }}</span>
      </div>
      </div>
    <div v-if="total > 0" class="list-pagination">
      <button class="page-btn" title="上一页" :disabled="offset === 0 || listLoading" @click="$emit('page', previousOffset)">‹</button>
      <span>{{ currentPage }} / {{ pageCount }}</span>
      <button class="page-btn" title="下一页" :disabled="!hasMore || listLoading" @click="$emit('page', nextOffset)">›</button>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { Mailbox, Message } from '@/types'
import { avatarStyle, senderName, senderInitial, formatMailDate, messageKey } from '@/utils/format'

const props = defineProps<{
  folder: Mailbox
  messages: Message[]
  selectedMessageId: string | null
  searchKeyword: string
  passwordSet: boolean
  hasAccount: boolean
  listLoading: boolean
  receiveLoading: boolean
  unified: boolean
  total: number
  limit: number
  offset: number
  hasMore: boolean
}>()

defineEmits<{
  (e: 'receive'): void
  (e: 'refresh'): void
  (e: 'select', message: Message): void
  (e: 'page', offset: number): void
}>()

const canReceive = computed(() => props.passwordSet && props.hasAccount)

const displayMessages = computed(() => props.messages)
const currentPage = computed(() => Math.floor(props.offset / props.limit) + 1)
const pageCount = computed(() => Math.max(Math.ceil(props.total / props.limit), 1))
const previousOffset = computed(() => Math.max(props.offset - props.limit, 0))
const nextOffset = computed(() => props.offset + props.limit)

const isActive = (message: Message): boolean => messageKey(message) === props.selectedMessageId

const snippet = (text: string): string => {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  return cleaned.length > 96 ? `${cleaned.slice(0, 96)}…` : cleaned
}
</script>

<style scoped>
.maillist {
  width: 386px;
  flex-shrink: 0;
  background: var(--mm-panel);
  border-right: 1px solid var(--mm-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.msg-account {
  margin-top: 4px;
  color: var(--mm-accent);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-pagination {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-top: 1px solid var(--mm-border);
  color: var(--mm-text-3);
  font-size: 12px;
}

.page-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  background: var(--mm-panel);
  color: var(--mm-text-2);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.list-head {
  padding: 18px 20px 12px;
  flex-shrink: 0;
}

.list-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.list-title h2 {
  font-size: 17px;
  font-weight: 700;
}

.list-title .count {
  font-size: 12.5px;
  color: var(--mm-text-3);
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--mm-text-2);
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 7px;
  padding: 6px 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover:not(:disabled) {
  background: var(--mm-hover);
  color: var(--mm-text);
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-btn.primary {
  background: var(--mm-accent);
  border-color: var(--mm-accent);
  color: #fff;
  box-shadow: 0 1px 4px rgba(15, 108, 189, 0.25);
}

.tool-btn.primary:hover:not(:disabled) {
  background: #0c5ea6;
}

.msg-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.msg {
  display: flex;
  gap: 11px;
  padding: 13px 20px;
  cursor: pointer;
  border-bottom: 1px solid #f0f2f4;
  transition: background 0.12s ease;
}

.msg:hover {
  background: var(--mm-hover);
}

.msg.active {
  background: var(--mm-accent-soft);
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.msg-body {
  flex: 1;
  min-width: 0;
}

.msg-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg-from {
  font-size: 13.5px;
  color: var(--mm-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.msg-time {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--mm-text-3);
  flex-shrink: 0;
}

.msg-subject {
  font-size: 13px;
  color: var(--mm-text);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.msg.active .msg-subject {
  color: var(--mm-accent);
}

.msg-snippet {
  font-size: 12.5px;
  color: var(--mm-text-3);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--mm-text-2);
  padding: 24px;
  text-align: center;
}

.empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--mm-bg);
  border: 1px solid var(--mm-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mm-text-3);
  margin-bottom: 8px;
}

.list-empty p {
  font-size: 13.5px;
  font-weight: 600;
}

.list-empty .empty-hint {
  font-size: 12px;
  color: var(--mm-text-3);
}
</style>
