<template>
  <el-dialog v-model="visible" title="导入账号" width="640" class="mm-dialog" append-to-body>
    <div class="import-tabs">
      <button class="tab" :class="{ active: tab === 'file' }" @click="tab = 'file'">文件导入</button>
      <button class="tab" :class="{ active: tab === 'paste' }" @click="tab = 'paste'">粘贴导入</button>
    </div>

    <div v-if="tab === 'file'" class="import-body">
      <div class="dropzone" @click="pickFile">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
        <p>点击选择或拖拽 <b>.txt / .csv</b> 文件</p>
        <span>每行一条账号，支持三/四段格式</span>
      </div>
      <el-upload
        ref="uploadRef"
        class="hidden-upload"
        :limit="1"
        :show-file-list="false"
        :auto-upload="false"
        accept=".txt,.csv"
        :on-exceed="handleExceed"
        :on-change="handleFileChange"
      >
        <el-button>选择文件</el-button>
      </el-upload>
      <div v-if="fileName" class="file-name">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {{ fileName }}
      </div>
    </div>

    <div v-else class="import-body">
      <el-input
        v-model="copyTextarea"
        type="textarea"
        :rows="10"
        placeholder="每行一条：email----client_id----refresh_token&#10;&#10;也兼容：email----api_password----client_id----refresh_token"
      />
    </div>

    <div class="import-options">
      <div class="option-row">
        <label>分隔符</label>
        <el-input v-model="splitSymbol" class="option-input" placeholder="----" />
        <label>访问密码</label>
        <el-input v-model="apiPassword" type="password" show-password class="option-input" placeholder="服务共享密码" />
      </div>
      <div class="format-hint">
        推荐格式：<code>email----client_id----refresh_token</code>；四段格式中的第二段为访问密码，导入时会自动填入并保存到本地。
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="handleImport">开始导入</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { genFileId, ElMessage } from 'element-plus'
import type { UploadInstance, UploadProps, UploadRawFile } from 'element-plus'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  apiPassword: string
}>()

const emit = defineEmits<{
  (e: 'imported'): void
  (e: 'set-password', value: string): void
}>()

type ImportTab = 'file' | 'paste'

const tab = ref<ImportTab>('file')
const uploadRef = ref<UploadInstance>()
const fileName = ref('')
const pendingLines = ref<string[]>([])
const copyTextarea = ref('')
const splitSymbol = ref('----')
const apiPassword = ref(props.apiPassword)
const importing = ref(false)

const pickFile = () => {
  const input = uploadRef.value?.$el?.querySelector('input[type="file"]') as HTMLInputElement | undefined
  input?.click()
}

const handleExceed: UploadProps['onExceed'] = (files) => {
  uploadRef.value?.clearFiles()
  const file = files[0] as UploadRawFile
  file.uid = genFileId()
  uploadRef.value?.handleStart(file)
}

const handleFileChange: UploadProps['onChange'] = (file, fileList = []) => {
  if (!fileList.length) {
    fileName.value = ''
    return
  }
  const rawFile = fileList[0]?.raw as UploadRawFile | undefined
  if (!rawFile) {
    fileName.value = ''
    return
  }
  if (
    !rawFile.type.match(/text\/(plain|csv)/) &&
    !rawFile.name.endsWith('.txt') &&
    !rawFile.name.endsWith('.csv')
  ) {
    ElMessage.error('请上传 .txt 或 .csv 格式的文件')
    uploadRef.value?.clearFiles()
    fileName.value = ''
    return
  }
  fileName.value = rawFile.name.length > 18 ? `${rawFile.name.slice(0, 18)}…` : rawFile.name
  parseFileContent(rawFile)
}

const parseFileContent = (file: UploadRawFile) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const content = (e.target?.result as string) || ''
      pendingLines.value = content.split('\n')
      if (!pendingLines.value.length) ElMessage.warning('未在文件中找到邮箱地址')
    } catch (error) {
      console.error('解析文件失败:', error)
      ElMessage.error('解析文件失败，请检查文件格式')
    }
  }
  reader.onerror = () => {
    ElMessage.error('读取文件失败')
  }
  reader.readAsText(file)
}

