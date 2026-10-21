-- ============================================================
-- 迁移: 105_brand_packages
-- 说明: 品牌付费套餐表（阶段三 #202608292600-厂商付费推广）
-- 权益配置：提升 priority_level / 加权 ranking_score / 匹配加成 / 认证标识
-- 关联: brand_payments（付费记录）、微信支付（BP 前缀订单）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 品牌付费套餐表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  -- 权益配置
  priority_level INTEGER NOT NULL DEFAULT 1, -- 提升到的优先等级
  duration_days INTEGER NOT NULL, -- 有效期（天）
  boost_score INTEGER DEFAULT 100, -- 提升排行权重分
  match_boost INTEGER DEFAULT 10, -- 匹配优先级提升百分比
  is_verified BOOLEAN DEFAULT false, -- 是否包含认证标识
  -- 其他
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE brand_packages IS '品牌付费套餐表';
COMMENT ON COLUMN brand_packages.priority_level IS '提升到的优先等级：1=白银，2=黄金，3=铂金';
COMMENT ON COLUMN brand_packages.match_boost IS '匹配优先级提升百分比（用于排序加分）';

-- ------------------------------------------------------------
-- 2. 默认套餐种子
-- ------------------------------------------------------------
INSERT INTO brand_packages (code, name, description, price, original_price, priority_level, duration_days, boost_score, match_boost, is_verified, sort_order, is_popular) VALUES
  ('silver', '白银推广', '品牌置顶展示，提升曝光', 199.00, 299.00, 1, 30, 100, 20, false, 10, true),
  ('gold', '黄金推广', '品牌置顶+认证标识，优先匹配', 499.00, 699.00, 2, 60, 300, 40, true, 20, true),
  ('platinum', '铂金推广', '顶级曝光+认证标识，优先匹配+专属支持', 999.00, 1499.00, 3, 90, 500, 60, true, 30, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  original_price = EXCLUDED.original_price,
  priority_level = EXCLUDED.priority_level,
  duration_days = EXCLUDED.duration_days,
  boost_score = EXCLUDED.boost_score,
  match_boost = EXCLUDED.match_boost,
  is_verified = EXCLUDED.is_verified,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular;

COMMIT;
