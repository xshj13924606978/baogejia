# 登录注册认证与绑定全流程报告

> 任务标识：`[20260829-1000/登录注册认证与绑定全流程报告]`
> 文档版本：v1.0  ·  撰写时间：2026-08-29
> 适用代码基线：cnb/main  HEAD（含 #20260828-2156 账号闭环 + #20260828-账号统一 + #20260828-1345 邮箱验证）

---

## 0. 目录与执行摘要

- 1. 全局架构总览
- 2. 注册流程
- 3. 登录流程
- 4. 会话管理
- 5. 密码管理
- 6. 第三方登录（微信 / QQ / GitHub / Google）
- 7. 绑定与解绑（手机 / 邮箱 / 微信）
- 8. 验证码体系
- 9. 数据库 Schema 关键表
- 10. 前端页面与状态管理
- 11. 安全机制与限流
- 12. 已知问题 / 遗漏 / 风险
- 13. 改进建议与下一步行动

**核心结论（一句话）**：项目采用「手机号 + 短信验证码」作为唯一强制入口（邮箱 / 微信 / QQ 作为可选绑定或登录方式），使用自签 HMAC session_token + httpOnly cookie 双保险建立会话，所有敏感操作（绑定 / 解绑 / 改密 / 注销）均先服务端后本地。扫码未绑定场景已统一走「暂存 oauth_pending_logins → /wechat/link 引导」流程，避免历史静默建号问题。

---

## 1. 全局架构总览

### 1.1 核心分层

| 层级 | 目录 / 文件 | 职责 |
| --- | --- | --- |
| 入口 UI | `src/app/{login,register,forgot-password,reset-password,complete-profile,wechat,account,403}/page.tsx` | 用户交互 |
| 前端状态 | `src/contexts/UserContext.tsx`、`src/lib/password-policy.ts` | 登录态、密码策略、验证码本地存储 |
| 业务 API | `src/app/api/auth/**/route.ts` | 注册 / 登录 / 验证码 / OAuth / 资料 |
| 领域服务 | `src/lib/{auth-utils,phone-auth,email-verification,permission-service,user-log-service,oauth-service,rate-limit}.ts` | 业务规则、限流、日志 |
| 数据访问 | `src/storage/database/supabase-client.ts` | Supabase 客户端（anon + service_role 双 client） |
| 数据库 | `database/migrations/*.sql`（008/044/049/057/060/075/087/091 等） | 表结构、函数、视图 |
| 中间件 | `src/middleware/permission-middleware.ts` | 路由权限 |

### 1.2 关键设计原则

1. **手机号为主键**：注册流程从邮箱/用户名统一迁移到「手机号+验证码」（#20260820-1600）。
2. **服务端权威**：所有写操作（绑定、解绑、改密、注销）必须服务端先成功再同步本地；同步失败则回滚本地（#20260827-0826-2）。
3. **会话双轨**：`httpOnly cookie`（防 XSS）+ `localStorage session_token`（防 cookie 失效）兜底，互为备份。
4. **扫码未绑定不静默建号**：必须由用户主动确认手机号（#20260828-账号统一，迁移 091）。
5. **可降级**：`/api/auth/login` 后端未命中时（code=USER_NOT_FOUND）可回退 localStorage（仅前端兜底，不会签发 cookie）。

---

## 2. 注册流程

### 2.1 注册方式

| 方式 | 状态 | 说明 |
| --- | --- | --- |
| 手机号 + 短信验证码 | ✅ 主流程 | `/api/auth/register`（唯一对外注册入口） |
| 邮箱 + 密码 | ⚠️ 兼容保留 | 前端 `UserContext.emailRegister` 仅 localStorage，**实际生产不应使用** |
| 手机号 + 短信（自动建号） | ✅ | 通过 `/api/auth/login-with-sms` 触发，未注册则自动注册 |
| 微信扫码未绑定 → 引导注册 | ✅ | `/wechat/link?t=<token>` + `/api/auth/oauth-link` |
| QQ 扫码未绑定 → 引导注册 | ✅ | 同微信链路 |

### 2.2 移动端注册（手机号 + 验证码）

**触发**：`/register` 页面（`src/app/register/page.tsx`）

**步骤**：

1. 用户输入 11 位手机号 → `PHONE_REGEX = /^1[3-9]\d{9}$/`
2. 点击「获取验证码」→ `POST /api/auth/send-sms-code { phone, purpose: 'register' }`
3. 后端流程：
   - 调用 `checkSmsRateLimit(phone, ip)`（`src/lib/rate-limit.ts`）：60 秒冷却 + 每天 10 条 + IP 5/min
   - 生成 6 位数字验证码，写入 `sms_verification_codes` 表（迁移 057）
   - 调用 SMS 网关发送（开发环境返回 `data.code` 便于联调）
4. 用户输入 6 位验证码 → 点击「注册」
5. 提交 `POST /api/auth/register { phone, sms_code, invite_code? }`
6. 后端 `registerUserByPhone`（`src/lib/phone-auth.ts`）：
   - 验证短信验证码（`/api/auth/verify-sms-code`）：消费（设 `consumed_at`），校验 purpose='register'，最多 5 次尝试
   - 检查手机号是否已注册：`users.metadata.phone` 或 `users.username='1<phone>'`
   - 生成新 user：
     - `id = uuid_generate_v4()`
     - `email = unbound_<uid>@local.invalid`（占位，后续用户可改）
     - `username = '1' + phone` 或 `user_<random4>`
     - `metadata.phone = phone`、`metadata.phone_verified = true`
     - `role = 'user'`、`status = 'active'`
     - 邀请码有效 → 发放注册积分
   - **建立会话** `establishUserSession(user, response)`：
     - 签发 HMAC session_token（详见 §4）
     - 写入 `httpOnly` cookie（`session_token` / `quote_session_token`）
     - 记录 `user_logs.action_type='login'`、`metadata.is_new_user=true`
   - 返回 `{ success, user, sessionToken, isNewUser: true }`
7. 前端 `register/page.tsx`：
   - 清除 `LOGGED_OUT_FLAG`（防止从 cookie 恢复时被拦截）
   - 写入 `localStorage.user` / `localStorage.session_token`
   - `window.location.href = '/complete-profile'`（**整页跳转**确保新 cookie 生效）