const parseLines = (lines: string[]): Array<{ email: string; client_id: string; refresh_token: string }> =>
  lines
    .map((item) => {
      const parts = item.split(splitSymbol.value)
      return {
        email: parts[0]?.trim() || '',
        client_id: parts.length >= 4 ? parts[2]?.trim() || '' : parts[1]?.trim() || '',
        refresh_token: (
          parts.length >= 4 ? parts.slice(3).join(splitSymbol.value) : parts.slice(2).join(splitSymbol.value)
        ).trim()
      }
    })
    .filter((item) => item.email && item.client_id && item.refresh_token)

const requestApi = async (url: string, method = 'POST', body: Record<string, unknown> = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password: apiPassword.value }),
      signal: controller.signal
    })
    const data = await response.json()
    if (!response.ok || data.code != 200) {
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

const handleImport = async () => {
  const rawLines =
    tab.value === 'file'
      ? pendingLines.value
      : copyTextarea.value
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item !== '')

  if (!rawLines.length) {
    ElMessage.warning('请先选择文件或粘贴邮箱地址')
    return
  }

  const imported = parseLines(rawLines)
  if (!imported.length) {
    ElMessage.warning('未解析到有效的账号，请检查分隔符或内容格式')
    return
  }

  const importedPassword = rawLines
    .map((item) => item.split(splitSymbol.value))
    .find((parts) => parts.length >= 4)?.[1]?.trim()

  let finalPassword = apiPassword.value
  if (!finalPassword && importedPassword) {
    finalPassword = importedPassword
    apiPassword.value = importedPassword
  }
  if (!finalPassword) {
    ElMessage.warning('请先填写访问密码')
    return
  }

  importing.value = true
  try {
    for (const account of imported) {
      await requestApi('/api/accounts', 'POST', account)
    }
    emit('set-password', finalPassword)
    ElMessage.success(`导入成功，共 ${imported.length} 条`)
    visible.value = false
    emit('imported')
    fileName.value = ''
    pendingLines.value = []
    copyTextarea.value = ''
    uploadRef.value?.clearFiles()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '邮箱保存失败')
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.import-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--mm-border);
  margin-bottom: 16px;
}

.tab {
  font-size: 13px;
  color: var(--mm-text-2);
  padding: 8px 14px 10px;
  cursor: pointer;
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--mm-text);
}

.tab.active {
  color: var(--mm-accent);
  font-weight: 600;
  border-bottom-color: var(--mm-accent);
}

.import-body {
  min-height: 170px;
}

.dropzone {
  border: 1.5px dashed var(--mm-border-strong);
  border-radius: 12px;
  padding: 30px 20px;
  text-align: center;
  color: var(--mm-text-3);
  background: var(--mm-bg);
  cursor: pointer;
  transition: all 0.15s ease;
}

.dropzone:hover {
  border-color: var(--mm-accent);
  background: var(--mm-accent-soft);
  color: var(--mm-accent);
}

.dropzone p {
  font-size: 13px;
  color: var(--mm-text-2);
  margin-top: 8px;
}

.dropzone p b {
  color: var(--mm-accent);
}

.dropzone span {
  font-size: 12px;
}

.hidden-upload {
  display: none;
}

.file-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12.5px;
  color: #12713c;
  background: #e9f7ef;
  border: 1px solid #bfe6cf;
  border-radius: 7px;
  padding: 5px 10px;
}

.import-options {
  margin-top: 18px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.option-row label {
  font-size: 12.5px;
  color: var(--mm-text-2);
  flex-shrink: 0;
}

.option-input {
  width: 140px;
}

.format-hint {
  font-size: 12px;
  color: var(--mm-text-3);
  margin-top: 10px;
  line-height: 1.7;
}

.format-hint code {
  background: #f2f4f7;
  border: 1px solid var(--mm-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11.5px;
  color: var(--mm-text-2);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
