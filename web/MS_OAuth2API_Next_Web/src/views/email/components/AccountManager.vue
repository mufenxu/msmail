<template>
  <el-dialog v-model="visible" title="账号管理" width="860" class="mm-dialog" append-to-body>
    <div class="manager-toolbar">
      <el-button size="small" type="primary" plain @click="$emit('import')">导入账号</el-button>
      <el-button size="small" @click="$emit('configure-password')">访问密码</el-button>
      <span class="spacer"></span>
      <el-button size="small" type="danger" plain :disabled="!selected.length" @click="emitBatchDelete">
        批量删除
      </el-button>
      <el-button size="small" type="danger" plain :disabled="!accounts.length" @click="$emit('delete-accounts', accounts)">
        全部删除
      </el-button>
    </div>

    <el-table :data="accounts" style="width: 100%" :max-height="420" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="46" />
      <el-table-column label="账号" min-width="250">
        <template #default="{ row }">
          <div class="cell-user">
            <div class="acc-avatar" :style="avatarStyle(row.email)">{{ senderInitial(row.email) }}</div>
            <div class="cell-body">
              <div class="cell-mail">{{ row.email }}</div>
              <div class="cell-sub">{{ domainLabel(row.email) }} · 客户端 ID {{ shortId(row.client_id) }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="邮箱密码" width="180">
        <template #default="{ row }">
          <div v-if="row.has_mail_password" class="mail-password">
            <span class="password-value">
              {{ passwordVisible[accountKey(row)] ? (passwordValues[accountKey(row)] || '加载中…') : '••••••••' }}
            </span>
            <button
              type="button"
              class="password-toggle"
              :title="passwordVisible[accountKey(row)] ? '隐藏邮箱密码' : '显示邮箱密码'"
              :aria-label="passwordVisible[accountKey(row)] ? '隐藏邮箱密码' : '显示邮箱密码'"
              :disabled="passwordLoading[accountKey(row)]"
              @click.stop="togglePassword(row)"
            >
              <svg v-if="!passwordVisible[accountKey(row)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3l18 18" />
                <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17.7 17.7 0 0 1-3.2 4.2" />
                <path d="M6.2 6.3C3.8 8 2.5 12 2.5 12a17.6 17.6 0 0 0 4.1 4.8A9.2 9.2 0 0 0 12 19c1.1 0 2.1-.2 3-.6" />
              </svg>
            </button>
          </div>
          <span v-else class="password-empty">未提供</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170" />
      <el-table-column label="操作" width="150" align="right">
        <template #default="{ row }">
          <el-button size="small" @click="$emit('edit', row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="$emit('delete-accounts', [row])">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="manager-foot">共 {{ accounts.length }} 个账号</div>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Account } from '@/types'
import { avatarStyle, senderInitial, domainLabel } from '@/utils/format'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  accounts: Account[]
}>()

const emit = defineEmits<{
  (e: 'edit', account: Account): void
  (e: 'delete-accounts', accounts: Account[]): void
  (e: 'import'): void
  (e: 'configure-password'): void
}>()

const selected = ref<Account[]>([])
const passwordValues = ref<Record<string, string>>({})
const passwordVisible = ref<Record<string, boolean>>({})
const passwordLoading = ref<Record<string, boolean>>({})

const accountKey = (account: Account) => String(account.id ?? account.email)

const requestPassword = async (account: Account) => {
  const response = await fetch(`/api/accounts/${account.id}/password`, {
    method: 'GET',
    credentials: 'same-origin'
  })
  const data = await response.json()
  if (!response.ok || data.code != 200) {
    throw new Error(data.error || data.message || `请求失败（HTTP ${response.status}）`)
  }
  return data.data as { password: string }
}

const togglePassword = async (account: Account) => {
  if (!account.has_mail_password || account.id == null) return
  const key = accountKey(account)
  if (Object.prototype.hasOwnProperty.call(passwordValues.value, key)) {
    passwordVisible.value = { ...passwordVisible.value, [key]: !passwordVisible.value[key] }
    return
  }
  passwordLoading.value = { ...passwordLoading.value, [key]: true }
  try {
    const data = await requestPassword(account)
    passwordValues.value = { ...passwordValues.value, [key]: data.password }
    passwordVisible.value = { ...passwordVisible.value, [key]: true }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '邮箱密码读取失败')
  } finally {
    passwordLoading.value = { ...passwordLoading.value, [key]: false }
  }
}

watch(
  () => props.accounts,
  () => {
    selected.value = []
    passwordValues.value = {}
    passwordVisible.value = {}
    passwordLoading.value = {}
  }
)

const onSelectionChange = (rows: Account[]) => {
  selected.value = rows
}

const emitBatchDelete = () => {
  if (!selected.value.length) {
    ElMessage.warning('请选择要删除的账号')
    return
  }
  emit('delete-accounts', selected.value)
}

const shortId = (value: string): string => {
  const trimmed = (value || '').trim()
  if (trimmed.length <= 12) return trimmed || '—'
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}
</script>

<style scoped>
.manager-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.manager-toolbar .spacer {
  flex: 1;
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.acc-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
}

.cell-body {
  min-width: 0;
}

.cell-mail {
  font-size: 13px;
  font-weight: 600;
}

.cell-sub {
  font-size: 12px;
  color: var(--mm-text-3);
}

.mail-password {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.password-value {
  min-width: 76px;
  overflow: hidden;
  color: var(--mm-text-2);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.password-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  background: transparent;
  color: var(--mm-text-3);
  cursor: pointer;
}

.password-toggle:hover:not(:disabled) {
  border-color: var(--mm-primary);
  color: var(--mm-primary);
}

.password-toggle:disabled {
  cursor: wait;
  opacity: 0.55;
}

.password-empty {
  color: var(--mm-text-3);
  font-size: 12px;
}

.manager-foot {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--mm-text-3);
}
</style>
