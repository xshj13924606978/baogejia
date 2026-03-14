-- ============================================================================
-- 检查表结构和数据
-- ============================================================================

-- 步骤1：检查所有相关的表
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name LIKE '%product%'
  AND table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 步骤2：检查 product_field_configs 表的数据
SELECT
    field_key,
    field_name,
    is_duplicate_check,
    display_order
FROM product_field_configs
ORDER BY display_order;

-- 步骤3：检查是否有旧的表结构
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'product_field_configs'
ORDER BY ordinal_position;

-- 步骤4：统计各表的记录数
SELECT
    schemaname,
    tablename,
    n_tup_ins AS total_inserts,
    n_tup_upd AS total_updates,
    n_tup_del AS total_deletes,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows
FROM pg_stat_user_tables
WHERE tablename LIKE '%product%'
ORDER BY tablename;