### 2.3 注册后引导：完善资料

**页面**：`/complete-profile`（`src/app/complete-profile/page.tsx`）

**功能**：

- 修改临时用户名（`user_1381` 格式，2-30 位 `[\w\u4e00-\u9fa5]`）
- 设置登录密码（从 `/api/auth/password-policy` 读取 `minLength`，默认 6）
- 绑定微信（弹窗扫码）：`/api/auth/oauth-url?provider=wechat&mode=bind` → `window.open` 弹窗 → 绑定结果通过 `wechat_bind-result` 中间页 `postMessage` 回主窗口 + 2.5 秒轮询 `/api/auth/bind` 兜底
- 「跳过」按钮直接回首页

**保存**：`PUT /api/auth/profile { username?, password? }`，请求带 `x-user-token` 头（双保险），后端同时支持 cookie 兜底鉴权。

---

## 3. 登录流程

### 3.1 登录方式一览

| 方式 | 入口 | API | 适用场景 |
| --- | --- | --- | --- |
| 手机号 + 密码 | `/login` → 密码 Tab | `POST /api/auth/login { username: phone, password }` | 主流，**支持以手机号/邮箱/用户名/姓名作为账号** |
| 邮箱 + 密码 | `/login` → 密码 Tab | 同上 | 同上 |
| 用户名 + 密码 | `/login` → 密码 Tab | 同上 | 同上 |
| 姓名 + 密码 | `/login` → 密码 Tab | 同上 | 重名时返回 `code=NAME_NOT_UNIQUE` 提示改用其他方式（#20260822-2028） |
| 手机号 + 短信验证码 | `/login` → 手机 Tab | `POST /api/auth/login-with-sms { phone, code }` | 未注册自动建号（#20260820-1600） |
| 微信扫码 | `/login` → 扫码 Tab | `/api/auth/oauth-url?provider=wechat&mode=login` → `callback` → `bind` 或直接登录 | PC 端 |
| QQ 扫码 | `/login` → 第三方按钮 | `/api/auth/oauth-url?provider=qq&mode=login` | 同上 |
| GitHub / Google | `/login` → 第三方按钮 | 前端入口存在，**后端未完整实现**（参见 §12） | — |

### 3.2 密码登录（统一入口 `/api/auth/login`）

**前端**：`UserContext.passwordLogin(account, password)`

1. 去除首尾空白
2. `POST /api/auth/login { username: account, password }`（前端不区分类型，统一字段名 username）
3. 后端查 user（4 轮查询，按顺序尝试）：
   - 第 1 轮：email 精确匹配
   - 第 2 轮：phone 精确匹配（先查 `metadata.phone`，再查 `username='1<phone>'`）
   - 第 3 轮：username 精确匹配
   - 第 4 轮：full_name 精确匹配（重名时 `code: NAME_NOT_UNIQUE`，401）
4. 校验 `password_hash`（bcrypt）+ `checkLoginRateLimit`（15 分钟 5 次 → 锁 30 分钟，按 IP+account 组合）
5. 成功 → `establishUserSession` → 返回 `{ user, sessionToken }`
6. 前端：
   - 合并 localStorage 用户（supabaseUser.id 精确匹配优先，避免历史残留；#20260822-1645 修复）
   - 清除 `LOGGED_OUT_FLAG`、写入 `user` / `token` / `session_token`
   - `router.push(getRedirect())`（`?redirect=` 参数白名单校验，仅允许站内 `/` 开头且非 `//` 开头）

**降级**：仅当 `code === 'USER_NOT_FOUND'` 时才尝试 localStorage 兜底（**防止密码错/服务异常时假登录**——#20260827 修复）。

### 3.3 短信登录（自动建号）

**前端**：`UserContext.phoneLogin(phone, code)`

1. `POST /api/auth/login-with-sms { phone, code }`
2. 后端先 `verify-sms-code`（purpose=login 或 general）
3. 查 user by phone → 找到 → 校验 status=active → 建立会话
4. 找不到 → 调 `registerUserByPhone` 自动建号（**与正常注册等价，发放注册积分**）→ 建立会话
5. 返回 `{ success, user, sessionToken, isNewUser: bool }`
6. 前端：若 `isNewUser` → `/complete-profile`，否则 → `getRedirect()`

### 3.4 扫码登录（微信/QQ）

**触发链路**（`thirdPartyLogin` → `oauth-url` → 微信/QQ 授权页 → `callback` → `bind` 或 `link`）：

```text
1. 前端 UserContext.thirdPartyLogin('wechat')
   → fetch('/api/auth/oauth-url?provider=wechat&mode=login')
   → 写入 oauth_state 到 localStorage
   → window.location.href = data.url
2. /api/auth/oauth-url 生成带 state 的授权 URL
   state 格式: <mode>:<random>   (mode = login | bind | link)
3. 微信开放平台 qrconnect 页面 → 用户扫码 → 微信回调 redirect_uri
4. /api/auth/callback/wechat?code=&state=
   - 校验 state（一次性，命中即删）
   - 用 code 换 access_token
   - 用 access_token + openid 拉取用户信息
   - 按 provider + provider_id 查 user_oauth_bindings
     - 命中 → 建立会话 → 302 redirect 到 redirect_uri（默认 /）
     - 未命中 → 写 oauth_pending_logins（token, 10分钟有效）
              → 302 /wechat/link?t=<token>（#20260828-账号统一）
```

**关键修复**（#20260828-账号统一）：

- 之前：未绑定时静默建号 → 一个微信对应多个账号，无法找回
- 现在：必须用户输入手机号+验证码+密码，确认绑定到已有账号或注册新账号

### 3.5 登录失败处理

- 401 用户名/密码错误 → 计数 +1（`checkLoginRateLimit`），超限返回 `code: RATE_LIMITED` + `retryAfterSeconds`
- 402/403 账号停用 → 提示「账号已停用」
- NAME_NOT_UNIQUE 姓名重名 → 提示「请改用手机号/邮箱/用户名登录」
- 网络异常 → 前端 toast「登录失败，请稍后重试」

