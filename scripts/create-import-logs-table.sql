-- 创建导入日志表
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'excel',
  total_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'failed', 'processing'
  duplicate_config JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at ON import_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);

-- 创建更新时间的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_import_logs_updated_at ON import_logs;
CREATE TRIGGER update_import_logs_updated_at
  BEFORE UPDATE ON import_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE import_logs IS '产品导入日志表';
COMMENT ON COLUMN import_logs.file_name IS '导入文件名';
COMMENT ON COLUMN import_logs.file_type IS '文件类型（excel/csv等）';
COMMENT ON COLUMN import_logs.total_count IS '总记录数';
COMMENT ON COLUMN import_logs.imported_count IS '成功导入数';
COMMENT ON COLUMN import_logs.skipped_count IS '跳过数（重复）';
COMMENT ON COLUMN import_logs.failed_count IS '失败数';
COMMENT ON COLUMN import_logs.duration_ms IS '导入耗时（毫秒）';
COMMENT ON COLUMN import_logs.status IS '导入状态：completed-完成，failed-失败，processing-处理中';
COMMENT ON COLUMN import_logs.duplicate_config IS '判重配置JSON';
COMMENT ON COLUMN import_logs.error_message IS '错误信息';
