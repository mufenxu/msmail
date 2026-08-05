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

watch(
  () => props.accounts,
  () => {
    selected.value = []
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

.manager-foot {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--mm-text-3);
}
</style>
