-- ============================================================================
-- 步骤1：诊断当前表结构
-- ============================================================================

-- 检查表是否存在
SELECT '=== 检查表是否存在 ===' as step;
SELECT
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name = 'product_field_configs'
  AND table_schema = 'public';

-- 检查表的所有列
SELECT '=== 当前表的列结构 ===' as step;
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    ordinal_position
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 检查表的数据
SELECT '=== 当前表的数据（前3行） ===' as step;
SELECT
    field_key,
    field_name,
    field_label,
    is_duplicate_check,
    display_order
FROM product_field_configs
ORDER BY display_order
LIMIT 3;

-- 检查记录数
SELECT '=== 记录数统计 ===' as step;
SELECT COUNT(*) as total_records FROM product_field_configs;

-- ============================================================================
-- 步骤2：删除旧表
-- ============================================================================

SELECT '=== 开始删除旧表 ===' as step;
DROP TABLE IF EXISTS product_field_configs CASCADE;
SELECT '旧表已删除' as status;

-- ============================================================================
-- 步骤3：创建新表
-- ============================================================================

SELECT '=== 开始创建新表 ===' as step;
CREATE TABLE product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  is_duplicate_check BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  options JSONB,
  validation_rules JSONB,
  default_value TEXT,
  placeholder TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);
SELECT '新表已创建' as status;

-- ============================================================================
-- 步骤4：插入数据
-- ============================================================================

SELECT '=== 开始插入数据 ===' as step;
INSERT INTO product_field_configs (field_key, field_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
('name', '产品名称', 'product_name', 'text', TRUE, TRUE, TRUE, 1),
('model', '规格型号', 'model', 'text', FALSE, TRUE, TRUE, 2),
('brand', '品牌', 'brand', 'text', FALSE, FALSE, TRUE, 3),
('price', '指导价', 'price', 'number', TRUE, FALSE, TRUE, 4),
('cost_price', '成本价', 'cost_price', 'number', FALSE, FALSE, FALSE, 5),
('min_price', '最低售价', 'min_price', 'number', FALSE, FALSE, FALSE, 6),
('parameter_description', '参数描述', 'parameter_description', 'text', FALSE, FALSE, TRUE, 7),
('description', '描述', 'description', 'text', FALSE, FALSE, TRUE, 8),
('unit', '单位', 'unit', 'text', FALSE, FALSE, TRUE, 9),
('stock', '库存', 'stock', 'number', FALSE, FALSE, TRUE, 10),
('category', '分类', 'category', 'text', FALSE, FALSE, TRUE, 11),
('supplier', '供应商', 'supplier', 'text', FALSE, FALSE, TRUE, 12),
('contact_person', '联系人', 'contact_person', 'text', FALSE, FALSE, TRUE, 13),
('contact_phone', '联系电话', 'contact_phone', 'text', FALSE, FALSE, TRUE, 14),
('image_url', '图片', 'image_url', 'text', FALSE, FALSE, TRUE, 15);
SELECT '数据已插入' as status;

-- ============================================================================
-- 步骤5：验证结果
-- ============================================================================

SELECT '=== 验证：表结构 ===' as step;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
  AND column_name IN ('field_key', 'field_name', 'is_duplicate_check')
ORDER BY column_name;

SELECT '=== 验证：数据量 ===' as step;
SELECT COUNT(*) as total_records FROM product_field_configs;

SELECT '=== 验证：判重字段 ===' as step;
SELECT
    field_key,
    field_name,
    is_duplicate_check,
    display_order
FROM product_field_configs
WHERE is_duplicate_check = true
ORDER BY display_order;

SELECT '=== 完成 ===' as step;
