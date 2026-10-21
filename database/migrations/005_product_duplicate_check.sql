-- 添加产品判重字段配置
-- 为 product_field_configs 表添加 is_duplicate_check 字段，用于标识哪些字段参与判重

-- 添加 is_duplicate_check 字段
ALTER TABLE product_field_configs
ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;

-- 初始化默认判重配置（name 和 model）
UPDATE product_field_configs
SET is_duplicate_check = TRUE
WHERE field_key IN ('name', 'model');

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_product_field_configs_duplicate_check
ON product_field_configs(is_duplicate_check)
WHERE is_duplicate_check = TRUE;

COMMENT ON COLUMN product_field_configs.is_duplicate_check IS '标识该字段是否用于产品导入时的重复判断';
