-- 为 point_logs 表补充撤销功能所需列
ALTER TABLE point_logs 
ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_point_logs_reference_id ON point_logs(reference_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_reversed_at ON point_logs(reversed_at);

-- 注释
COMMENT ON COLUMN point_logs.reference_id IS '幂等参考ID';
COMMENT ON COLUMN point_logs.metadata IS '扩展元数据（JSON）';
COMMENT ON COLUMN point_logs.reversed_at IS '撤销时间';
COMMENT ON COLUMN point_logs.reversed_by IS '撤销操作人';