---

## 4. 会话管理

### 4.1 session_token 签发

**核心库**：`src/lib/auth-utils.ts::establishUserSession`

**格式**：`base64url(payload).base64url(hmac)`

- payload：`{ userId, email, role, expireAt }`（明文 base64，仅签名防篡改）
- hmac：`HMAC-SHA256(payload, SESSION_TOKEN_SECRET)`，截断或全长度

**示例**（简化）：

```text
header: eyJ1c2VySWQiOiJ1MTIzIiwiZW1haWwiOiJ4QHhrLmNvbSIsInJvbGUiOiJ1c2VyIiwiZXhwaXJlQXQiOjE3MzAwMH0
sig:    4f8a3b2c1d9e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a
```

**有效期**：

- 默认 7 天（可通过 `SESSION_TOKEN_EXPIRY` 环境变量覆盖）
- 前端 `localStorage.session_token` 与 `httpOnly cookie` 同寿命

### 4.2 双重存储

| 通道 | 名称 | 作用 |
| --- | --- | --- |
| `httpOnly cookie` | `session_token`、`quote_session_token` | 防 XSS 读取，自动随请求发送 |
| `localStorage` | `session_token` | 兜底，cookie 失效/被禁时可手动从 header 读 |

**请求头约定**：

- 浏览器自动带 `Cookie`
- 前端 `fetch` 可选带 `x-user-token: <localStorage.session_token>`（如 `complete-profile` 改密前调用 `PUT /api/auth/profile`）
- 后端 `getCurrentUser(request)` 优先级：cookie > `x-user-token` > Authorization Bearer

### 4.3 会话验证

**API**：`POST /api/auth/verify-session`

1. 读 cookie / `x-user-token` / Bearer
2. 验证 HMAC 签名（用 `SESSION_TOKEN_SECRET`）
3. 检查 `expireAt > now`
4. 用 `userId` 查 `users` 表（仅查必要字段，#20260828-账号统一修复：用户不存在时返回 401 而非 null，杜绝幽灵会话）
5. 返回 `{ success, user, sessionToken, expiresAt }`

**前端使用**：`UserContext` 在 mount 时调 `verify-session` 恢复登录态（兜底；cookie 有效时自动恢复）。

### 4.4 登出

**API**：`POST /api/auth/logout`

**前端**：`UserContext.logout()` → `doLoggedOutCleanup('')`

1. 调 `POST /api/auth/logout`（带 cookie + token header）→ 服务端清除 `session_token` / `quote_session_token` cookie + 标记 session 失效（如果有持久化）
2. 清除 localStorage：`user`、`token`、`session_token`、`oauth_state`
3. **设置 `LOGGED_OUT_FLAG`**（关键：防止后续 verify-session 误恢复；#20260821-2200 修复）
4. `window.dispatchEvent(LOGOUT_EVENT)` 通知其他标签页

### 4.5 强制下线（全设备登出）

**前端**：`UserContext.logoutAllDevices()`

- 当前实现：**仅前端**写 `LOGOUT_ALL_EVENT` + 改 `localStorage.token`（仅本地有效）
- 真实「全设备下线」需后端提供 invalidate-session API（参见 §12 待办）

### 4.6 改密后强制下线

**前端**：`UserContext.changePassword(oldPwd, newPwd)`（`src/contexts/UserContext.tsx:1471`）

1. 校验旧密码（localStorage 明文或后端 bcrypt 校验）
2. `syncToSupabase({ currentPassword, newPassword })` → 成功后端才视为成功
3. 清除 localStorage + cookie + `chat_area_restore_v1`
4. 派发 `PASSWORD_CHANGE_EVENT` 通知其他标签页
5. `router.push('/login?reason=password_changed')` 强制回登录

---

## 5. 密码管理

### 5.1 密码策略

**核心库**：`src/lib/password-policy.ts`

- 从 `/api/auth/password-policy` 读取后端 `site_config.password_min_length`（默认 6）
- 模块级缓存，进程内只请求一次
- 加载失败回退 6（后端仍会兜底校验）
- 修复 #20260821-0930：避免前端硬编码 6 与后端 8 不一致

### 5.2 首次设置密码

- **场景 1**：注册流程中未要求密码 → `/complete-profile` 可设置
- **场景 2**：仅微信登录用户想用密码登录 → `/api/auth/set-password`（需登录）
- 校验：长度 ≥ `minLength`（前后端一致）

### 5.3 修改密码（已登录）

- **API**：`POST /api/auth/change-password { currentPassword, newPassword }`
- **前端**：`UserContext.changePassword`（§4.6）
- 旧密码必须正确 → 同步 Supabase 成功 → 强制下线所有标签

### 5.4 忘记密码 / 重置密码

**页面**：`/forgot-password` → `/reset-password?phone=xxx`

1. 输入注册手机号 → `POST /api/auth/forgot-password { phone }`
   - 后端：限流（与短信登录同）+ 写 `sms_verification_codes` (purpose='reset')
   - 返回成功 → 「继续重置密码」按钮跳到 `/reset-password?phone=xxx`
2. `/reset-password` 输入验证码 + 新密码（最少 8 位） + 确认
3. `POST /api/auth/reset-password { phone, code, newPassword }`
   - 验证短信验证码（purpose='reset'）
   - 调 `changePasswordByAdmin(userId, newPasswordHash)`（service_role 绕过）
   - 失效所有现有 session（清 cookie + 旧 token 失效）
4. 1.5 秒后跳 `/login`

### 5.5 密码复杂度规则

- 当前：**仅长度校验**（默认 6 或 8）
- 未要求：大小写混合、数字、特殊字符
- bcrypt cost：默认 10（`bcryptjs`）

---

## 6. 第三方登录（微信 / QQ / GitHub / Google）

### 6.1 微信扫码登录（PC 端）

