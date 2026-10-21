-- ============================================================
-- 迁移: 096_mall_products
-- 说明: 积分商城商品表
--   （#202608292400-阶段一-积分提现与积分商城）
-- 分类: vip(会员) / rank(排名) / gift(礼品) / template(模板) /
--       physical(实物) / custom(自定义)
-- 商品支持积分价 + 现金价双轨；虚拟商品自动发放，实物商品人工发货
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 积分商城商品表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mall_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('vip', 'rank', 'gift', 'template', 'physical', 'custom')),
  points_price INTEGER DEFAULT 0,       -- 积分价格（0表示不支持积分购买）
  cash_price DECIMAL(10,2) DEFAULT 0,   -- 现金价格（0表示不支持现金购买）
  stock INTEGER DEFAULT -1,             -- -1表示无限库存
  image_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  is_virtual BOOLEAN DEFAULT true,      -- true=虚拟商品，false=实物
  sort_order INTEGER DEFAULT 0,
  metadata JSONB,                       -- 扩展字段（如会员天数/排名天数等）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_mall_products_category ON mall_products(category);
CREATE INDEX IF NOT EXISTS idx_mall_products_active ON mall_products(is_active);
CREATE INDEX IF NOT EXISTS idx_mall_products_sort ON mall_products(sort_order);

COMMENT ON TABLE mall_products IS '积分商城商品表';
COMMENT ON COLUMN mall_products.category IS '商品分类: vip(会员)/rank(排名)/gift(礼品)/template(模板)/physical(实物)/custom(自定义)';
COMMENT ON COLUMN mall_products.points_price IS '积分价格，0=不支持积分购买';
COMMENT ON COLUMN mall_products.cash_price IS '现金价格（元），0=不支持现金购买';
COMMENT ON COLUMN mall_products.stock IS '库存，-1=无限库存';
COMMENT ON COLUMN mall_products.is_virtual IS 'true=虚拟商品（自动发放权益），false=实物（管理员发货）';
COMMENT ON COLUMN mall_products.metadata IS '扩展字段，如 {"vipDays":30,"rankDays":1,"code":"GIFT_CODE"}';

-- ------------------------------------------------------------
-- 2. 演示商品种子（便于后台/前端联调；正式运营可在后台管理）
-- ------------------------------------------------------------
INSERT INTO mall_products (name, description, category, points_price, cash_price, stock, is_active, is_virtual, sort_order, metadata) VALUES
  ('高级会员月卡', '开通高级会员 30 天，无限次报价与方案生成、无水印导出、专属客服', 'vip', 500, 29.90, -1, true, true, 1, '{"vipDays":30}'),
  ('排名置顶体验卡', '厂家排名置顶 1 天，提升产品曝光', 'rank', 200, 9.90, -1, true, true, 2, '{"rankDays":1}'),
  ('报价模板合集', '精选 50 套报价单/方案模板，购买后可重复下载', 'template', 100, 19.90, -1, true, true, 3, '{"templates":50}')
ON CONFLICT DO NOTHING;

COMMIT;
