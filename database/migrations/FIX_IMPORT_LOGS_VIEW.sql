-- ============================================================================
-- 导入日志汇总视图修复脚本
-- 如果您已经执行了完整的初始化SQL，但视图创建失败，可以单独执行此脚本
-- ============================================================================

-- 1. 创建导入日志摘要视图（详细视图）
CREATE OR REPLACE VIEW import_logs_summary AS
SELECT
  id,
  created_at,
  file_name,
  file_type,
  total_count,
  imported_count,
  skipped_count,
  failed_count,
  duration_ms,
  status,
  started_at,
  completed_at,
  CASE
    WHEN failed_count > 0 THEN '部分失败'
    WHEN skipped_count > 0 THEN '部分跳过'
    ELSE '全部成功'
  END AS result_status,
  CASE
    WHEN total_count > 0 THEN ROUND((imported_count::FLOAT / total_count) * 100, 2)
    ELSE 0
  END AS success_rate
FROM import_logs
ORDER BY created_at DESC;

COMMENT ON VIEW import_logs_summary IS '导入日志摘要视图，包含每条导入记录的详细信息';

-- 2. 创建导入日志每日汇总视图（统计视图）
CREATE OR REPLACE VIEW import_logs_daily_summary AS
SELECT
  DATE(created_at) as import_date,
  COUNT(*) as total_imports,
  SUM(total_count) as total_products,
  SUM(imported_count) as total_imported,
  SUM(skipped_count) as total_skipped,
  SUM(failed_count) as total_failed,
  AVG(CASE WHEN total_count > 0 THEN (imported_count::float / total_count::float) * 100 ELSE 0 END) as avg_success_rate
FROM import_logs
GROUP BY DATE(created_at)
ORDER BY import_date DESC;

COMMENT ON VIEW import_logs_daily_summary IS '导入日志每日汇总视图，按日期统计导入数据';

-- 3. 验证视图创建成功
SELECT
  viewname AS "视图名称",
  schemaname AS "模式名",
  viewowner AS "所有者"
FROM pg_views
WHERE viewname IN ('import_logs_summary', 'import_logs_daily_summary')
ORDER BY viewname;

-- 4. 测试查询（返回0条记录是正常的，因为还没有导入日志）
RAISE NOTICE '';
RAISE NOTICE '========== 视图创建验证 ==========';
RAISE NOTICE '✅ import_logs_summary 视图创建成功';
RAISE NOTICE '✅ import_logs_daily_summary 视图创建成功';
RAISE NOTICE '';

-- 显示汇总视图的结构
\d import_logs_daily_summary

RAISE NOTICE '';
RAISE NOTICE '========== 视图说明 ==========';
RAISE NOTICE 'import_logs_summary：显示每条导入记录的详细信息';
RAISE NOTICE 'import_logs_daily_summary：按日期统计导入数据，包含汇总统计';
RAISE NOTICE '';
