-- 导入日志表结构修复迁移 #[20260824-2300]
-- 问题：import_logs 表缺少代码写入时使用的列，导致 INSERT 失败被静默吞掉，
--      日志列表永远为空。此迁移以幂等方式补齐缺失列、索引与注释。

-- 补齐缺失列（幂等：已存在则跳过）
ALTER TABLE import_logs
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- 补齐缺失索引（幂等）
CREATE INDEX IF NOT EXISTS idx_import_logs_status
ON import_logs(status);

CREATE INDEX IF NOT EXISTS idx_import_logs_started_at
ON import_logs(started_at DESC);

-- 补齐注释（幂等）
COMMENT ON COLUMN import_logs.file_type IS '文件类型：excel, pdf';
COMMENT ON COLUMN import_logs.duration_ms IS '导入耗时（毫秒）';
COMMENT ON COLUMN import_logs.status IS '状态：pending, completed, failed';
COMMENT ON COLUMN import_logs.started_at IS '导入开始时间';
COMMENT ON COLUMN import_logs.completed_at IS '导入完成时间';

-- 重建导入日志摘要视图（按 007_import_logs.sql 定义，包含状态/耗时等字段）
-- 注意：旧版视图列名不同，CREATE OR REPLACE 无法改列名，需先 DROP
DROP VIEW IF EXISTS import_logs_summary;

CREATE VIEW import_logs_summary AS
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
    WHEN total_count > 0 THEN ROUND((imported_count::NUMERIC / total_count) * 100, 2)
    ELSE 0
  END AS success_rate
FROM import_logs
ORDER BY created_at DESC;

COMMENT ON VIEW import_logs_summary IS '导入日志摘要视图，包含导入结果的统计信息';
