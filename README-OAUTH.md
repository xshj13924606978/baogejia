# 第三方登录功能实现文档

## 概述

本文档描述了"报个价"项目中实现的第三方登录功能，包括微信扫码登录、QQ登录、自动绑定已有账号、获取用户头像和昵称等功能。

## 功能列表

### 1. 支持的第三方登录

- **微信扫码登录**
  - 适用于网站应用
  - 使用微信开放平台 OAuth2.0 授权
  - 扫码即可快速登录

- **QQ登录**
  - 适用于网站应用
  - 使用 QQ 互联 OAuth2.0 授权
  - 点击授权即可登录

### 2. 核心功能

- **自动绑定已有账号**
  - 用户首次使用第三方登录时，可以选择绑定已有账号
  - 绑定成功后，下次可一键登录

- **获取用户头像和昵称**
  - 自动获取第三方平台的用户头像
  - 自动获取第三方平台的用户昵称
  - 可选择是否更新到本系统

- **安全验证**
  - 绑定账号时需要输入用户名和密码
  - 解绑账号时需要密码验证
  - OAuth2.0 标准授权流程

## 文件结构

```
src/
├── types/
│   └── oauth.ts                      # 第三方登录类型定义
├── lib/
│   └── oauth-service.ts              # 第三方登录服务层
├── components/
│   ├── auth/
│   │   ├── login-modal.tsx           # 登录弹窗（已更新，含第三方登录）
│   │   └── login-modal-with-oauth.tsx # 第三方登录弹窗组件
└── app/
    └── api/
        └── auth/
            ├── wechat/
            │   ├── route.ts           # 微信登录API
            │   └── callback/
            │       └── route.ts       # 微信登录回调API
            ├── qq/
            │   ├── route.ts           # QQ登录API
            │   └── callback/
            │       └── route.ts       # QQ登录回调API
            └── bind/
                └── route.ts           # 绑定账号API
```

## API 接口

### 1. 获取微信扫码登录二维码

**端点**: `GET /api/auth/wechat`

**响应**:
```json
{
  "success": true,
  "qr_code_url": "https://open.weixin.qq.com/connect/qrconnect?...",
  "qrcode_key": "mock_qr_123456",
  "expire_time": 300
}
```

### 2. 微信登录回调

**端点**: `GET /api/auth/wechat/callback?code=xxx&state=xxx`

**处理流程**:
1. 使用 code 换取 access_token
2. 使用 access_token 获取用户信息
3. 检查是否已有绑定
   - 已绑定：直接登录
   - 未绑定：跳转到绑定页面

**重定向**:
- 登录成功：`/login?success=true&provider=wechat`
- 需要绑定：`/login?action=bind&provider=wechat&openid=xxx&nickname=xxx&avatar=xxx`
- 失败：`/login?error=xxx`

### 3. 获取QQ登录授权URL

**端点**: `GET /api/auth/qq`

**响应**:
```json
{
  "success": true,
  "auth_url": "https://graph.qq.com/oauth2.0/authorize?..."
}
```

### 4. QQ登录回调

**端点**: `GET /api/auth/qq/callback?code=xxx&state=xxx`

**处理流程**:
1. 使用 code 换取 access_token
2. 获取用户 OpenID
3. 使用 access_token 和 OpenID 获取用户信息
4. 检查是否已有绑定
   - 已绑定：直接登录
   - 未绑定：跳转到绑定页面

**重定向**:
- 登录成功：`/login?success=true&provider=qq`
- 需要绑定：`/login?action=bind&provider=qq&openid=xxx&nickname=xxx&avatar=xxx`
- 失败：`/login?error=xxx`

### 5. 绑定账号

**端点**: `POST /api/auth/bind`

**请求体**:
```json
{
  "provider": "wechat",
  "openid": "o1234567890",
  "username": "testuser",
  "password": "123456",
  "nickname": "测试用户",
  "avatar": "https://example.com/avatar.jpg"
}
```

