-- ============================================================================
-- 强制删除并重建表（解决DROP TABLE不生效的问题）
-- ============================================================================

-- 步骤1：检查是否有外键约束
SELECT '=== 检查外键约束 ===' as step;
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (tc.table_name = 'product_field_configs' OR ccu.table_name = 'product_field_configs');

-- 步骤2：强制删除所有依赖
SELECT '=== 开始删除 ===' as step;
DROP TABLE IF EXISTS product_field_configs CASCADE;
SELECT '表已删除' as status;

-- 步骤3：验证删除
SELECT '=== 验证删除 ===' as step;
SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_name = 'product_field_configs';
SELECT '如果返回0，说明删除成功；如果返回1，说明删除失败' as note;

-- 步骤4：创建新表
SELECT '=== 创建新表 ===' as step;
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

-- 步骤5：验证创建
SELECT '=== 验证创建 ===' as step;
SELECT COUNT(*) as column_count FROM information_schema.columns WHERE table_name = 'product_field_configs';
SELECT '应该返回16列' as note;

-- 步骤6：插入数据
SELECT '=== 插入数据 ===' as step;
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

-- 步骤7：最终验证
SELECT '=== 最终验证 ===' as step;

-- 验证列数
SELECT
    '列数' as check_item,
    COUNT(*) as value,
    CASE
        WHEN COUNT(*) = 16 THEN '✅ 正确'
        ELSE '❌ 错误，应该是16列'
    END as status
FROM information_schema.columns
WHERE table_name = 'product_field_configs';

-- 验证关键列
SELECT
    'field_name列' as check_item,
    COUNT(*) as value,
    CASE
        WHEN COUNT(*) = 1 THEN '✅ 存在'
        ELSE '❌ 不存在'
    END as status
FROM information_schema.columns
WHERE table_name = 'product_field_configs' AND column_name = 'field_name';

SELECT
    'is_duplicate_check列' as check_item,
    COUNT(*) as value,
    CASE
        WHEN COUNT(*) = 1 THEN '✅ 存在'
        ELSE '❌ 不存在'
    END as status
FROM information_schema.columns
WHERE table_name = 'product_field_configs' AND column_name = 'is_duplicate_check';

-- 验证记录数
SELECT
    '记录数' as check_item,
    COUNT(*) as value,
    CASE
        WHEN COUNT(*) = 15 THEN '✅ 正确'
        ELSE '❌ 错误，应该是15条'
    END as status
FROM product_field_configs;

-- 验证判重字段
SELECT
    '判重字段数量' as check_item,
    COUNT(*) as value,
    CASE
        WHEN COUNT(*) = 2 THEN '✅ 正确'
        ELSE '❌ 错误，应该是2条'
    END as status
FROM product_field_configs
WHERE is_duplicate_check = true;

-- 显示判重字段
SELECT
    field_key,
    field_name,
    is_duplicate_check
FROM product_field_configs
WHERE is_duplicate_check = true
ORDER BY display_order;

SELECT '=== 完成 ===' as step;
