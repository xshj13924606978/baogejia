-- ============================================================
-- 051: 产品价格库增加上传者（creator_id）
-- 需求：#20260816001 资料中心权限控制
-- 产品价格库：非管理员新增/编辑/导入，只能编辑自己的产品
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS creator_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_creator ON products (creator_id);
