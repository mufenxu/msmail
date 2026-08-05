<template>
  <router-view></router-view>
</template>

<style>
:root {
  --mm-bg: #f3f5f7;
  --mm-panel: #ffffff;
  --mm-sidebar: #fafbfc;
  --mm-border: #e3e7ea;
  --mm-border-strong: #d5dade;
  --mm-text: #1a1d21;
  --mm-text-2: #5f666f;
  --mm-text-3: #8a9199;
  --mm-accent: #0f6cbd;
  --mm-accent-soft: #e4f0fb;
  --mm-accent-border: #b8d8f5;
  --mm-hover: #eef1f4;
  --mm-danger: #d13438;
  --mm-ok: #3aa76d;
  --mm-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);

  --el-color-primary: #0f6cbd;
  --el-color-primary-light-3: #3d8acd;
  --el-color-primary-light-5: #6ba7dd;
  --el-color-primary-light-7: #9ec5ea;
  --el-color-primary-light-8: #b8d5f0;
  --el-color-primary-light-9: #e4f0fb;
  --el-color-primary-dark-2: #0c5ea6;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--mm-bg);
  color: var(--mm-text);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-thumb {
  background: #d2d7dc;
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: #b9bfc7;
  background-clip: padding-box;
}

::-webkit-scrollbar-track {
  background: transparent;
}

.mm-dialog {
  border-radius: 12px;
  overflow: hidden;
}

.mm-dialog .el-dialog__header {
  padding: 18px 22px 12px;
  margin-right: 0;
}

.mm-dialog .el-dialog__title {
  font-size: 15.5px;
  font-weight: 700;
}

.mm-dialog .el-dialog__body {
  padding: 8px 22px 12px;
}

.mm-dialog .el-dialog__footer {
  padding: 12px 22px 16px;
}

.mm-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
}
</style>