```text
┌────────┐    1. 点微信图标     ┌──────────┐
│ 前端   │ ──────────────────→ │ /api/auth│
│ /login │                     │ /oauth-  │
│        │ ←───────url────────│  url     │
│        │                     └──────────┘
│        │  2. window.location.href = url
│        │ ─────────────────────────────────→ 微信 qrconnect
│        │                                     用户扫码 + 确认
│        │  ←───────302 redirect───────────────
│        │
│        │  3. /api/auth/callback/wechat?code=&state=
│        │     - 校验 state
│        │     - code → access_token → userinfo
│        │     - 查 user_oauth_bindings
│        │       - 命中 → 建立会话 → 302 /
│        │       - 未命中 → oauth_pending_logins + 302 /wechat/link?t=
└────────┘
```

**绑定的必要信息**：`openid`、`unionid`（如有）、`nickname`、`avatar`、access_token

### 6.2 微信未绑定 → 引导绑定/注册

**页面**：`/wechat/link?t=<token>`（`src/app/wechat/link/page.tsx`）

1. 解析 URL token，验证有效性（`/api/auth/oauth-link?t=` 返回 pending info）
2. 用户输入：手机号 + **登录密码（必填，#20260828-2156）** + 短信验证码
3. `POST /api/auth/oauth-link { token, phone, sms_code, password }`
4. 后端：
   - 用 token 查 `oauth_pending_logins`（必须未消费、未过期）
   - 用 `verify-sms-code` 验证手机号
   - 用 phone 查 user：
     - **已存在** → 写入 `user_oauth_bindings`（provider=wechat, provider_id=openid）
     - **不存在** → `registerUserByPhone`（带 password）→ 写入 `user_oauth_bindings`
   - 标记 `oauth_pending_logins.consumed_at = now()`
   - 建立会话 → 返回 `{ success, user, sessionToken, isNewUser }`
5. 前端：`isNewUser` 跳 `/complete-profile`，否则 `getRedirect()`

### 6.3 微信绑定结果中间页

**页面**：`/wechat/bind-result`（`src/app/wechat/bind-result/page.tsx`）

- 触发：登录后绑定 → 弹窗 → callback 重定向到本页
- 职责：
  1. 解析 URL 参数 `success` / `failed` / `provider` / `nickname` / `avatar` / `openid` / `error`
  2. `window.opener.postMessage({ type: 'wechat_bound', ... }, origin)`
  3. 1.5 秒后 `window.close()`（弹窗场景）；若 `opener` 失效则降级 `window.location.replace('/')`
- 关键修复 #20260822-1645：避免绑写完成后「闪跳」首页打断用户操作

### 6.4 QQ 登录

- 流程与微信几乎一致（state 用相同格式）
- QQ 特殊性：`openid` 需先调 `https://graph.qq.com/oauth2.0/me?access_token=...&fmt=json`（返回 `callback({...})`，需剥壳）
- `oauth-service.ts`（`src/lib/oauth-service.ts`）保留了 `handleQQCallback` 内存版实现（已被实际生产落库版替代，但**仍存在**，需要清理或标注 DEPRECATED）

### 6.5 GitHub / Google

- 前端 `/login` 页面有按钮（`thirdPartyLogin('github')` / `('google')`）
- 后端实现：**未完整**（`/api/auth/oauth-url` 接受 provider 参数但 `oauth-service.ts` 仅支持 wechat/qq）
- 点击后通常回 `error: 暂未开放`

---

## 7. 绑定与解绑

### 7.1 微信绑定（已登录）

**前端**：`UserContext.bindWechat()`（`src/contexts/UserContext.tsx:1217`）

1. `GET /api/auth/oauth-url?provider=wechat&mode=bind`
2. 后端生成 state=`bind:<userId>:<random>` 标识「绑定模式」
3. 前端 `window.open(url, '_blank', 'width=520,height=640')` 弹窗
4. 用户扫码 → 微信回调 → `/api/auth/callback/wechat?code=&state=`
5. 解析 state 模式 = bind → 查 user_oauth_bindings：
   - 已有绑定且 user_id 与当前用户匹配 → 提示已绑定
   - 已有绑定但 user_id 与当前用户不一致 → 提示「该微信已绑定其他账号」
   - 无绑定 → 写入 user_oauth_bindings + 更新 users.wechat_* 字段
6. 302 → `/wechat/bind-result?success=1&provider=wechat&nickname=...&avatar=...&openid=...`
7. 主窗口 postMessage 监听 + 轮询兜底（#20260827-1600-1）

### 7.2 微信解绑

**前端**：`UserContext.unbindWechat()`（`src/contexts/UserContext.tsx:1251`）

1. 必须存在 `user.wechat` 绑定
2. `POST /api/auth/unlink { provider: 'wechat' }`（带 cookie + `x-user-token`）
3. 后端：
   - 校验会话
   - 校验「不能解绑最后一个登录方式」：必须存在其他登录方式（手机/邮箱/密码）
   - `DELETE FROM user_oauth_bindings WHERE user_id = $1 AND provider = 'wechat'`
   - `UPDATE users SET wechat_openid = NULL, wechat_unionid = NULL, ...`
4. 前端：清 localStorage wechat 字段 → `setUser`

### 7.3 手机号绑定/更换

**绑定（已登录）**：`UserContext.bindPhone(phone, code)`（`src/contexts/UserContext.tsx:1175`）

1. 校验手机号格式
2. `verifyPhone(phone, code)` → 成功
3. 检查 phone 未被其他账号使用（`users.metadata.phone`）
4. localStorage 写入 + `syncToSupabase()` 同步服务端
5. 失败回滚 localStorage

**解绑**：`UserContext.unbindPhone()`：必须存在其他登录方式（email/wechat）。

### 7.4 邮箱绑定/更换

**绑定**：`UserContext.bindEmail(email, password?, code?)`

- 邮箱必须先验证（`/api/auth/send-email-code` → `verify-email-code`）
- 迁移 087：`email_verification_codes` 表持久化验证状态
- 可选同步设置密码

**解绑**：`UserContext.unbindEmail()`：必须存在其他登录方式。

### 7.5 状态同步

- 所有绑定/解绑后：`setUser` + `safeSetItem(STORAGE_KEYS.USER)` + `syncToSupabase`
- `syncToSupabase` 失败 → 回滚 localStorage（#20260827-0826-2）

---

## 8. 验证码体系

