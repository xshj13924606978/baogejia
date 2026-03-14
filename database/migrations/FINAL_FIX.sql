DROP TABLE IF EXISTS product_field_configs CASCADE;
DROP TABLE IF EXISTS import_logs CASCADE;
DROP VIEW IF EXISTS import_logs_summary;
DROP VIEW IF EXISTS import_logs_daily_summary;

CREATE TABLE product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,
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

INSERT INTO product_field_configs (field_key, field_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
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

CREATE INDEX idx_product_field_configs_field_key ON product_field_configs(field_key);
CREATE INDEX idx_product_field_configs_is_duplicate_check ON product_field_configs(is_duplicate_check) WHERE is_duplicate_check = TRUE;
CREATE INDEX idx_product_field_configs_display_order ON product_field_configs(display_order);
CREATE INDEX idx_product_field_configs_is_required ON product_field_configs(is_required);
CREATE INDEX idx_product_field_configs_is_visible ON product_field_configs(is_visible);

CREATE TABLE import_logs (
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

CREATE INDEX idx_import_logs_created_at ON import_logs(created_at DESC);
CREATE INDEX idx_import_logs_user_id ON import_logs(user_id);
CREATE INDEX idx_import_logs_status ON import_logs(status);
CREATE INDEX idx_import_logs_started_at ON import_logs(started_at DESC);

CREATE OR REPLACE VIEW import_logs_summary AS
SELECT id, created_at, file_name, file_type, total_count, imported_count, skipped_count, failed_count, duration_ms, status, started_at, completed_at,
  CASE WHEN failed_count > 0 THEN '部分失败' WHEN skipped_count > 0 THEN '部分跳过' ELSE '全部成功' END AS result_status,
  CASE WHEN total_count > 0 THEN ROUND((imported_count::FLOAT / total_count) * 100, 2) ELSE 0 END AS success_rate
FROM import_logs ORDER BY created_at DESC;

CREATE OR REPLACE VIEW import_logs_daily_summary AS
SELECT DATE(created_at) as import_date, COUNT(*) as total_imports, SUM(total_count) as total_products, SUM(imported_count) as total_imported,
  SUM(skipped_count) as total_skipped, SUM(failed_count) as total_failed,
  AVG(CASE WHEN total_count > 0 THEN (imported_count::float / total_count::float) * 100 ELSE 0 END) as avg_success_rate
FROM import_logs GROUP BY DATE(created_at) ORDER BY import_date DESC;

SELECT field_key, field_name, field_label, is_required, is_duplicate_check, display_order FROM product_field_configs ORDER BY display_order;
