-- ============================================================================
-- 纯SQL修复脚本 - 不包含任何说明文字
-- 直接复制此部分到Supabase SQL Editor执行即可
-- ============================================================================

-- 备份现有数据
CREATE TABLE IF NOT EXISTS product_field_configs_backup_20260314 AS
SELECT * FROM product_field_configs;

-- 删除旧表（如果存在）
DROP TABLE IF EXISTS product_field_configs;

-- 创建新表
CREATE TABLE product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  is_duplicate_check BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  options JSONB,
  validation_rules JSONB,
  default_value TEXT,
  placeholder TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- 插入12个字段配置
INSERT INTO product_field_configs (field_key, display_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
('category', '分类', 'category', 'text', FALSE, FALSE, TRUE, 1),
('name', '产品名称', 'product_name', 'text', TRUE, TRUE, TRUE, 2),
('model', '规格型号', 'model', 'text', FALSE, TRUE, TRUE, 3),
('brand', '品牌', 'brand', 'text', FALSE, TRUE, TRUE, 4),
('parameter_description', '参数描述', 'parameter_description', 'textarea', FALSE, FALSE, TRUE, 5),
('supplier', '供应商', 'supplier', 'text', FALSE, FALSE, TRUE, 6),
('contact_person', '联系人', 'contact_person', 'text', FALSE, FALSE, TRUE, 7),
('contact_phone', '电话', 'contact_phone', 'text', FALSE, FALSE, TRUE, 8),
('unit', '单位', 'unit', 'text', FALSE, FALSE, TRUE, 9),
('cost_price', '成本（元）', 'cost_price', 'number', FALSE, FALSE, TRUE, 10),
('min_price', '最低售价（元）', 'min_price', 'number', FALSE, FALSE, TRUE, 11),
('price', '指导价（元）', 'price', 'number', FALSE, FALSE, TRUE, 12);

-- 添加索引
CREATE INDEX idx_product_field_configs_field_key ON product_field_configs(field_key);
CREATE INDEX idx_product_field_configs_is_duplicate_check ON product_field_configs(is_duplicate_check) WHERE is_duplicate_check = TRUE;
CREATE INDEX idx_product_field_configs_display_order ON product_field_configs(display_order);
CREATE INDEX idx_product_field_configs_is_required ON product_field_configs(is_required);
CREATE INDEX idx_product_field_configs_is_visible ON product_field_configs(is_visible);

-- 添加表注释
COMMENT ON TABLE product_field_configs IS '产品字段配置表，管理产品库的字段显示、必填、判重等配置';
COMMENT ON COLUMN product_field_configs.field_key IS '字段唯一标识符';
COMMENT ON COLUMN product_field_configs.display_name IS '字段显示名称（中文）';
COMMENT ON COLUMN product_field_configs.field_label IS '字段英文标签（对应数据库字段名）';
COMMENT ON COLUMN product_field_configs.field_type IS '字段类型：text, number, textarea, select, date等';
COMMENT ON COLUMN product_field_configs.is_required IS '是否必填';
COMMENT ON COLUMN product_field_configs.is_duplicate_check IS '是否用于判重';
COMMENT ON COLUMN product_field_configs.is_visible IS '是否在界面显示';
COMMENT ON COLUMN product_field_configs.display_order IS '显示顺序';

-- 创建导入日志表（如果不存在）
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT,
  file_type TEXT,
  total_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  duplicate_config JSONB,
  details JSONB,
  duration_ms INTEGER,
  status TEXT DEFAULT 'completed',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加导入日志表索引
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at ON import_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_logs_user_id ON import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_started_at ON import_logs(started_at DESC);

-- 添加导入日志表注释
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

-- 创建导入日志详细视图
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

-- 创建导入日志汇总视图
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

-- 验证数据插入
SELECT
  field_key AS "字段键",
  display_name AS "字段名",
  field_label AS "字段标签",
  field_type AS "类型",
  CASE WHEN is_required THEN '是' ELSE '否' END AS "必填",
  CASE WHEN is_duplicate_check THEN '是' ELSE '否' END AS "判重",
  CASE WHEN is_visible THEN '是' ELSE '否' END AS "可见",
  display_order AS "顺序"
FROM product_field_configs
ORDER BY display_order;

-- 显示表结构
\d product_field_configs
