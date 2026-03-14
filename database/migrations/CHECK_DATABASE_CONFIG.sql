-- ============================================================================
-- 检查数据库配置和schema
-- ============================================================================

-- 检查当前schema
SELECT '=== 当前schema ===' as step;
SELECT current_schema();

-- 检查所有schema
SELECT '=== 所有schema ===' as step;
SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema');

-- 检查所有包含'product'的表（在所有schema中）
SELECT '=== 检查所有product相关的表 ===' as step;
SELECT
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name LIKE '%product%'
ORDER BY table_schema, table_name;

-- 检查当前schema中的product_field_configs表
SELECT '=== 当前schema中的product_field_configs表 ===' as step;
SELECT
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name = 'product_field_configs'
  AND table_schema = current_schema();

-- 检查public schema中的product_field_configs表
SELECT '=== public schema中的product_field_configs表 ===' as step;
SELECT
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name = 'product_field_configs'
  AND table_schema = 'public';

-- 检查当前数据库
SELECT '=== 当前数据库 ===' as step;
SELECT current_database();

-- 检查所有数据库
SELECT '=== 所有数据库 ===' as step;
SELECT datname FROM pg_database WHERE datistemplate = false;