### 8.1 短信验证码

**表**：`sms_verification_codes`（迁移 057）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| phone | VARCHAR(20) | 目标手机号 |
| code | VARCHAR(10) | 6 位数字 |
| purpose | VARCHAR(20) | `register` / `login` / `bind` / `general` / `reset` |
| attempts | INT | 已尝试次数 |
| max_attempts | INT | 默认 5 |
| expires_at | TIMESTAMPTZ | 通常 now + 5min |
| consumed_at | TIMESTAMPTZ | 已使用时间（单次有效） |
| ip | VARCHAR(64) | 发送时 IP |
| created_at | TIMESTAMPTZ | |

**API**：
- `POST /api/auth/send-sms-code { phone, purpose }`
- `POST /api/auth/verify-sms-code { phone, code, purpose?, consume? }`

**限流**（`src/lib/rate-limit.ts::checkSmsRateLimit`）：
- 同一手机号 60 秒内 1 条
- 同一手机号每天 10 条
- 同一 IP 每分钟 5 条

### 8.2 邮箱验证码

**表**：`email_verification_codes`（迁移 087）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| email | TEXT PK | 规范化小写 |
| verified | BOOL | 验证状态 |
| verified_at | TIMESTAMPTZ | 验证时间 |
| last_verified_method | TEXT | `magiclink` / `email_otp` |
| last_sent_at | TIMESTAMPTZ | |
| send_count | INT | 累计发送次数（防滥用） |
| current_hashed_token | TEXT | Supabase generateLink 的 hashed_token（service_role only） |
| current_verification_type | TEXT | |
| current_email_otp | TEXT | 6 位 OTP 备用 |
| current_action_link | TEXT | magic link URL（排查用） |
| current_expires_at | TIMESTAMPTZ | 发送后 10 分钟 |

**流程**：

1. `POST /api/auth/send-email-code { email }` → service_role 调 `supabase.auth.admin.generateLink({ type: 'magiclink', email })`
2. Supabase 内置 SMTP 发送真实邮件（含 magic link 链接）
3. 后端把 `hashed_token` / `email_otp` / `action_link` / `expires_at` 写入 `email_verification_codes`
4. 用户从邮件中复制 OTP 或点击 link
5. `POST /api/auth/verify-email-code { email, token/otp }` → 校验 `current_hashed_token` 或 `current_email_otp`，标 `verified=true`

**API**：
- `POST /api/auth/send-email-code`
- `POST /api/auth/verify-email-code`
- `GET /api/auth/check-email-verified?email=`（轮询用）

**设计**（#20260828-1345）：
- 与手机号短信验证对称：邮箱场景必须验证邮箱真实性
- service_role only 读写（RLS 默认拒绝 anon/authenticated）

### 8.3 限流总览

`src/lib/rate-limit.ts`：

| 限流项 | 窗口 | 阈值 | 封锁 |
| --- | --- | --- | --- |
| 短信 - 短冷却 | 60s | 1 | 60s |
| 短信 - 每日 | 24h | 10 | 24h |
| 短信 - IP | 60s | 5 | 5min |
| 登录失败 | 15min | 5 | 30min |

**注意**：内存存储（单进程有效），生产环境建议替换为 Redis/Supabase（参见 §13）。

---

## 9. 数据库 Schema 关键表

