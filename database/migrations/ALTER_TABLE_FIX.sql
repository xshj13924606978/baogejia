-- ============================================================================
-- 方案2：ALTER TABLE 添加缺失的列（替代DROP TABLE）
-- ============================================================================

-- 步骤1：检查当前表结构
SELECT '=== 当前表结构 ===' as step;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
ORDER BY ordinal_position;

-- 步骤2：添加缺失的列
SELECT '=== 开始添加列 ===' as step;

-- 添加 field_name 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS field_name VARCHAR(100);
SELECT 'field_name列已添加' as status;

-- 添加 field_type 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS field_type VARCHAR(20);
SELECT 'field_type列已添加' as status;

-- 添加 is_duplicate_check 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;
SELECT 'is_duplicate_check列已添加' as status;

-- 添加 is_visible 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;
SELECT 'is_visible列已添加' as status;

-- 添加 display_order 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
SELECT 'display_order列已添加' as status;

-- 添加 options 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS options JSONB;
SELECT 'options列已添加' as status;

-- 添加 validation_rules 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS validation_rules JSONB;
SELECT 'validation_rules列已添加' as status;

-- 添加 default_value 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS default_value TEXT;
SELECT 'default_value列已添加' as status;

-- 添加 placeholder 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS placeholder TEXT;
SELECT 'placeholder列已添加' as status;

-- 添加 description 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS description TEXT;
SELECT 'description列已添加' as status;

-- 添加 created_by 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
SELECT 'created_by列已添加' as status;

-- 添加 updated_by 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
SELECT 'updated_by列已添加' as status;

-- 步骤3：验证列是否添加成功
SELECT '=== 验证列 ===' as step;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
  AND column_name IN ('field_name', 'field_type', 'is_duplicate_check', 'is_visible', 'display_order')
ORDER BY column_name;

SELECT '应该返回5列' as note;

-- 步骤4：更新现有数据的 field_name
SELECT '=== 更新 field_name ===' as step;
UPDATE product_field_configs SET field_name = '产品名称' WHERE field_key = 'product_name';
UPDATE product_field_configs SET field_name = '规格型号' WHERE field_key = 'model';
UPDATE product_field_configs SET field_name = '品牌' WHERE field_key = 'brand';
UPDATE product_field_configs SET field_name = '参数描述' WHERE field_key = 'specifications';
UPDATE product_field_configs SET field_name = '供应商' WHERE field_key = 'supplier';
UPDATE product_field_configs SET field_name = '联系人' WHERE field_key = 'contact_person';
UPDATE product_field_configs SET field_name = '联系电话' WHERE field_key = 'contact_phone';
UPDATE product_field_configs SET field_name = '单位' WHERE field_key = 'unit';
UPDATE product_field_configs SET field_name = '成本' WHERE field_key = 'cost_price';
UPDATE product_field_configs SET field_name = '最低售价' WHERE field_key = 'min_price';
UPDATE product_field_configs SET field_name = '指导价' WHERE field_key = 'price';
SELECT 'field_name 已更新' as status;

-- 步骤5：添加缺失的字段
SELECT '=== 添加缺失的字段 ===' as step;

-- 检查是否有 'name' 字段
INSERT INTO product_field_configs (field_key, field_name, field_label, is_required, is_duplicate_check, display_order)
SELECT 'name', '产品名称', 'product_name', TRUE, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM product_field_configs WHERE field_key = 'name');

SELECT 'name 字段已添加（如果不存在）' as status;

-- 步骤6：启用判重配置
SELECT '=== 启用判重配置 ===' as step;
UPDATE product_field_configs SET is_duplicate_check = TRUE WHERE field_key IN ('name', 'model', 'brand');
SELECT '判重配置已启用' as status;

-- 步骤7：最终验证
SELECT '=== 最终验证 ===' as step;

-- 检查关键列
SELECT
    column_name,
    '列存在' as status
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
  AND column_name IN ('field_name', 'is_duplicate_check', 'display_order')
ORDER BY column_name;

-- 检查数据
SELECT
    field_key,
    field_name,
    is_duplicate_check,
    display_order
FROM product_field_configs
ORDER BY display_order;

-- 检查判重字段
SELECT
    field_key,
    field_name,
    is_duplicate_check
FROM product_field_configs
WHERE is_duplicate_check = true
ORDER BY display_order;

SELECT '=== 完成 ===' as step;
