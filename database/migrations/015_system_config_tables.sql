-- ============================================================================
-- 超级管理员全配置系统 - 迁移脚本
-- 执行时间：2026-03-22
-- 版本：v1.0.0
-- 功能：创建模块配置、页面配置、字段配置、操作按钮配置四张核心表
--       支持层级关系、权限绑定、校验规则、国际化
-- ============================================================================

-- ============================================================================
-- 1. 模块配置表（system_modules）
-- 说明：定义系统中的功能模块，如产品管理、报价管理等
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_modules (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(50) UNIQUE NOT NULL,       -- 模块代码，如 'product', 'quote'
    module_name VARCHAR(100) NOT NULL,              -- 模块中文名
    module_name_en VARCHAR(100),                    -- 模块英文名
    icon VARCHAR(100),                              -- 图标标识（前端图标名称）
    path VARCHAR(200),                              -- 模块路由路径，如 '/admin/products'
    description TEXT,                               -- 模块描述
    sort_order INTEGER DEFAULT 0,                   -- 排序（数字越小越靠前）
    is_active BOOLEAN DEFAULT true,                 -- 是否启用
    permission_code VARCHAR(100),                   -- 关联权限代码，如 'product.manage'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_system_modules_code ON system_modules(module_code);
CREATE INDEX IF NOT EXISTS idx_system_modules_active ON system_modules(is_active);
CREATE INDEX IF NOT EXISTS idx_system_modules_sort ON system_modules(sort_order);
CREATE INDEX IF NOT EXISTS idx_system_modules_permission ON system_modules(permission_code);

-- 注释
COMMENT ON TABLE system_modules IS '系统模块配置表 - 定义功能模块的层级结构';
COMMENT ON COLUMN system_modules.module_code IS '模块唯一代码标识，如 product, quote, user';
COMMENT ON COLUMN system_modules.module_name IS '模块中文名称';
COMMENT ON COLUMN system_modules.module_name_en IS '模块英文名称（国际化）';
COMMENT ON COLUMN system_modules.icon IS '前端图标标识';
COMMENT ON COLUMN system_modules.path IS '模块路由路径';
COMMENT ON COLUMN system_modules.sort_order IS '排序权重，数字越小越靠前';
COMMENT ON COLUMN system_modules.permission_code IS '关联权限系统中的权限代码';
COMMENT ON COLUMN system_modules.is_active IS '是否启用该模块';

-- ============================================================================
-- 2. 页面配置表（system_pages）
-- 说明：定义模块下的页面，如列表页、新增页、详情页等
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_pages (
    id SERIAL PRIMARY KEY,
    module_id INTEGER NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
    page_code VARCHAR(50) UNIQUE NOT NULL,          -- 页面代码，如 'product_list', 'product_form'
    page_name VARCHAR(100) NOT NULL,                -- 页面中文名
    page_name_en VARCHAR(100),                      -- 页面英文名
    path VARCHAR(200),                              -- 页面路由路径
    page_type VARCHAR(20) NOT NULL DEFAULT 'list',  -- 页面类型：list/form/detail/dashboard/statistics
    description TEXT,                               -- 页面描述
    sort_order INTEGER DEFAULT 0,                   -- 排序
    is_active BOOLEAN DEFAULT true,                 -- 是否启用
    permission_code VARCHAR(100),                   -- 关联权限代码
    layout_config JSONB DEFAULT '{}',               -- 页面布局配置（前端组件结构）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_system_pages_module ON system_pages(module_id);
CREATE INDEX IF NOT EXISTS idx_system_pages_code ON system_pages(page_code);
CREATE INDEX IF NOT EXISTS idx_system_pages_type ON system_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_system_pages_active ON system_pages(is_active);
CREATE INDEX IF NOT EXISTS idx_system_pages_permission ON system_pages(permission_code);

-- 注释
COMMENT ON TABLE system_pages IS '系统页面配置表 - 定义模块下的各个页面';
COMMENT ON COLUMN system_pages.module_id IS '所属模块ID';
COMMENT ON COLUMN system_pages.page_code IS '页面唯一代码标识';
COMMENT ON COLUMN system_pages.page_type IS '页面类型：list(列表), form(表单), detail(详情), dashboard(仪表盘), statistics(统计)';
COMMENT ON COLUMN system_pages.layout_config IS '页面布局JSON配置，用于前端动态渲染';
COMMENT ON COLUMN system_pages.permission_code IS '页面级权限控制代码';

-- ============================================================================
-- 3. 字段配置表（system_fields）
-- 说明：定义页面中的表单字段、列表列，支持校验规则和权限控制
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_fields (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES system_pages(id) ON DELETE CASCADE,
    field_code VARCHAR(100) NOT NULL,               -- 字段代码，如 'name', 'price'
    field_name VARCHAR(100) NOT NULL,               -- 字段中文名
    field_name_en VARCHAR(100),                     -- 字段英文名
    field_type VARCHAR(50) NOT NULL DEFAULT 'text', -- 字段类型
    db_column VARCHAR(100),                         -- 对应数据库列名
    is_required BOOLEAN DEFAULT false,              -- 是否必填
    is_visible BOOLEAN DEFAULT true,                -- 是否在列表/表单中可见
    is_editable BOOLEAN DEFAULT true,               -- 是否可编辑
    is_searchable BOOLEAN DEFAULT false,            -- 是否可作为搜索条件
    is_sortable BOOLEAN DEFAULT false,              -- 列表是否可排序
    is_filterable BOOLEAN DEFAULT false,            -- 是否可作为筛选条件
    default_value TEXT,                             -- 默认值
    placeholder VARCHAR(200),                       -- 输入占位提示
    help_text VARCHAR(500),                         -- 字段帮助说明
    validation_rules JSONB DEFAULT '{}',            -- 校验规则（正则、范围、长度等）
    options_config JSONB,                           -- select/radio/checkbox 等选项配置
    width INTEGER,                                  -- 列表中的列宽度（px）
    min_width INTEGER,                              -- 列表列最小宽度（px）
    group_name VARCHAR(100),                        -- 字段分组名（表单分组显示）
    permission_code VARCHAR(100),                   -- 字段级权限控制代码
    sort_order INTEGER DEFAULT 0,                   -- 排序
    is_active BOOLEAN DEFAULT true,                 -- 是否启用
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, field_code)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_system_fields_page ON system_fields(page_id);
CREATE INDEX IF NOT EXISTS idx_system_fields_code ON system_fields(field_code);
CREATE INDEX IF NOT EXISTS idx_system_fields_type ON system_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_system_fields_active ON system_fields(is_active);
CREATE INDEX IF NOT EXISTS idx_system_fields_searchable ON system_fields(is_searchable) WHERE is_searchable = true;
CREATE INDEX IF NOT EXISTS idx_system_fields_permission ON system_fields(permission_code);

-- 注释
COMMENT ON TABLE system_fields IS '系统字段配置表 - 定义页面中的字段及其属性';
COMMENT ON COLUMN system_fields.field_code IS '字段唯一代码，同一页面内不可重复';
COMMENT ON COLUMN system_fields.field_type IS '字段类型：text, number, select, date, datetime, file, image, switch, rich_text, textarea, email, phone, url, color, tag, cascader';
COMMENT ON COLUMN system_fields.db_column IS '对应数据库表的实际列名';
COMMENT ON COLUMN system_fields.validation_rules IS 'JSON格式的校验规则，如 {"pattern":"^1\\d{10}$","min":0,"max":99999,"minLength":1,"maxLength":100}';
COMMENT ON COLUMN system_fields.options_config IS 'JSON格式的选项配置，如 [{"label":"选项A","value":"a"},{"label":"选项B","value":"b"}]';
COMMENT ON COLUMN system_fields.group_name IS '字段分组名称，用于表单分组展示';
COMMENT ON COLUMN system_fields.permission_code IS '字段级权限控制，可精确到单个字段的查看/编辑权限';
COMMENT ON COLUMN system_fields.is_filterable IS '是否可作为列表筛选条件';

-- ============================================================================
-- 4. 操作按钮配置表（system_actions）
-- 说明：定义页面中的操作按钮，如新增、编辑、删除、导出等
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_actions (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES system_pages(id) ON DELETE CASCADE,
    action_code VARCHAR(100) NOT NULL,              -- 按钮代码，如 'create', 'delete'
    action_name VARCHAR(100) NOT NULL,              -- 按钮中文名
    action_name_en VARCHAR(100),                    -- 按钮英文名
    action_type VARCHAR(50) NOT NULL,               -- 按钮功能类型
    button_type VARCHAR(20) DEFAULT 'default',      -- 前端按钮样式类型
    icon VARCHAR(100),                              -- 图标标识
    position VARCHAR(20) DEFAULT 'toolbar',         -- 按钮位置
    confirm_message VARCHAR(500),                   -- 操作确认提示语
    api_path VARCHAR(200),                          -- 关联的API路径
    api_method VARCHAR(10) DEFAULT 'POST',          -- API请求方法
    permission_code VARCHAR(100),                   -- 权限代码
    show_condition JSONB,                           -- 显示条件（JSON表达式）
    action_config JSONB DEFAULT '{}',               -- 扩展配置（弹窗、表单等）
    batch_support BOOLEAN DEFAULT false,            -- 是否支持批量操作
    sort_order INTEGER DEFAULT 0,                   -- 排序
    is_active BOOLEAN DEFAULT true,                 -- 是否启用
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, action_code)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_system_actions_page ON system_actions(page_id);
CREATE INDEX IF NOT EXISTS idx_system_actions_code ON system_actions(action_code);
CREATE INDEX IF NOT EXISTS idx_system_actions_type ON system_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_system_actions_position ON system_actions(position);
CREATE INDEX IF NOT EXISTS idx_system_actions_active ON system_actions(is_active);
CREATE INDEX IF NOT EXISTS idx_system_actions_permission ON system_actions(permission_code);

-- 注释
COMMENT ON TABLE system_actions IS '系统操作按钮配置表 - 定义页面中的各类操作按钮';
COMMENT ON COLUMN system_actions.action_code IS '按钮唯一代码，同一页面内不可重复';
COMMENT ON COLUMN system_actions.action_type IS '按钮功能类型：create, edit, delete, view, export, import, batch_delete, batch_export, refresh, print, custom';
COMMENT ON COLUMN system_actions.button_type IS '前端按钮样式：primary(主按钮), danger(危险操作), warning(警告), default(默认), link(链接), text(文字)';
COMMENT ON COLUMN system_actions.position IS '按钮位置：toolbar(工具栏), row_action(行操作), batch_action(批量操作), header(页头), footer(页脚)';
COMMENT ON COLUMN system_actions.confirm_message IS '操作前确认提示，如 "确定要删除该产品吗？"';
COMMENT ON COLUMN system_actions.show_condition IS 'JSON格式的显示条件表达式，如 {"field":"status","operator":"eq","value":"active"}';
COMMENT ON COLUMN system_actions.action_config IS 'JSON格式的扩展配置，如弹窗标题、表单页面路径等';
COMMENT ON COLUMN system_actions.batch_support IS '是否支持批量选中后操作';

-- ============================================================================
-- 5. 触发器：自动更新 updated_at 字段
-- ============================================================================

-- system_modules 触发器
CREATE OR REPLACE FUNCTION update_system_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_modules_updated_at ON system_modules;
CREATE TRIGGER trg_system_modules_updated_at
    BEFORE UPDATE ON system_modules
    FOR EACH ROW EXECUTE FUNCTION update_system_modules_updated_at();

-- system_pages 触发器
CREATE OR REPLACE FUNCTION update_system_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_pages_updated_at ON system_pages;
CREATE TRIGGER trg_system_pages_updated_at
    BEFORE UPDATE ON system_pages
    FOR EACH ROW EXECUTE FUNCTION update_system_pages_updated_at();

-- system_fields 触发器
CREATE OR REPLACE FUNCTION update_system_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_fields_updated_at ON system_fields;
CREATE TRIGGER trg_system_fields_updated_at
    BEFORE UPDATE ON system_fields
    FOR EACH ROW EXECUTE FUNCTION update_system_fields_updated_at();

-- system_actions 触发器
CREATE OR REPLACE FUNCTION update_system_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_actions_updated_at ON system_actions;
CREATE TRIGGER trg_system_actions_updated_at
    BEFORE UPDATE ON system_actions
    FOR EACH ROW EXECUTE FUNCTION update_system_actions_updated_at();

-- ============================================================================
-- 6. 种子数据：产品管理模块示例
-- ============================================================================

-- 6.1 插入模块
INSERT INTO system_modules (module_code, module_name, module_name_en, icon, path, description, sort_order, permission_code) VALUES
    ('product', '产品管理', 'Product Management', 'Package', '/admin/products', '管理产品信息、分类、供应商等', 10, 'product.manage'),
    ('quote', '报价管理', 'Quote Management', 'FileText', '/admin/quotes', '管理客户报价单', 20, 'quote.manage'),
    ('customer', '客户管理', 'Customer Management', 'Users', '/admin/customers', '管理客户信息', 30, 'customer.manage'),
    ('supplier', '供应商管理', 'Supplier Management', 'Truck', '/admin/suppliers', '管理供应商信息', 40, 'supplier.manage')
ON CONFLICT (module_code) DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_name_en = EXCLUDED.module_name_en,
    icon = EXCLUDED.icon,
    path = EXCLUDED.path,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    permission_code = EXCLUDED.permission_code;

-- 6.2 插入页面（产品模块）
INSERT INTO system_pages (module_id, page_code, page_name, page_name_en, path, page_type, description, sort_order, permission_code) VALUES
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_list', '产品列表', 'Product List', '/admin/products', 'list', '查看和管理所有产品', 10, 'product.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_form', '新增/编辑产品', 'Product Form', '/admin/products/new', 'form', '新增或编辑产品信息', 20, 'product.create'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_detail', '产品详情', 'Product Detail', '/admin/products/:id', 'detail', '查看产品详细信息', 30, 'product.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_import', '产品导入', 'Product Import', '/admin/products/import', 'form', '批量导入产品数据', 40, 'product.import')
ON CONFLICT (page_code) DO UPDATE SET
    module_id = EXCLUDED.module_id,
    page_name = EXCLUDED.page_name,
    page_name_en = EXCLUDED.page_name_en,
    path = EXCLUDED.path,
    page_type = EXCLUDED.page_type,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    permission_code = EXCLUDED.permission_code;

-- 6.3 插入字段（产品列表页）
INSERT INTO system_fields (page_id, field_code, field_name, field_name_en, field_type, db_column, is_required, is_visible, is_editable, is_searchable, is_sortable, is_filterable, placeholder, width, group_name, sort_order) VALUES
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'category', '分类', 'Category', 'select', 'category', false, true, true, true, true, true, '请选择分类', 120, '基础信息', 1),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'name', '产品名称', 'Product Name', 'text', 'name', true, true, true, true, true, false, '请输入产品名称', 200, '基础信息', 2),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'model', '规格型号', 'Specification', 'text', 'model', false, true, true, true, true, false, '请输入规格型号', 150, '基础信息', 3),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'brand', '品牌', 'Brand', 'text', 'brand', false, true, true, true, true, true, '请输入品牌', 100, '基础信息', 4),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'unit', '单位', 'Unit', 'select', 'unit', false, true, true, false, false, true, '请输入单位', 80, '基础信息', 5),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'supplier', '供应商', 'Supplier', 'text', 'supplier', false, true, true, true, true, true, '请输入供应商', 150, '供应信息', 6),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'contact_person', '联系人', 'Contact Person', 'text', 'contact_person', false, true, true, false, false, false, '请输入联系人', 100, '供应信息', 7),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'contact_phone', '联系电话', 'Contact Phone', 'text', 'contact_phone', false, true, true, false, false, false, '请输入联系电话', 120, '供应信息', 8),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'cost_price', '成本价', 'Cost Price', 'number', 'cost_price', false, true, true, false, true, false, '请输入成本价', 100, '价格信息', 9),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'min_price', '最低售价', 'Min Price', 'number', 'min_price', false, true, true, false, true, false, '请输入最低售价', 100, '价格信息', 10),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'price', '指导价', 'Guide Price', 'number', 'price', true, true, true, false, true, false, '请输入指导价', 100, '价格信息', 11),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'image_url', '产品图片', 'Product Image', 'image', 'image_url', false, true, true, false, false, false, NULL, 100, '基础信息', 12),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'created_at', '创建时间', 'Created At', 'datetime', 'created_at', false, true, false, false, true, true, NULL, 160, '系统信息', 99)
ON CONFLICT (page_id, field_code) DO UPDATE SET
    field_name = EXCLUDED.field_name,
    field_name_en = EXCLUDED.field_name_en,
    field_type = EXCLUDED.field_type,
    db_column = EXCLUDED.db_column,
    is_required = EXCLUDED.is_required,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_searchable = EXCLUDED.is_searchable,
    is_sortable = EXCLUDED.is_sortable,
    is_filterable = EXCLUDED.is_filterable,
    placeholder = EXCLUDED.placeholder,
    width = EXCLUDED.width,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order;

