-- 通用邀请码表（裂变邀请：无需登录生成，人人可转发，首次使用绑定邀请人）
-- 创建时间: 2026-08-14
-- 注意：与贡献者个人邀请码（contributors.invite_code）及现有 invite_codes 表（005 迁移，用户专属）
-- 完全隔离，本表专用于"通用邀请码"裂变场景。

-- ============================================================================
-- 1. 通用邀请码表
--    - 个人邀请码：注册用户专属，精确追踪（contributors.invite_code / invite_codes 表）
--    - 通用邀请码：任意用户可生成（无需登录），可分享到微信群/朋友圈等任意渠道
--    通用邀请码为一次性使用，首次注册用户绑定为使用人，创建者获得邀请奖励
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.universal_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,                          -- 8 位通用邀请码
  creator_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- 创建者（生成时已登录则记录，未登录为 NULL）
  status VARCHAR(20) DEFAULT 'active',                       -- active/used/expired
  used_by UUID REFERENCES public.users(id) ON DELETE SET NULL,     -- 首次使用并注册的用户
  used_at TIMESTAMP,                                         -- 使用时间
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,                                      -- 过期时间（默认 30 天）
  click_count INTEGER DEFAULT 0,                             -- 链接点击次数
  source VARCHAR(50)                                         -- 渠道来源：wechat/qq/email/share 等
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_universal_invite_codes_code ON public.universal_invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_universal_invite_codes_creator ON public.universal_invite_codes(creator_id);
CREATE INDEX IF NOT EXISTS idx_universal_invite_codes_status ON public.universal_invite_codes(status);

-- RLS 策略（服务角色绕过 RLS，公开可读取校验邀请码）
ALTER TABLE public.universal_invite_codes ENABLE ROW LEVEL SECURITY;

-- 邀请码：公开可读取（用于校验邀请码有效性）
DROP POLICY IF EXISTS universal_invite_codes_select ON public.universal_invite_codes;
CREATE POLICY universal_invite_codes_select ON public.universal_invite_codes
  FOR SELECT USING (true);

-- 邀请码：服务端可插入
DROP POLICY IF EXISTS universal_invite_codes_insert ON public.universal_invite_codes;
CREATE POLICY universal_invite_codes_insert ON public.universal_invite_codes
  FOR INSERT WITH CHECK (true);

-- 邀请码：服务端可更新（点击统计、绑定使用人、标记已使用/过期）
DROP POLICY IF EXISTS universal_invite_codes_update ON public.universal_invite_codes;
CREATE POLICY universal_invite_codes_update ON public.universal_invite_codes
  FOR UPDATE USING (true) WITH CHECK (true);
