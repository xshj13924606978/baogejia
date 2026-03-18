-- 添加产品扩展字段
-- 执行时间：2026-03-18

-- 添加参数描述字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS parameter_description TEXT;

-- 添加供应商字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(255);

-- 添加联系人字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);

-- 添加联系电话字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);

-- 添加成本价字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15,2) DEFAULT 0;

-- 添加最低售价字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price DECIMAL(15,2) DEFAULT 0;

-- 添加图片URL字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 添加库存字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;

-- 添加备注字段
COMMENT ON COLUMN products.parameter_description IS '产品参数描述';
COMMENT ON COLUMN products.supplier IS '供应商名称';
COMMENT ON COLUMN products.contact_person IS '联系人';
COMMENT ON COLUMN products.contact_phone IS '联系电话';
COMMENT ON COLUMN products.cost_price IS '成本价';
COMMENT ON COLUMN products.min_price IS '最低售价';
COMMENT ON COLUMN products.image_url IS '产品图片链接';
COMMENT ON COLUMN products.stock IS '库存数量';
