-- ============================================================================
-- 字段列名修复脚本
-- 如果您的数据库表使用的是 field_name 而不是 display_name，执行此脚本修复
-- ============================================================================

-- 1. 备份数据（可选）
CREATE TABLE IF NOT EXISTS product_field_configs_backup_$(date +%Y%m%d) AS
SELECT * FROM product_field_configs;

-- 2. 检查列是否存在
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_field_configs'
    AND column_name = 'field_name'
  ) THEN
    RAISE NOTICE '检测到 field_name 列，准备重命名为 display_name';
    
    -- 重命名列
    ALTER TABLE product_field_configs RENAME COLUMN field_name TO display_name;
    
    RAISE NOTICE '✅ 列重命名成功：field_name -> display_name';
  ELSE
    RAISE NOTICE 'field_name 列不存在，可能已经是 display_name';
  END IF;
  
  -- 检查 display_name 列是否存在
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_field_configs'
    AND column_name = 'display_name'
  ) THEN
    RAISE NOTICE '✅ display_name 列存在';
  ELSE
    RAISE WARNING '⚠️ display_name 列不存在，需要检查表结构';
  END IF;
END $$;

-- 3. 验证表结构
SELECT
  column_name AS "列名",
  data_type AS "数据类型",
  is_nullable AS "可空",
  column_default AS "默认值"
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
ORDER BY ordinal_position;

-- 4. 验证数据
SELECT
  field_key AS "字段键",
  display_name AS "显示名称",
  field_label AS "字段标签",
  is_required AS "必填",
  is_duplicate_check AS "判重",
  display_order AS "顺序"
FROM product_field_configs
ORDER BY display_order;

RAISE NOTICE '';
RAISE NOTICE '========== 修复完成 ==========';
RAISE NOTICE '如果显示 12 条记录，说明修复成功';
RAISE NOTICE '请刷新页面重新加载配置';
RAISE NOTICE '';