-- 6.4 插入字段校验规则（产品表单页的字段特殊校验）
-- 通过 validation_rules 字段存储校验规则
INSERT INTO system_fields (page_id, field_code, field_name, field_name_en, field_type, db_column, is_required, is_visible, is_editable, placeholder, validation_rules, group_name, sort_order) VALUES
    ((SELECT id FROM system_pages WHERE page_code = 'product_form'),
     'name', '产品名称', 'Product Name', 'text', 'name', true, true, true, '请输入产品名称',
     '{"required": true, "minLength": 2, "maxLength": 200, "message": {"required": "产品名称不能为空", "minLength": "产品名称至少2个字符", "maxLength": "产品名称不超过200个字符"}}',
     '基础信息', 1),
    ((SELECT id FROM system_pages WHERE page_code = 'product_form'),
     'price', '指导价', 'Guide Price', 'number', 'price', true, true, true, '请输入指导价',
     '{"required": true, "min": 0, "max": 99999999.99, "precision": 2, "message": {"required": "指导价不能为空", "min": "价格不能为负数", "max": "价格超出范围"}}',
     '价格信息', 10),
    ((SELECT id FROM system_pages WHERE page_code = 'product_form'),
     'contact_phone', '联系电话', 'Contact Phone', 'text', 'contact_phone', false, true, true, '请输入联系电话',
     '{"pattern": "^(1[3-9]\\d{9})?$", "message": {"pattern": "请输入有效的手机号码"}}',
     '供应信息', 7)
