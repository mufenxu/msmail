import { createApp } from 'vue'
import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElLoading,
  ElTable,
  ElTableColumn,
  ElUpload
} from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)
;[
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElLoading,
  ElTable,
  ElTableColumn,
  ElUpload
].forEach((plugin) => app.use(plugin))

app.mount('#app')
