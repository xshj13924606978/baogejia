-- ============================================================
-- 087_email_verification_codes.sql
-- 邮箱验证码/确认表：未登录邮箱场景的真实邮箱验证（防虚假注册）
-- 触发 #[20260828-1345] 修复：
--   邮箱场景必须验证邮箱真实性（与手机号短信验证码对称设计）
-- 通道：Supabase Admin generateLink({ type: 'magiclink' }) 触发内置 SMTP，
--       真实邮件发送（含 magic link 链接），用户从邮件中复制 token 验证
-- 持久化：所有验证状态写入本表，确保跨请求、跨进程一致
-- ============================================================

CREATE TABLE IF NOT EXISTS email_verification_codes (
  email text PRIMARY KEY,

  -- 验证状态
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  last_verified_method text,                       -- 'magiclink' / 'email_otp'

  -- 发送状态
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  send_count int NOT NULL DEFAULT 1,               -- 累计发送次数（防滥用）

  -- 当前发送的 token（来自 Supabase generateLink 返回）
  -- 注意：service_role 才有读写权限，绝不暴露给客户端
  current_hashed_token text,
  current_verification_type text,                  -- 'magiclink'
  current_email_otp text,                          -- generateLink 同时返回的 6 位 OTP（备用）
  current_action_link text,                        -- 完整的 magic link URL（供排查）
  current_expires_at timestamptz,                  -- 验证码过期时间

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 索引：高频查询路径（按验证状态 + 验证时间排序）
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_verified_at
  ON email_verification_codes (verified, verified_at DESC);

-- 索引：清理过期记录 / 按发送时间统计
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_last_sent_at
  ON email_verification_codes (last_sent_at DESC);

-- RLS：启用且无任何策略 = 默认拒绝客户端 anon/authenticated 访问
-- 仅 service_role 可读写（service_role 绕过 RLS）
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

-- 自动维护 updated_at
DROP TRIGGER IF EXISTS trg_email_verification_codes_updated_at ON email_verification_codes;
CREATE TRIGGER trg_email_verification_codes_updated_at
  BEFORE UPDATE ON email_verification_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 注释
-- ============================================================
COMMENT ON TABLE email_verification_codes IS
  '邮箱验证记录（#[20260828-1345]）：未登录场景下邮箱真实性验证（防虚假注册）';
COMMENT ON COLUMN email_verification_codes.email IS
  '邮箱（主键，规范化小写）';
COMMENT ON COLUMN email_verification_codes.verified IS
  '是否已验证（true 时 verified_at 必填）';
COMMENT ON COLUMN email_verification_codes.current_hashed_token IS
  '当前发送的 Supabase hashed_token（service_role only）';
COMMENT ON COLUMN email_verification_codes.current_email_otp IS
  '当前发送的 Supabase 6 位 OTP（service_role only，备用）';
COMMENT ON COLUMN email_verification_codes.current_expires_at IS
  '当前验证码过期时间（默认发送后 10 分钟）';