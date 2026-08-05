<template>
  <section class="reader">
    <template v-if="message">
      <div class="reader-head">
        <div class="reader-top">
          <h2 class="reader-subject">{{ message.subject || '（无主题）' }}</h2>
          <button class="close-btn" title="关闭" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="sender-card">
          <div class="msg-avatar" :style="avatarStyle(message.send)">{{ senderInitial(senderName(message.send)) }}</div>
          <div class="sender-info">
            <div class="sender-name">{{ senderName(message.send) }}</div>
            <div class="sender-mail">{{ message.send || '未知发件人' }}<template v-if="accountEmail"> → {{ accountEmail }}</template></div>
          </div>
          <div class="sender-date">{{ formatFullDate(message.date) }}</div>
        </div>
      </div>
      <div class="reader-body">
        <div v-if="bodyLoading" class="body-loading">
          <span class="spinner"></span>
          正在加载正文…
        </div>
        <template v-else>
          <div v-if="sanitizedHtml" class="mail-content" v-html="sanitizedHtml"></div>
          <div v-else class="mail-content plain-text">{{ bodyText || '（无正文内容）' }}</div>
        </template>
        <div class="readonly-note">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          只读模式：本中心不会写回或删除 Microsoft 邮箱中的任何内容
        </div>
      </div>
    </template>
    <div v-else class="reader-empty">
      <div class="empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 6L2 7" />
        </svg>
      </div>
      <p>选择一封邮件查看内容</p>
      <span>邮件正文将在这里以只读方式展示</span>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import type { Message } from '@/types'
import { avatarStyle, senderName, senderInitial, formatFullDate } from '@/utils/format'

const props = defineProps<{
  message: Message | null
  bodyHtml: string
  bodyText: string
  bodyLoading: boolean
  accountEmail: string
}>()

defineEmits<{
  (e: 'close'): void
}>()

const sanitizedHtml = computed(() => {
  const html = props.bodyHtml || (props.message?.html ?? '')
  if (!html) return ''
  const sanitized = DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'object', 'embed', 'iframe', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset']
  })
  const template = document.createElement('template')
  template.innerHTML = sanitized
  template.content.querySelectorAll('img').forEach((image) => {
    const source = image.getAttribute('src') || ''
    if (/^(https?:|\/\/|cid:)/i.test(source)) image.removeAttribute('src')
    image.setAttribute('referrerpolicy', 'no-referrer')
  })
  template.content.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
    link.setAttribute('referrerpolicy', 'no-referrer')
  })
  template.content.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (/url\s*\(/i.test(element.getAttribute('style') || '')) element.removeAttribute('style')
  })
  return template.innerHTML
})
</script>

<style scoped>
.reader {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--mm-panel);
}

.reader-head {
  padding: 22px 28px 0;
  flex-shrink: 0;
}

.reader-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.reader-subject {
  flex: 1;
  min-width: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--mm-border);
  background: var(--mm-panel);
  color: var(--mm-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.close-btn:hover {
  background: var(--mm-hover);
  color: var(--mm-text);
}

.sender-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--mm-border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--mm-bg);
  margin-top: 16px;
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

.sender-info {
  flex: 1;
  min-width: 0;
}

.sender-name {
  font-size: 13.5px;
  font-weight: 600;
}

.sender-mail {
  font-size: 12.5px;
  color: var(--mm-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sender-date {
  font-size: 12.5px;
  color: var(--mm-text-3);
  flex-shrink: 0;
}

.reader-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 28px 24px;
}

.mail-content {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: #33383f;
  font-size: 13.5px;
  line-height: 1.7;
}

.body-loading {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--mm-text-3);
  padding: 20px 0;
}

.spinner {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid var(--mm-border-strong);
  border-top-color: var(--mm-accent);
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.mail-content.plain-text {
  white-space: pre-wrap;
}

.mail-content :deep(*) {
  box-sizing: border-box;
  max-width: 100% !important;
  min-width: 0 !important;
}

.mail-content > :deep(*) {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.mail-content :deep([style*="position"]) {
  position: static !important;
  inset: auto !important;
  transform: none !important;
  z-index: auto !important;
}

.mail-content :deep(img),
.mail-content :deep(video),
.mail-content :deep(iframe) {
  display: block;
  max-width: 100% !important;
  height: auto !important;
}

.mail-content :deep(table) {
  max-width: 100% !important;
  height: auto !important;
}

.mail-content :deep(pre) {
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.readonly-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mm-text-3);
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px dashed var(--mm-border);
}

.reader-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--mm-text-2);
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--mm-bg);
  border: 1px solid var(--mm-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mm-text-3);
  margin-bottom: 10px;
}

.reader-empty p {
  font-size: 14px;
  font-weight: 600;
}

.reader-empty span {
  font-size: 12.5px;
  color: var(--mm-text-3);
}
</style>
