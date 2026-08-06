<template>
  <el-dialog
    v-model="visible"
    title="重新授权邮箱"
    width="500"
    class="mm-dialog"
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <div v-if="stage === 'starting'" class="reauth-state">
      <div class="state-spinner"></div>
      <strong>正在生成 Microsoft 授权代码</strong>
      <p>请稍候，不会读取或显示你的邮箱密码。</p>
    </div>

    <div v-else-if="stage === 'pending' && flow" class="reauth-content">
      <div class="reauth-account">{{ account?.email }}</div>
      <p class="reauth-desc">请打开 Microsoft 验证页面，登录该邮箱并输入下面的代码：</p>
      <div class="code-box">{{ flow.user_code }}</div>
      <div class="reauth-actions">
        <a
          class="verify-link"
          :href="verificationLink"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开 Microsoft 验证页面
        </a>
        <el-button size="small" @click="copyCode">复制代码</el-button>
      </div>
      <div class="polling-state">
        <span class="polling-dot"></span>
        <span>等待授权完成，完成后会自动保存新令牌</span>
      </div>
    </div>

    <div v-else-if="stage === 'success'" class="reauth-state success-state">
      <div class="state-icon">✓</div>
      <strong>授权成功</strong>
      <p>新的授权令牌已安全保存，可以继续同步该邮箱。</p>
    </div>

    <div v-else class="reauth-state error-state">
      <div class="state-icon">!</div>
      <strong>授权未完成</strong>
      <p>{{ errorMessage }}</p>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="stage === 'error'" type="primary" @click="begin">重新开始</el-button>
        <el-button @click="closeDialog">{{ stage === 'pending' ? '取消授权' : '关闭' }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Account } from '@/types'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ account: Account | null }>()
const emit = defineEmits<{
  (e: 'completed', accountId: number): void
}>()

type Stage = 'starting' | 'pending' | 'success' | 'error'
type DeviceFlow = {
  flow_id: string
  verification_uri: string
  verification_uri_complete?: string
  user_code: string
  interval: number
}

const stage = ref<Stage>('starting')
const flow = ref<DeviceFlow | null>(null)
const errorMessage = ref('')
let pollTimer: number | undefined
let operationId = 0

const verificationLink = computed(() => flow.value?.verification_uri_complete || flow.value?.verification_uri || '')

const stopPolling = () => {
  if (pollTimer != null) {
    window.clearTimeout(pollTimer)
    pollTimer = undefined
  }
}

const requestApi = async (url: string) => {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin' })
  const data = await response.json()
  if (!response.ok || data.code != 200) {
    throw new Error(data.error || data.message || `请求失败（HTTP ${response.status}）`)
  }
  return data.data
}

const poll = async () => {
  if (!flow.value || !props.account?.id || stage.value !== 'pending') return
  try {
    const data = (await requestApi(
      `/api/accounts/${props.account.id}/reauthorize/device/${encodeURIComponent(flow.value.flow_id)}/poll`
    )) as { status: string; retry_after?: number; message?: string; account_id?: number }
    if (data.status === 'completed') {
      stopPolling()
      stage.value = 'success'
      emit('completed', data.account_id || props.account.id)
      return
    }
    if (data.status === 'expired' || data.status === 'failed') {
      stopPolling()
      errorMessage.value = data.message || 'Microsoft 授权失败'
      stage.value = 'error'
      return
    }
    const waitSeconds = Math.max(Number(data.retry_after) || flow.value.interval || 5, 2)
    pollTimer = window.setTimeout(poll, waitSeconds * 1000)
  } catch (error) {
    stopPolling()
    errorMessage.value = error instanceof Error ? error.message : '授权状态查询失败'
    stage.value = 'error'
  }
}

const begin = async () => {
  const currentOperation = ++operationId
  stopPolling()
  flow.value = null
  errorMessage.value = ''
  stage.value = 'starting'
  if (!props.account?.id) {
    errorMessage.value = '未找到要授权的邮箱账号'
    stage.value = 'error'
    return
  }
  try {
    const nextFlow = (await requestApi(`/api/accounts/${props.account.id}/reauthorize/device`)) as DeviceFlow
    if (!visible.value || currentOperation !== operationId) {
      try {
        await requestApi(
          `/api/accounts/${props.account.id}/reauthorize/device/${encodeURIComponent(nextFlow.flow_id)}/cancel`
        )
      } catch {
        // The server-side flow expires automatically if cancellation races with closing.
      }
      return
    }
    flow.value = nextFlow
    stage.value = 'pending'
    pollTimer = window.setTimeout(poll, Math.max(flow.value.interval || 5, 2) * 1000)
  } catch (error) {
    if (!visible.value || currentOperation !== operationId) return
    errorMessage.value = error instanceof Error ? error.message : '授权流程启动失败'
    stage.value = 'error'
  }
}

const cancelFlow = async () => {
  if (!flow.value || !props.account?.id) return
  try {
    await requestApi(
      `/api/accounts/${props.account.id}/reauthorize/device/${encodeURIComponent(flow.value.flow_id)}/cancel`
    )
  } catch {
    // The flow expires server-side if cancellation cannot be delivered.
  }
}

const closeDialog = () => {
  operationId += 1
  stopPolling()
  if (stage.value === 'pending') void cancelFlow()
  visible.value = false
}

const copyCode = async () => {
  if (!flow.value?.user_code) return
  try {
    await navigator.clipboard.writeText(flow.value.user_code)
    ElMessage.success('代码已复制')
  } catch {
    ElMessage.warning('复制失败，请手动输入代码')
  }
}

watch(visible, (value) => {
  if (value) void begin()
  else stopPolling()
})

onBeforeUnmount(stopPolling)
</script>

<style scoped>
.reauth-content {
  color: var(--mm-text);
}

.reauth-account {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.reauth-desc {
  margin: 10px 0 14px;
  color: var(--mm-text-2);
  font-size: 13px;
  line-height: 1.6;
}

.code-box {
  padding: 14px;
  border: 1px solid var(--mm-accent-border);
  border-radius: 8px;
  background: var(--mm-accent-soft);
  color: var(--mm-accent);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 2px;
  text-align: center;
}

.reauth-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.verify-link {
  color: var(--mm-accent);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.polling-state {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 18px;
  color: var(--mm-text-3);
  font-size: 12px;
}

.polling-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--mm-accent);
  box-shadow: 0 0 0 3px var(--mm-accent-soft);
  flex-shrink: 0;
}

.reauth-state {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.reauth-state p {
  max-width: 360px;
  margin: 0;
  color: var(--mm-text-3);
  font-size: 12.5px;
  line-height: 1.6;
}

.state-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--mm-border);
  border-top-color: var(--mm-accent);
  border-radius: 50%;
  animation: reauth-spin 0.8s linear infinite;
}

.state-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--mm-accent-soft);
  color: var(--mm-accent);
  font-size: 20px;
  font-weight: 700;
}

.success-state .state-icon {
  background: #e9f7ef;
  color: var(--mm-ok);
}

.error-state .state-icon {
  background: #fff5e5;
  color: #a16b10;
}

@keyframes reauth-spin {
  to { transform: rotate(360deg); }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
