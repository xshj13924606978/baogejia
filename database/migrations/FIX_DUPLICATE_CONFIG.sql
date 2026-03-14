-- ============================================================================
-- 修复判重配置 SQL
-- ============================================================================
-- 问题：name、model、brand 字段的 is_duplicate_check 未启用
-- 解决：将这三个字段的 is_duplicate_check 设置为 TRUE

-- 步骤1：启用 name、model、brand 的判重功能
UPDATE product_field_configs
SET is_duplicate_check = TRUE
WHERE field_key IN ('name', 'model', 'brand');

-- 步骤2：验证修复结果
SELECT
  field_key,
  field_name,
  is_duplicate_check,
  display_order
FROM product_field_configs
WHERE is_duplicate_check = TRUE
ORDER BY display_order;

-- 预期结果：
-- field_key  | field_name | is_duplicate_check | display_order
-- -----------+------------+-------------------+---------------
-- name       | 产品名称   | true              | 1
-- model      | 规格型号   | true              | 2
-- brand      | 品牌       | true              | 3

-- ============================================================================
-- 执行完成标志
-- ============================================================================
-- 如果返回3行数据且 is_duplicate_check 都是 true，说明修复成功
