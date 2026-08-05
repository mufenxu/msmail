# Monkey Mail

Monkey Mail 是一个面向 Microsoft Outlook 的多邮箱只读收件中心。它使用 OAuth2 refresh token 获取访问令牌，优先尝试 Microsoft Graph，失败后回退到 Outlook IMAP OAuth2，只读取收件箱或垃圾箱邮件。

## 功能

- 服务端 SQLite 持久化多个邮箱配置和已读取邮件
- 支持文件上传和粘贴导入
- 支持 Microsoft Graph 与 Outlook IMAP OAuth2
- 只读查看 `INBOX` 和 `Junk`
- 支持可选 HTTP/SOCKS5 代理
- 不提供删除邮件、清空邮箱或导出令牌功能

## 本地运行

### 后端

```powershell
npm install
npm run start
```

后端默认监听 `PORT` 环境变量指定的端口，未配置时使用 `3000`。业务 API 必须配置 `PASSWORD`，否则会返回 503；`/api/health` 不需要密码，可用于平台健康检查。

默认数据库文件为 `data/monkey-mail.sqlite`，可通过 `DATA_DIR` 或 `SQLITE_PATH` 调整位置。refresh token 在 SQLite 中使用 `DATA_ENCRYPTION_KEY` 加密保存；生产环境应配置稳定的密钥并持久化数据库目录。

### 前端

前端源码位于 `web/MS_OAuth2API_Next_Web`。修改后执行：

```powershell
Set-Location web/MS_OAuth2API_Next_Web
npm install
npm run build
```

后端会直接读取 `web/MS_OAuth2API_Next_Web/dist` 下的静态文件。

## 导入格式

推荐使用三段格式，每行一条：

```text
email----client_id----refresh_token
```

也兼容旧的四段格式：

```text
email----api_password----client_id----refresh_token
```

四段格式中的 `api_password` 会迁移到页面顶部的服务访问密码配置，不再保存到单条邮箱记录中。刷新令牌不会显示在邮箱列表，也不能从页面导出；首次使用新版本时，旧浏览器数据会自动迁移到服务端 SQLite。

## API

### 健康检查

```text
GET /api/health
```

返回服务状态，不需要邮箱参数或 API 密码。

### 获取最新邮件

```text
GET/POST /api/mail_new
```

### 获取全部邮件

```text
GET/POST /api/mail_all
```

业务接口优先使用 `password`、`account_id` 和 `mailbox`，服务端从 SQLite 读取邮箱凭据；也兼容直接提供 `refresh_token`、`client_id` 和 `email` 的旧调用方式。`mailbox` 支持 `INBOX` 或 `Junk`；`socks5` 和 `http` 代理参数可选。收取成功后邮件会写入 SQLite。

### 账号和缓存邮件

```text
POST /api/accounts/list
POST /api/accounts
PUT /api/accounts/:id
DELETE /api/accounts/:id
POST /api/accounts/:id/messages/list
POST /api/accounts/:id/messages/cache
```

### 测试代理

```text
GET/POST /api/test-proxy
```

该接口仍需通过通用参数校验，并接受可选的 `socks5` 或 `http` 代理参数。

## MonkeyCode Node Pool

在 MonkeyCode 的项目部署页面配置：

- 安装命令：`npm install`
- 启动命令：`npm run start`
- 服务端口：使用平台分配的 `PORT`
- 健康检查：`/api/health`
- 环境变量：`PASSWORD`、`API_NAME`、`PORT`、`MS_TENANT`、`DATA_DIR`、`DATA_ENCRYPTION_KEY`
- `MS_TENANT` 默认使用 `common`；如果 refresh token 来自固定组织租户，可改为对应租户 ID

请将 `PASSWORD`、`DATA_ENCRYPTION_KEY` 和其他运行时配置放在平台环境变量中，不要提交真实 `.env`。需要为 `DATA_DIR` 指向的平台持久化目录配置持久卷，否则应用节点重建时 SQLite 数据会丢失。