**响应**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "testuser",
    "nickname": "测试用户",
    "avatar": "https://example.com/avatar.jpg",
    "role": "user",
    "points": 100
  }
}
```

### 6. 查询用户绑定列表

**端点**: `GET /api/auth/bind`

**响应**:
```json
{
  "success": true,
  "bindings": [
    {
      "id": "1-wechat-o123456",
      "user_id": 1,
      "provider": "wechat",
      "openid": "o123456",
      "nickname": "微信用户",
      "avatar": "https://...",
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### 7. 解绑账号

**端点**: `DELETE /api/auth/bind`

**请求体**:
```json
{
  "provider": "wechat",
  "password": "123456"
}
```

**响应**:
```json
{
  "success": true
}
```

## 登录流程

### 1. 微信扫码登录流程

```
用户点击微信登录
    ↓
调用 /api/auth/wechat 获取二维码
    ↓
显示二维码，用户扫码
    ↓
用户确认授权
    ↓
微信回调 /api/auth/wechat/callback
    ↓
获取用户信息（openid, nickname, avatar）
    ↓
检查是否已绑定
    ↓
├─ 已绑定 → 直接登录
└─ 未绑定 → 跳转到绑定页面
    ↓
用户输入用户名和密码
    ↓
调用 /api/auth/bind 绑定账号
    ↓
登录成功
```

### 2. QQ登录流程

```
用户点击QQ登录
    ↓
调用 /api/auth/qq 获取授权URL
    ↓
跳转到QQ授权页面
    ↓
用户确认授权
    ↓
QQ回调 /api/auth/qq/callback
    ↓
获取用户信息（openid, nickname, avatar）
    ↓
检查是否已绑定
    ↓
├─ 已绑定 → 直接登录
└─ 未绑定 → 跳转到绑定页面
    ↓
用户输入用户名和密码
    ↓
调用 /api/auth/bind 绑定账号
    ↓
登录成功
```

### 3. 绑定已有账号流程

```
首次使用第三方登录
    ↓
跳转到绑定页面
    ↓
显示第三方用户信息（头像、昵称）
    ↓
用户输入本系统用户名和密码
    ↓
验证用户名和密码
    ↓
创建OAuth绑定记录
    ↓
更新用户头像和昵称（可选）
    ↓
登录成功
```

## 配置说明

### 环境变量

创建 `.env.local` 文件，添加以下配置：

```env
# 微信开放平台配置
WECHAT_OAUTH_APP_ID=wx1234567890abcdef
WECHAT_OAUTH_APP_SECRET=your_app_secret_here

# QQ互联配置
QQ_OAUTH_APP_ID=1234567890
QQ_OAUTH_APP_KEY=your_app_key_here
```

### 微信开放平台配置

1. 登录 [微信开放平台](https://open.weixin.qq.com)
2. 创建网站应用
3. 获取 AppID 和 AppSecret
4. 配置授权回调域名
5. 获取网站应用信息

### QQ互联配置

1. 登录 [QQ互联](https://connect.qq.com)
2. 创建网站应用
3. 获取 AppID 和 AppKey
4. 配置回调地址
5. 提交审核

## 数据库表结构

生产环境需要创建以下表：

### oauth_bindings 表

```sql
CREATE TABLE oauth_bindings (
  id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  openid VARCHAR(128) NOT NULL,
  unionid VARCHAR(128),
  nickname VARCHAR(255),
  avatar TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_provider_openid (provider, openid),
  INDEX idx_unionid (unionid)
);
```

## 使用示例

### 1. 前端调用微信登录

```typescript
const handleWechatLogin = async () => {
  try {
    const res = await fetch('/api/auth/wechat');
    const data = await res.json();

    if (data.success && data.qr_code_url) {
      // 显示二维码或打开新窗口
      window.open(data.qr_code_url, 'wechat_login', 'width=400,height=500');
    }
  } catch (err) {
    console.error('微信登录失败:', err);
  }
};
```

### 2. 前端调用QQ登录

```typescript
const handleQQLogin = async () => {
  try {
    const res = await fetch('/api/auth/qq');
    const data = await res.json();

    if (data.success && data.auth_url) {
      // 跳转到QQ授权页面
      window.location.href = data.auth_url;
      // 或打开新窗口
      window.open(data.auth_url, 'qq_login', 'width=600,height=500');
    }
  } catch (err) {
    console.error('QQ登录失败:', err);
  }
};
```

### 3. 前端绑定账号

```typescript
const handleBind = async (oauthInfo: any, username: string, password: string) => {
  try {
    const res = await fetch('/api/auth/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: oauthInfo.provider,
        openid: oauthInfo.openid,
        username,
        password,
        nickname: oauthInfo.nickname,
        avatar: oauthInfo.avatar,
      }),
    });

    const data = await res.json();

    if (data.success) {
      // 绑定成功，登录
      localStorage.setItem('user', JSON.stringify(data.user));
    }
  } catch (err) {
    console.error('绑定账号失败:', err);
  }
};
```

## 注意事项

### 1. 开发环境

- 当前实现使用内存存储绑定数据
- 返回模拟的用户信息
- 没有真实的签名验证

### 2. 生产环境

- 必须配置真实的 AppID 和 AppSecret
- 必须使用数据库持久化绑定数据
- 必须配置正确的回调地址
- 回调地址必须在开放平台配置并审核通过

### 3. 安全注意事项

- OAuth配置不要提交到代码仓库
- 回调地址必须是HTTPS
- 绑定账号时必须验证密码
- 解绑账号时必须验证密码
- 防止CSRF攻击（使用state参数）

### 4. 用户体验

- 提供清晰的登录引导
- 显示第三方用户信息（头像、昵称）
- 支持绑定多个第三方账号
- 支持解绑第三方账号
- 保持登录状态一致性

## 扩展功能

### 1. 支持更多第三方登录

- 支付宝登录
- GitHub登录
- 微博登录
- 钉钉登录

### 2. 账号合并

- 支持多个第三方账号绑定到同一个系统账号
- 支持合并重复账号
- 支持迁移历史数据

### 3. 安全增强

- 双因素认证
- 登录设备管理
- 异常登录检测
- 登录日志记录

### 4. 数据同步

- 自动同步用户头像和昵称
- 支持选择性同步
- 支持定期更新

## 故障排查

### 1. 回调失败

- 检查回调地址配置
- 检查回调地址是否可访问
- 检查state参数是否正确
- 查看服务器日志

### 2. 获取用户信息失败

- 检查 access_token 是否有效
- 检查 AppID 和 AppSecret 是否正确
- 检查用户是否取消授权
- 查看第三方平台返回的错误信息

### 3. 绑定失败

- 检查用户名和密码是否正确
- 检查是否已绑定过
- 检查网络连接
- 查看服务器日志

## 技术支持

如有问题，请联系开发团队或查看：
- [微信开放平台文档](https://open.weixin.qq.com/cgi-bin/showdocument?action=dir_list&t=resource/res_list&verify=1&id=open1419316505&token=&lang=zh_CN)
- [QQ互联文档](https://wiki.connect.qq.com/)

## 版本信息

- **实现日期**: 2026-02-19
- **Next.js**: 16.1.1
- **TypeScript**: 5.x
