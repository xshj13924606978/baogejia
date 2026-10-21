-- 产品字段统一迁移脚本
-- 目标：统一产品字段为13个标准字段
-- 分类、产品名称、规格型号、参数描述、品牌、单位、供应商、联系人、联系电话、成本价、最低售价、指导价、产品图片

-- 1. 更新 products 表结构，添加缺失字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS parameter_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price NUMERIC(10, 2);

-- 2. 重命名 image_url 字段（如果需要）
-- 如果 imageUrl 存在但 image_url 不存在，则重命名
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'imageUrl') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image_url') THEN
      ALTER TABLE products RENAME COLUMN "imageUrl" TO image_url;
    END IF;
  END IF;
END $$;

-- 3. 删除不再使用的 description 字段（数据迁移到 parameter_description）
UPDATE products SET parameter_description = description WHERE parameter_description IS NULL AND description IS NOT NULL;
-- 保留 description 字段但不再在界面显示

-- 4. 更新字段配置表
-- 先清空现有配置
DELETE FROM product_field_configs;

-- 插入标准字段配置（13个标准字段 + 系统字段）
INSERT INTO product_field_configs (field_key, field_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
-- 统一产品字段规范（13个标准字段）
('category', '分类', '分类', 'text', FALSE, FALSE, TRUE, 1),
('name', '产品名称', '产品名称', 'text', TRUE, TRUE, TRUE, 2),
('model', '规格型号', '规格型号', 'text', FALSE, TRUE, TRUE, 3),
('parameter_description', '参数描述', '参数描述', 'text', FALSE, FALSE, TRUE, 4),
('brand', '品牌', '品牌', 'text', FALSE, FALSE, TRUE, 5),
('unit', '单位', '单位', 'text', FALSE, FALSE, TRUE, 6),
('supplier', '供应商', '供应商', 'text', FALSE, FALSE, TRUE, 7),
('contact_person', '联系人', '联系人', 'text', FALSE, FALSE, TRUE, 8),
('contact_phone', '联系电话', '联系电话', 'text', FALSE, FALSE, TRUE, 9),
('cost_price', '成本价', '成本价', 'number', FALSE, FALSE, TRUE, 10),
('min_price', '最低售价', '最低售价', 'number', FALSE, FALSE, TRUE, 11),
('price', '指导价', '指导价', 'number', TRUE, FALSE, TRUE, 12),
('image_url', '产品图片', '产品图片', 'text', FALSE, FALSE, TRUE, 13),
-- 系统字段（不显示在界面上）
('stock', '库存', '库存', 'number', FALSE, FALSE, FALSE, 100);

-- 5. 更新注释
COMMENT ON COLUMN products.category IS '分类';
COMMENT ON COLUMN products.name IS '产品名称（必填）';
COMMENT ON COLUMN products.model IS '规格型号';
COMMENT ON COLUMN products.parameter_description IS '参数描述';
COMMENT ON COLUMN products.brand IS '品牌';
COMMENT ON COLUMN products.unit IS '单位';
COMMENT ON COLUMN products.supplier IS '供应商';
COMMENT ON COLUMN products.contact_person IS '联系人';
COMMENT ON COLUMN products.contact_phone IS '联系电话';
COMMENT ON COLUMN products.cost_price IS '成本价';
COMMENT ON COLUMN products.min_price IS '最低售价';
COMMENT ON COLUMN products.price IS '指导价（必填）';
COMMENT ON COLUMN products.image_url IS '产品图片';

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '产品字段统一迁移完成！';
  RAISE NOTICE '已添加字段: parameter_description, brand, unit, contact_person, contact_phone, cost_price, min_price';
  RAISE NOTICE '标准字段数量: 13个';
END $$;