ON CONFLICT (page_id, field_code) DO UPDATE SET
    field_name = EXCLUDED.field_name,
    field_name_en = EXCLUDED.field_name_en,
    field_type = EXCLUDED.field_type,
    db_column = EXCLUDED.db_column,
    is_required = EXCLUDED.is_required,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    placeholder = EXCLUDED.placeholder,
    validation_rules = EXCLUDED.validation_rules,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order;

-- 6.5 插入操作按钮（产品列表页）
INSERT INTO system_actions (page_id, action_code, action_name, action_name_en, action_type, button_type, icon, position, confirm_message, api_path, api_method, permission_code, batch_support, sort_order) VALUES
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'create', '新增产品', 'Create Product', 'create', 'primary', 'Plus', 'toolbar', NULL, '/api/products', 'POST', 'product.create', false, 1),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'import', '批量导入', 'Batch Import', 'import', 'default', 'Upload', 'toolbar', NULL, '/api/products/import', 'POST', 'product.import', false, 2),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'export', '导出', 'Export', 'export', 'default', 'Download', 'toolbar', '确定要导出产品数据吗？', '/api/products/export', 'GET', 'product.export', false, 3),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'view', '查看', 'View', 'view', 'link', 'Eye', 'row_action', NULL, '/api/products/:id', 'GET', 'product.view', false, 10),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'edit', '编辑', 'Edit', 'edit', 'link', 'Edit', 'row_action', NULL, '/api/products/:id', 'PUT', 'product.edit', false, 11),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'delete', '删除', 'Delete', 'delete', 'danger', 'Trash2', 'row_action', '确定要删除该产品吗？删除后不可恢复。', '/api/products/:id', 'DELETE', 'product.delete', false, 12),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'batch_delete', '批量删除', 'Batch Delete', 'batch_delete', 'danger', 'Trash2', 'batch_action', '确定要删除选中的产品吗？删除后不可恢复。', '/api/products/batch-delete', 'DELETE', 'product.delete', true, 20),
    ((SELECT id FROM system_pages WHERE page_code = 'product_list'),
     'refresh', '刷新', 'Refresh', 'custom', 'default', 'RefreshCw', 'toolbar', NULL, '/api/products', 'GET', 'product.view', false, 50)
ON CONFLICT (page_id, action_code) DO UPDATE SET
    action_name = EXCLUDED.action_name,
    action_name_en = EXCLUDED.action_name_en,
    action_type = EXCLUDED.action_type,
    button_type = EXCLUDED.button_type,
    icon = EXCLUDED.icon,
    position = EXCLUDED.position,
    confirm_message = EXCLUDED.confirm_message,
    api_path = EXCLUDED.api_path,
    api_method = EXCLUDED.api_method,
    permission_code = EXCLUDED.permission_code,
    batch_support = EXCLUDED.batch_support,
    sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- 完成提示
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '超级管理员全配置系统迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已创建表: system_modules, system_pages, system_fields, system_actions';
    RAISE NOTICE '已添加: 外键约束、索引、触发器、中文注释';
    RAISE NOTICE '已插入示例数据: 产品管理模块（含4个模块、4个页面、16个字段、8个按钮）';
    RAISE NOTICE '========================================';
END $$;
