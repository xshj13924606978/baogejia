-- 020_octopus_collection.sql
-- 八爪鱼 RPA 数据采集功能：产品类别表 + 采集日志表

-- 产品采集类别表
CREATE TABLE IF NOT EXISTS collection_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name)
);

COMMENT ON TABLE collection_categories IS '八爪鱼 RPA 产品采集类别配置';
COMMENT ON COLUMN collection_categories.name IS '类别名称（如：五金、建材）';
COMMENT ON COLUMN collection_categories.keywords IS '搜索关键词数组';
COMMENT ON COLUMN collection_categories.enabled IS '是否启用自动采集';

-- 采集日志表
CREATE TABLE IF NOT EXISTS collection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  total_collected INTEGER DEFAULT 0,
  new_products INTEGER DEFAULT 0,
  updated_products INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  duration_ms INTEGER
);

COMMENT ON TABLE collection_logs IS '八爪鱼 RPA 采集执行日志';
COMMENT ON COLUMN collection_logs.status IS '执行状态：pending/running/success/failed';
COMMENT ON COLUMN collection_logs.duration_ms IS '执行耗时（毫秒）';

-- 索引
CREATE INDEX IF NOT EXISTS idx_collection_logs_executed_at ON collection_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_logs_status ON collection_logs(status);
CREATE INDEX IF NOT EXISTS idx_collection_categories_enabled ON collection_categories(enabled);
