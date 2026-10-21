-- ============================================================
-- 迁移: 099_membership_plans
-- 说明: 会员套餐表（阶段二 #202608292500-会员与Token套餐）
-- level_code 对应会员等级映射（服务层 MEMBERSHIP_LEVEL_MAP）：
--   vip → L1(level 2) / premium → L3(level 4) / enterprise → L4(level 5)
-- 关联: user_memberships（订阅）、微信支付（MB 前缀订单）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 会员套餐表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE, -- monthly, yearly, quarterly
  name VARCHAR(100) NOT NULL, -- 月度会员、年度会员
  description TEXT,
  price DECIMAL(10,2) NOT NULL, -- 价格（元）
  original_price DECIMAL(10,2), -- 原价（用于展示折扣）
  duration_days INTEGER NOT NULL, -- 有效期（天）
  level_code VARCHAR(20) NOT NULL, -- 对应会员等级：vip, premium, enterprise
  benefits JSONB, -- 权益列表（如折扣率、专属资料等）
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE membership_plans IS '会员套餐表';
COMMENT ON COLUMN membership_plans.code IS '套餐编码：monthly(月度)/quarterly(季度)/yearly(年度)';
COMMENT ON COLUMN membership_plans.level_code IS '对应会员等级：vip(会员)/premium(黄金)/enterprise(白金)';
COMMENT ON COLUMN membership_plans.benefits IS '权益列表：{"discount_rate":0.8, "exclusive_content":true, "priority_support":true}';

-- ------------------------------------------------------------
-- 2. 默认套餐种子
-- ------------------------------------------------------------
INSERT INTO membership_plans (code, name, description, price, original_price, duration_days, level_code, benefits, sort_order, is_popular) VALUES
  ('monthly', '月度会员', '享受会员专属权益，按月订阅', 29.90, 39.90, 30, 'vip', '{"discount_rate":0.9, "exclusive_content":true, "priority_support":true}', 10, true),
  ('quarterly', '季度会员', '享受会员专属权益，按季订阅更优惠', 79.90, 119.70, 90, 'vip', '{"discount_rate":0.85, "exclusive_content":true, "priority_support":true}', 20, false),
  ('yearly', '年度会员', '享受会员专属权益，按年订阅最优惠', 299.00, 478.80, 365, 'premium', '{"discount_rate":0.8, "exclusive_content":true, "priority_support":true, "expert_consulting":true}', 30, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  original_price = EXCLUDED.original_price,
  duration_days = EXCLUDED.duration_days,
  level_code = EXCLUDED.level_code,
  benefits = EXCLUDED.benefits,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular;

COMMIT;
