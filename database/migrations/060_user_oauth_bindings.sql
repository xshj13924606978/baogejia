-- 060_user_oauth_bindings.sql
-- #20260820-1600 微信 OAuth 绑定落库
-- #20260821-0930 修正：user_id FK 目标为 public.users(id)（本项目为自定义会话模型，
--   业务主键是 public.users.id，auth.users 不参与注册流程；原 FK 指向 auth.users 会导致绑定 FK 违例）
-- 幂等：IF NOT EXISTS / IF NOT EXISTS（列），可重复执行

-- 1. 第三方绑定表（绑定记录直接落库，替代原 oauth-service 的内存 Map）
CREATE TABLE IF NOT EXISTS public.user_oauth_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  unionid TEXT,
  access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一第三方 openid 只能绑定一个用户
  CONSTRAINT user_oauth_bindings_provider_provider_id_key UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_bindings_user
  ON public.user_oauth_bindings (user_id);

-- 2. users 表微信字段（扫码登录回调会回写昵称/头像）
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wechat_openid TEXT,
  ADD COLUMN IF NOT EXISTS wechat_nickname TEXT,
  ADD COLUMN IF NOT EXISTS wechat_avatar TEXT;
