-- 统一认证修复（#[20260829-1700]）：用户级会话版本号
-- 用于「全部设备登出」真实生效：每次 logoutAllDevices 递增 session_version，
-- 旧 token（携带旧版本号）在 verify-session / getCurrentUser 校验时判定失效，
-- 强制所有已签发会话重新登录。
-- 兼容：token 未携带版本号（历史 4 段 payload）视为版本 0；未应用迁移时
-- getUserSessionVersion 返回 0，不影响存量会话。
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
