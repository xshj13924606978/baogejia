-- ============================================================
-- 迁移: 101_token_packages
-- 说明: Token 套餐表（阶段二 #202608292500-会员与Token套餐）
-- 关联: token_purchases（购买记录）、微信支付（TK 前缀订单）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Token 套餐表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  token_amount INTEGER NOT NULL, -- Token数量
  price DECIMAL(10,2) NOT NULL, -- 价格（元）
  original_price DECIMAL(10,2), -- 原价
  bonus_token INTEGER DEFAULT 0, -- 赠送Token
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE token_packages IS 'Token套餐表';
COMMENT ON COLUMN token_packages.token_amount IS '套餐内 Token 数量';
COMMENT ON COLUMN token_packages.bonus_token IS '赠送 Token 数量（到账为 token_amount + bonus_token）';

-- ------------------------------------------------------------
-- 2. 默认套餐种子
-- ------------------------------------------------------------
INSERT INTO token_packages (code, name, description, token_amount, price, original_price, bonus_token, sort_order, is_popular) VALUES
  ('starter', '体验包', '适合首次体验AI报价', 100, 9.90, 19.90, 0, 10, false),
  ('basic', '基础包', '适合日常使用', 500, 39.90, 69.90, 50, 20, true),
  ('standard', '标准包', '适合高频使用者', 1200, 89.90, 159.90, 120, 30, true),
  ('pro', '专业包', '适合专业人士', 3000, 199.00, 399.00, 300, 40, false),
  ('enterprise', '企业包', '适合企业团队使用', 10000, 599.00, 1199.00, 1000, 50, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  token_amount = EXCLUDED.token_amount,
  price = EXCLUDED.price,
  original_price = EXCLUDED.original_price,
  bonus_token = EXCLUDED.bonus_token,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular;

COMMIT;
