-- ============================================================
-- 057_sms_verification_codes.sql
-- 短信验证码表：注册手机号验证（防虚假注册）
-- 说明：users 表手机号统一存 metadata（metadata.phone / metadata.phone_verified），
--       故此处仅新建验证码表，不改动 users 表结构。
-- 注意：Supabase REST 不支持多语句 DDL，请在 SQL Editor 或 exec_sql RPC 中分条执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'general',   -- register / bind / general
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_verification_codes_phone_created
  ON sms_verification_codes (phone, created_at DESC);

-- RLS：启用且无任何策略 = anon/authenticated 默认拒绝，仅 service_role 可访问
ALTER TABLE sms_verification_codes ENABLE ROW LEVEL SECURITY;
