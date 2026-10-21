-- 091_oauth_pending_logins.sql
-- #20260828-账号统一：微信/QQ 扫码登录遇到「未绑定账号」时不再静默自动建号，
-- 而是暂存 OAuth 身份到本表并引导用户「绑定已有账号或注册新账号」。
-- 该表为临时登录凭据：随机 token 单次有效，10 分钟过期。
-- 幂等：IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS public.oauth_pending_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  name TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_logins_token
  ON public.oauth_pending_logins (token);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_logins_expires
  ON public.oauth_pending_logins (expires_at);
