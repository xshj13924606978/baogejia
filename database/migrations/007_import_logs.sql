-- 导入日志表迁移
-- 用于记录产品导入操作的历史记录，包括导入结果、判重配置等详细信息

-- 创建导入日志表
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 导入基本信息
  file_name TEXT, -- 导入的文件名
  file_type TEXT, -- 文件类型：excel, pdf
  total_count INTEGER NOT NULL, -- 总记录数
  imported_count INTEGER NOT NULL DEFAULT 0, -- 成功导入数量
  skipped_count INTEGER NOT NULL DEFAULT 0, -- 跳过数量（重复）
  failed_count INTEGER NOT NULL DEFAULT 0, -- 失败数量

  -- 判重配置
  duplicate_config JSONB, -- 判重规则配置

  -- 详细信息
  details JSONB, -- 导入详情，包括错误信息、跳过原因等
  duration_ms INTEGER, -- 导入耗时（毫秒）

  -- 索引字段
  status TEXT DEFAULT 'completed', -- 状态：pending, completed, failed

  -- 时间戳
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at
ON import_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_user_id
ON import_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_import_logs_status
ON import_logs(status);

CREATE INDEX IF NOT EXISTS idx_import_logs_started_at
ON import_logs(started_at DESC);

-- 添加注释
COMMENT ON TABLE import_logs IS '产品导入日志表，记录所有导入操作的详细信息';
COMMENT ON COLUMN import_logs.file_name IS '导入的文件名';
COMMENT ON COLUMN import_logs.file_type IS '文件类型：excel, pdf';
COMMENT ON COLUMN import_logs.total_count IS '总记录数';
COMMENT ON COLUMN import_logs.imported_count IS '成功导入数量';
COMMENT ON COLUMN import_logs.skipped_count IS '跳过数量（重复）';
COMMENT ON COLUMN import_logs.failed_count IS '失败数量';
COMMENT ON COLUMN import_logs.duplicate_config IS '判重规则配置（JSON格式）';
COMMENT ON COLUMN import_logs.details IS '导入详情，包括错误信息、跳过原因等（JSON格式）';
COMMENT ON COLUMN import_logs.duration_ms IS '导入耗时（毫秒）';
COMMENT ON COLUMN import_logs.status IS '状态：pending, completed, failed';
COMMENT ON COLUMN import_logs.started_at IS '导入开始时间';
COMMENT ON COLUMN import_logs.completed_at IS '导入完成时间';

-- 创建视图：导入日志摘要
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

COMMENT ON VIEW import_logs_summary IS '导入日志摘要视图，包含导入结果的统计信息';
