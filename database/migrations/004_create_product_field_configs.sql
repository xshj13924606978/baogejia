-- 创建产品字段配置表
-- 用于管理产品库的字段配置，包括字段显示、必填项、判重字段等

CREATE TABLE IF NOT EXISTS product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL, -- text, number, date, boolean, select
  is_required BOOLEAN DEFAULT FALSE,
  is_duplicate_check BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  options JSONB, -- 用于 select 类型的选项
  validation_rules JSONB, -- 验证规则
  default_value TEXT,
  placeholder TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- 插入默认字段配置
INSERT INTO product_field_configs (field_key, field_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
-- 核心字段
('name', '产品名称', 'product_name', 'text', TRUE, TRUE, TRUE, 1),
('model', '规格型号', 'model', 'text', FALSE, TRUE, TRUE, 2),
('brand', '品牌', 'brand', 'text', FALSE, FALSE, TRUE, 3),

-- 价格相关
('price', '指导价', 'price', 'number', TRUE, FALSE, TRUE, 4),
('cost_price', '成本价', 'cost_price', 'number', FALSE, FALSE, FALSE, 5),
('min_price', '最低售价', 'min_price', 'number', FALSE, FALSE, FALSE, 6),

-- 产品详情
('parameter_description', '参数描述', 'parameter_description', 'text', FALSE, FALSE, TRUE, 7),
('description', '描述', 'description', 'text', FALSE, FALSE, TRUE, 8),
('unit', '单位', 'unit', 'text', FALSE, FALSE, TRUE, 9),
('stock', '库存', 'stock', 'number', FALSE, FALSE, TRUE, 10),
('category', '分类', 'category', 'text', FALSE, FALSE, TRUE, 11),

-- 供应商信息
('supplier', '供应商', 'supplier', 'text', FALSE, FALSE, TRUE, 12),
('contact_person', '联系人', 'contact_person', 'text', FALSE, FALSE, TRUE, 13),
('contact_phone', '联系电话', 'contact_phone', 'text', FALSE, FALSE, TRUE, 14),

-- 其他
('image_url', '图片', 'image_url', 'text', FALSE, FALSE, TRUE, 15)
ON CONFLICT (field_key) DO NOTHING;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_product_field_configs_field_key ON product_field_configs(field_key);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_required ON product_field_configs(is_required);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_duplicate_check ON product_field_configs(is_duplicate_check);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_display_order ON product_field_configs(display_order);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_visible ON product_field_configs(is_visible);

-- 添加注释
COMMENT ON TABLE product_field_configs IS '产品字段配置表，管理产品库的字段显示、必填、判重等配置';
COMMENT ON COLUMN product_field_configs.field_key IS '字段标识，唯一键';
COMMENT ON COLUMN product_field_configs.field_name IS '字段名称（对应数据库字段名）';
COMMENT ON COLUMN product_field_configs.field_label IS '字段显示标签';
COMMENT ON COLUMN product_field_configs.field_type IS '字段类型：text, number, date, boolean, select';
COMMENT ON COLUMN product_field_configs.is_required IS '是否必填字段';
COMMENT ON COLUMN product_field_configs.is_duplicate_check IS '是否参与判重';
COMMENT ON COLUMN product_field_configs.is_visible IS '是否可见';
COMMENT ON COLUMN product_field_configs.display_order IS '显示顺序';
COMMENT ON COLUMN product_field_configs.options IS '字段选项（JSON格式）';
COMMENT ON COLUMN product_field_configs.validation_rules IS '验证规则（JSON格式）';
COMMENT ON COLUMN product_field_configs.default_value IS '默认值';
COMMENT ON COLUMN product_field_configs.placeholder IS '占位符';
COMMENT ON COLUMN product_field_configs.description IS '字段描述';