### 9.1 `users`（基础表，迁移 01 + 008 + 044 + 060）

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,    -- 迁移后期可能放宽
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),             -- 迁移 008 添加
  full_name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'user',
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,     -- 存 phone/phone_verified/name/company/address
  wechat_openid TEXT,                     -- 迁移 044
  wechat_unionid TEXT,
  wechat_nickname TEXT,
  wechat_avatar TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ
);
```

**重要约束**：

- `email UNIQUE NOT NULL`：注册时占位 `unbound_<uid>@local.invalid`；用户首次设置真邮箱后该约束仍生效
- `metadata.phone` 与 `users.username='1<phone>'` 双写（迁移后期约定）
- `metadata` JSONB 灵活存 phone_verified、name、company、address

### 9.2 `user_oauth_bindings`（迁移 060）

```sql
CREATE TABLE public.user_oauth_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                -- 'wechat' / 'qq' / 'github' / 'google'
  provider_id TEXT NOT NULL,             -- openid
  nickname TEXT,
  avatar TEXT,
  unionid TEXT,
  access_token TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  CONSTRAINT user_oauth_bindings_provider_provider_id_key UNIQUE (provider, provider_id)
);
```

**关键约束**：`UNIQUE(provider, provider_id)` 保证同一第三方 openid 只能绑一个用户。

### 9.3 `oauth_pending_logins`（迁移 091）

```sql
CREATE TABLE public.oauth_pending_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,            -- 随机 token，单次有效
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  name TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                -- 10 分钟过期
  consumed_at TIMESTAMPTZ
);
```

**用途**：扫码未绑定时暂存身份，引导用户确认手机号。

### 9.4 `sms_verification_codes`（迁移 057）— 详见 §8.1

### 9.5 `email_verification_codes`（迁移 087）— 详见 §8.2

### 9.6 `user_logs`（迁移 049）

```sql
-- 白名单 action_type: login / logout / upload / download / delete / update / view / share / export / search
```

**写入**：`src/lib/user-log-service.ts::logUserAction`（service_role 绕过 RLS）

### 9.7 `user_roles` / `roles`（迁移 075）

- `roles` 表：17 个角色种子（super_admin / admin / operator / ...）
- `user_roles(user_id, role)`：用户与角色多对多
- `get_admin_role_codes()` / `is_user_admin()` / `is_user_super_admin()` 函数
- `user_admin_roles` 视图

### 9.8 RLS 策略概览

- `users`：启用 RLS，仅 `auth.uid() = id` 可查看
- `sms_verification_codes`：启用 RLS，**无策略** → 仅 service_role 可访问
- `email_verification_codes`：启用 RLS，**无策略** → 仅 service_role 可访问
- `user_oauth_bindings`：启用 RLS，service_role 管理

---

## 10. 前端页面与状态管理

### 10.1 页面清单

| 路径 | 文件 | 用途 |
| --- | --- | --- |
| `/login` | `src/app/login/page.tsx` | 登录（手机验证码/密码/扫码） |
| `/register` | `src/app/register/page.tsx` | 手机号+短信注册 |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | 发送重置密码验证码 |
| `/reset-password` | `src/app/reset-password/page.tsx` | 输入验证码+新密码 |
| `/complete-profile` | `src/app/complete-profile/page.tsx` | 首次登录完善资料 |
| `/wechat/link` | `src/app/wechat/link/page.tsx` | 扫码未绑定引导 |
| `/wechat/bind-result` | `src/app/wechat/bind-result/page.tsx` | 绑定结果中间页（postMessage） |
| `/account` | `src/app/account/**` | 账号管理（个人信息/绑定/改密/注销） |
| `/403` | `src/app/403/page.tsx` | 未登录/无权限提示 |

### 10.2 UserContext 核心方法

`src/contexts/UserContext.tsx`：

```typescript
interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;

  // 验证码
  sendPhoneCode(phone): Promise<...>;         // → /api/auth/send-sms-code
  sendEmailCode(email): Promise<...>;         // 本地验证码（已废弃）
  sendEmailVerification(email): Promise<...>; // → /api/auth/send-email-code
  verifyPhone(phone, code): Promise<boolean>; // → /api/auth/verify-sms-code
  verifyEmail(email, code): Promise<boolean>; // 本地兜底

  // 登录
  phoneLogin(phone, code): Promise<AuthResponse>;     // → /api/auth/login-with-sms
  emailLogin(email, password): Promise<AuthResponse>;  // → 走 passwordLogin
  passwordLogin(account, password): Promise<AuthResponse>; // → /api/auth/login
  emailCodeLogin(email, code): Promise<AuthResponse>;  // 本地兜底（已废弃）
  thirdPartyLogin(provider): Promise<void>;           // → /api/auth/oauth-url
  handleThirdPartyCallback(provider, code, state): Promise<AuthResponse>; // 本地兜底

  // 注册
  emailRegister(email, password, name): Promise<AuthResponse>; // 本地（已废弃）
  // 真实注册：fetch('/api/auth/register')，不走 UserContext

  // 绑定
  bindEmail(email, password?, code?): Promise<{ success, error? }>;
  bindPhone(phone, code): Promise<{ success, error? }>;
  bindWechat(): Promise<void>;
  unbindEmail(): Promise<boolean>;
  unbindPhone(): Promise<boolean>;
  unbindWechat(): Promise<boolean>;

  // 资料
  updateUser(userData): Promise<boolean>;
  refreshUser(): Promise<void>;
  uploadAvatar(file): Promise<{ success, url?, error? }>;

  // 会话
  logout(): void;
  logoutAllDevices(): Promise<boolean>;   // ⚠️ 仅前端，未真实通知服务端
  clearStaleSession(): Promise<void>;

  // 密码
  changePassword(oldPwd, newPwd): Promise<boolean>;
  resetPassword(...): Promise<...>;       // 已废弃

  // 企业
  enterpriseLogin(...): Promise<...>;
  submitEnterpriseApplication(...): Promise<...>;
  getEnterpriseStatus(): Promise<...>;

  // 内部
  companyInfo: CompanyInfo | null;
  refreshCompanyInfo(): Promise<void>;
}
```

### 10.3 关键状态机

```text
[未登录]
   ↓ phoneLogin / passwordLogin / 第三方回调
[已登录]  ──── logout ──→ [未登录]
   │
   ├── bindPhone/bindEmail ──→ user 对象增加 phone/email
   ├── bindWechat ──→ 弹窗扫码 → 成功 → user.wechat 填充
   ├── changePassword ──→ 强制下线 ──→ [未登录]
   ├── deleteAccount ──→ user = null → [未登录]
   └── auto logoutAllDevices ──→ [未登录]（仅本地）
```

### 10.4 跨标签页同步事件

`STORAGE_KEYS`（`localStorage` key）：

| Key | 用途 |
| --- | --- |
| `user` | 缓存用户信息 |
| `token` | 旧版 token（已弱化为占位） |
| `session_token` | HMAC 签名的 session_token |
| `logged_out_flag` | 主动登出标记（防 verify-session 误恢复） |
| `oauth_state` | 第三方登录 state |
| `password_change_event` | 改密事件（其他标签页收到强制退出） |
| `logout_event` | 登出事件 |
| `logout_all_event` | 全设备登出事件 |
| `account_deleted_event` | 注销事件 |
| `verified_phones` / `verified_emails` | 已验证手机号/邮箱列表 |
| `phone_codes` / `email_codes` / `email_login_codes` | 本地验证码兜底 |
| `users_db` | localStorage 用户表（已逐步弃用） |

### 10.5 重要修复时间线

| Tag | 描述 |
| --- | --- |
| #20260820-1600 | 注册策略改为手机号+验证码；微信配置缺失返回明确错误 |
| #20260821-0930 | 密码策略前后端一致（password-policy.ts） |
| #20260821-1500 | 登录支持中文用户名 |
| #20260821-1910 | bindWechat 走 mode=bind 而非 login（修复闪跳） |
| #20260821-2200 | 清除 LOGGED_OUT_FLAG 修复注册后引导页 401 |
| #20260822-1630 | 扫码登录整页跳转；OAuth 回调以服务端为权威 |
| #20260822-1645 | 微信绑定结果中间页（避免闪跳） |
| #20260822-2028 | 登录支持姓名（重名提示） |
| #20260827-0826-2 | bindEmail/Phone/UpdateUser 同步失败回滚 |
| #20260827-1600 | bind-result postMessage 即时通知 |
| #20260827-1600-1 | complete-profile 轮询 /api/auth/bind 兜底 |
| #20260828-账号统一 | 微信未绑定走 oauth_pending_logins + /wechat/link |
| #20260828-2156 | 微信绑定密码必填；login-after-register 自动恢复 |
| #20260828-1345 | 邮箱验证码（迁移 087） |

---

## 11. 安全机制与限流

### 11.1 会话安全

- **HMAC 签名**：session_token 防篡改，密钥 `SESSION_TOKEN_SECRET`（环境变量）
- **双通道**：httpOnly cookie（防 XSS）+ localStorage（防 cookie 失效）
- **过期机制**：默认 7 天，可配置
- **重置触发**：改密 / 注销 / 重置密码后服务端失效所有 session

### 11.2 密码安全

- bcryptjs 哈希（cost 10）
- 不存明文（迁移 008 强制）
- 旧密码正确性校验

### 11.3 CSRF / State 校验

- OAuth state 单次使用（`pendingStates` Map，5 分钟过期）
- form action 无 GET 副作用（全部 POST/PUT/DELETE）

### 11.4 限流

详见 §8.3。

### 11.5 RLS

- `users` / `sms_verification_codes` / `email_verification_codes` / `user_oauth_bindings` 启用 RLS
- 写操作必须经 `service_role` 入口（`getSupabaseServiceClient`）
- anon/authenticated 默认拒绝跨用户数据访问

### 11.6 开放重定向防护

- `/login` / `/complete-profile` 接收 `?redirect=` 参数
- 仅允许 `/` 开头且非 `//` 开头（防协议重定向）

### 11.7 防幽灵会话

- #20260828-账号统一：`/api/auth/verify-session` 用户不存在时返回 **401** 而非 null
- 防止 user_id 被删后旧 cookie 仍能「恢复」

---

## 12. 已知问题 / 遗漏 / 风险

### 12.1 已有但需清理

1. **`src/lib/oauth-service.ts`（内存版 OAuth）** 仍保留 `bindings: Map`、`pendingStates: Map`、`destroy()` 等实现，与 `user_oauth_bindings` 落库版重复。
   - 建议：标注 `@deprecated`，仅供 `docs/` 展示用；生产代码统一走落库版。
2. **`UserContext.emailRegister` / `emailCodeLogin` / `emailLogin`** 走 localStorage，**与生产 /api/auth/register / login-with-sms 逻辑不一致**。
   - 风险：未登录用户从生产 server-rendered 页面调用这些方法会失败。
   - 建议：移除或强制转调真实 API。
3. **`UserContext.handleThirdPartyCallback`** 是纯 localStorage 兜底实现，**不会真正消费 oauth_pending_logins 或写入 user_oauth_bindings**。
   - 实际生产由 `/api/auth/callback/[provider]` 直接处理。
   - 建议：清理或改为「若服务端失败则回退本地」。
4. **`UserContext.deleteAccount` 是纯 localStorage 操作**，不会从 `users` 表真正删除。
   - 实际生产需要后端 `DELETE /api/auth/account` 端点（**当前缺失**）。
5. **`UserContext.logoutAllDevices` 仅本地操作**，未通知服务端。
   - 后端缺少「失效该用户所有 session」端点。
6. **`MIN_PASSWORD_LENGTH = 8` 硬编码**于 `src/app/reset-password/page.tsx:10`。
   - 与后端 `site_config.password_min_length`（默认 6 或 8）可能不一致。
   - 建议：改为调用 `loadMinPasswordLength()`。

### 12.2 缺失功能

1. **GitHub / Google 第三方登录**：前端有按钮，后端 `oauth-service.ts` 未实现 `handleGithubCallback` / `handleGoogleCallback`，`/api/auth/oauth-url` 仅支持 wechat / qq。
2. **真实注销 API**：`DELETE /api/auth/account` 缺失；当前 `deleteAccount` 仅清 localStorage。
3. **真实全设备下线**：`POST /api/auth/logout-all` 缺失。
4. **邮箱验证码登录**：`/api/auth/login-with-email` 缺失（虽然 `email_verification_codes` 表已就位）。
5. **OAuth token 刷新**：`user_oauth_bindings.access_token` 存了但无刷新机制；微信 access_token 2 小时过期后无静默续签。
6. **审计日志**：`user_logs` 表已就位但 `register` / `bind` / `unbind` 路径下未系统化记录（仅 login 记录较完整）。

### 12.3 限流风险

- `rate-limit.ts` 用 `Map` 内存存储，**单进程有效**。多实例部署或 PM2 cluster 模式下不同步。
- 建议：迁移到 Supabase `rate_limit_counters` 表（可参考迁移 044 风格）。

### 12.4 跨域 / 跨站风险

- `bindWechat` 用 `window.open` 弹窗，跨域导航后 `opener` 可能丢失（已有 postMessage + 轮询双兜底，OK）。
- `oauth-service.ts` 的 `stateCleanupTimer` 用 `setInterval`，未 `unref()`（对比 `rate-limit.ts` 已 `unref()`），在生产可能阻塞进程退出。

### 12.5 数据一致性

- `users.metadata.phone` 与 `users.username='1<phone>'` 双写：迁移期兼容，新代码应统一。
- `users.email` 占位符 `unbound_<uid>@local.invalid`：未来若有用户用真邮箱注册，需先 `UPDATE` 释放。

---

## 13. 改进建议与下一步行动

### 13.1 P0（立即修复）

1. **实现 `DELETE /api/auth/account`**：从 `users` 表软删除（`status='deleted'`），失效所有 session，删除 `user_oauth_bindings` / `sms_verification_codes`（保留 90 天用于审计）。
2. **实现 `POST /api/auth/logout-all`**：写 `user_invalidated_sessions` 表或 service_role 端维护。
3. **将 `UserContext.deleteAccount` / `logoutAllDevices` 改为调用上述 API**，并加 loading 状态 + 错误处理。
4. **`reset-password/page.tsx`**：`MIN_PASSWORD_LENGTH` 改为动态读取 `/api/auth/password-policy`。

### 13.2 P1（短期补齐）

1. **GitHub / Google 登录**：补齐 `oauth-service.ts::handleGithubCallback` / `handleGoogleCallback`；`/api/auth/oauth-url` 增加 provider 白名单。
2. **限流持久化**：迁移到 Supabase 表 + 触发器；或引入 Redis（已部署则直接用）。
3. **`oauth-service.ts` 清理**：标注 `@deprecated`，删除无用 `destroy` / `bindings` / `pendingStates`。
4. **`UserContext` 清理**：移除 `emailRegister` / `emailCodeLogin` / `emailLogin` / `handleThirdPartyCallback` 本地实现，统一走 API。
5. **审计日志覆盖**：`register` / `bindWechat` / `unbindWechat` / `changePassword` / `deleteAccount` 路径增加 `logUserAction` 调用。

### 13.3 P2（架构优化）

1. **session_token 格式升级**：从「base64url + HMAC」迁移到标准 JWT（包含 `iss` / `aud` / `nbf` / `jti`），便于多端验证。
2. **统一 SSO 层**：抽象 `establishUserSession` 到 `src/lib/auth/session.ts`，所有需要登录的路由统一 import。
3. **前端 SSR 鉴权**：`getServerSession` 在 layout 层统一注入 `user`，避免 client-side flash。
4. **OAuth 状态清理**：`oauth-service.ts` 的 `setInterval` 改为 `unref()` 或基于请求触发清理。

### 13.4 P3（长期演进）

1. **MFA（多因素认证）**：`AuthResponse.requiresTwoFactor` 字段已就位但未实现 TOTP / 短信二次确认流程。
2. **风控系统**：登录 / 注册行为画像（IP 地理位置、UA 指纹、设备指纹）→ 异常拦截。
3. **隐私合规**：用户主动导出 / 彻底删除个人数据（GDPR / 个保法）。

---

## 附录 A：API 路由总览（`src/app/api/auth/**`）

| 路由 | 方法 | 用途 | 鉴权 |
| --- | --- | --- | --- |
| `/api/auth/register` | POST | 手机号+验证码注册 | 公开 |
| `/api/auth/login` | POST | 统一密码登录 | 公开 |
| `/api/auth/login-with-sms` | POST | 手机号+验证码登录（自动建号） | 公开 |
| `/api/auth/logout` | POST | 登出 | 公开（带 cookie） |
| `/api/auth/verify-session` | POST | 验证 session_token | 公开 |
| `/api/auth/me` | GET | 获取当前用户 | 需登录 |
| `/api/auth/profile` | GET/PUT | 个人资料 | 需登录 |
| `/api/auth/sync-user` | POST | 同步用户到 Supabase | 需登录 |
| `/api/auth/send-sms-code` | POST | 发送短信验证码 | 公开 |
| `/api/auth/verify-sms-code` | POST | 验证短信验证码 | 公开 |
| `/api/auth/send-email-code` | POST | 发送邮箱验证码（Supabase generateLink） | 公开 |
| `/api/auth/verify-email-code` | POST | 验证邮箱验证码 | 公开 |
| `/api/auth/check-email-verified` | GET | 轮询邮箱验证状态 | 公开 |
| `/api/auth/forgot-password` | POST | 发送重置密码验证码 | 公开 |
| `/api/auth/reset-password` | POST | 重置密码 | 公开 |
| `/api/auth/change-password` | POST | 已登录修改密码 | 需登录 |
| `/api/auth/set-password` | POST | 首次设置密码 | 需登录 |
| `/api/auth/password-policy` | GET | 读取密码策略 | 公开 |
| `/api/auth/oauth-url` | GET | 获取 OAuth 授权 URL | 公开 |
| `/api/auth/oauth-link` | GET/POST | OAuth 引导绑定/注册 | 公开 |
| `/api/auth/callback/[provider]` | GET | OAuth 回调 | 公开 |
| `/api/auth/bind` | GET | 查询绑定列表 | 需登录 |
| `/api/auth/unlink` | POST | 解绑 | 需登录 |
| `/api/auth/wechat/nickname` | GET | 获取已绑定微信昵称 | 需登录 |
| `/api/auth/qq/**` | GET | QQ OAuth 特殊端点 | 公开 |
| `/api/contributor/check-registered` | POST | 公开查询手机/邮箱是否已注册（#[20260829-1500]） | 公开 |

## 附录 B：迁移文件时间线（认证相关）

| 迁移 | 内容 |
| --- | --- |
| `01_initial_schema.sql` | users / products / quotes / ... 基础表 |
| `008_add_password_hash.sql` | users.password_hash 字段 |
| `015_system_config_tables.sql` | site_config（密码策略） |
| `044_add_wechat_fields.sql` | users.wechat_* 字段 |
| `049_user_logs.sql` | user_logs 表 |
| `057_sms_verification_codes.sql` | 短信验证码表 |
| `060_user_oauth_bindings.sql` | 第三方绑定表 |
| `075_unified_admin_roles.sql` | roles 表 + get_admin_role_codes |
| `087_email_verification_codes.sql` | 邮箱验证码表（#20260828-1345） |
| `091_oauth_pending_logins.sql` | 扫码未绑定暂存表（#20260828-账号统一） |

## 附录 C：核心库清单

| 库 | 文件 | 用途 |
| --- | --- | --- |
| auth-utils | `src/lib/auth-utils.ts` | getCurrentUser、establishUserSession、requireAdmin |
| phone-auth | `src/lib/phone-auth.ts` | registerUserByPhone（手机号注册/建号） |
| email-verification | `src/lib/email-verification.ts` | 邮箱验证（Supabase generateLink） |
| password-policy | `src/lib/password-policy.ts` | 密码最小长度（缓存） |
| rate-limit | `src/lib/rate-limit.ts` | 内存限流（短信/登录） |
| validations/auth | `src/lib/validations/auth.ts` | 手机/邮箱正则 |
| oauth-service | `src/lib/oauth-service.ts` | OAuth 服务（**部分 DEPRECATED**） |
| user-log-service | `src/lib/user-log-service.ts` | user_logs 写入 |
| permission-service | `src/lib/permission-service.ts` | 权限服务 |
| permission-middleware | `src/middleware/permission-middleware.ts` | 路由权限 |
| supabase-client | `src/storage/database/supabase-client.ts` | Supabase 双 client |
| UserContext | `src/contexts/UserContext.tsx` | 前端登录态 |
| password-policy（前端） | `src/lib/password-policy.ts` | 密码策略 |

---

**报告完成。** 如需补充特定模块的更深入分析（如 OAuth 内部细节、session_token 密码学强度评估、限流算法对比等），请在后续对话中指定。
