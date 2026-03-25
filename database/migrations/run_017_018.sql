-- ============================================================================
-- 合并执行脚本: 017 (表结构) + 018 (种子数据)
-- 在 Supabase Dashboard SQL Editor 中执行此文件
-- ============================================================================

-- ============================================================================
-- PART 1: 创建 v2.0 表结构 (017_dynamic_config_system.sql)
-- ============================================================================

-- 清理旧版表
DROP TABLE IF EXISTS config_change_logs CASCADE;
DROP TABLE IF EXISTS user_field_overrides CASCADE;
DROP TABLE IF EXISTS system_actions CASCADE;
DROP TABLE IF EXISTS system_fields CASCADE;
DROP TABLE IF EXISTS system_pages CASCADE;
DROP TABLE IF EXISTS system_modules CASCADE;
DROP VIEW IF EXISTS v_config_change_history CASCADE;
DROP VIEW IF EXISTS v_page_config CASCADE;
DROP VIEW IF EXISTS v_menu_tree CASCADE;

-- 清理旧版函数
DROP FUNCTION IF EXISTS update_system_modules_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_pages_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_fields_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_actions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_dynamic_config_updated_at() CASCADE;

-- 1. system_modules
CREATE TABLE IF NOT EXISTS system_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key VARCHAR(100) UNIQUE NOT NULL,
    name_zh VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    icon VARCHAR(50),
    sort_order INT DEFAULT 0,
    parent_module_id UUID REFERENCES system_modules(id) ON DELETE SET NULL,
    is_enabled BOOLEAN DEFAULT true,
    is_visible_in_menu BOOLEAN DEFAULT true,
    route_path VARCHAR(200),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sys_mod_key ON system_modules(module_key);
CREATE INDEX IF NOT EXISTS idx_sys_mod_parent ON system_modules(parent_module_id) WHERE parent_module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sys_mod_sort ON system_modules(sort_order);

-- 2. system_pages
CREATE TABLE IF NOT EXISTS system_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
    page_key VARCHAR(100) NOT NULL,
    name_zh VARCHAR(100) NOT NULL,
    route_path VARCHAR(200),
    layout_template VARCHAR(50) DEFAULT 'default',
    is_enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(module_id, page_key)
);
CREATE INDEX IF NOT EXISTS idx_sys_page_module ON system_pages(module_id);

-- 3. system_fields
CREATE TABLE IF NOT EXISTS system_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES system_pages(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL DEFAULT 'text',
    label_zh VARCHAR(100) NOT NULL,
    is_visible BOOLEAN DEFAULT true,
    is_editable BOOLEAN DEFAULT true,
    is_required BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    group_name VARCHAR(100),
    default_value JSONB,
    validation_rules JSONB DEFAULT '{}',
    options_config JSONB,
    depends_on JSONB,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_sys_field_page ON system_fields(page_id);

-- 4. system_actions
CREATE TABLE IF NOT EXISTS system_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES system_pages(id) ON DELETE CASCADE,
    action_key VARCHAR(100) NOT NULL,
    name_zh VARCHAR(100) NOT NULL,
    api_endpoint VARCHAR(200),
    http_method VARCHAR(10) DEFAULT 'POST',
    is_visible BOOLEAN DEFAULT true,
    permission_required VARCHAR(100),
    sort_order INT DEFAULT 0,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, action_key)
);
CREATE INDEX IF NOT EXISTS idx_sys_action_page ON system_actions(page_id);

-- 5. user_field_overrides
CREATE TABLE IF NOT EXISTS user_field_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    field_id UUID NOT NULL REFERENCES system_fields(id) ON DELETE CASCADE,
    field_value JSONB,
    is_visible BOOLEAN,
    is_editable BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, field_id)
);

-- 6. config_change_logs
CREATE TABLE IF NOT EXISTS config_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    old_value JSONB,
    new_value JSONB,
    change_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ccl_target ON config_change_logs(target_type, target_id);

-- 触发器
CREATE OR REPLACE FUNCTION update_dynamic_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sys_mod_updated ON system_modules;
CREATE TRIGGER trg_sys_mod_updated BEFORE UPDATE ON system_modules FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();
DROP TRIGGER IF EXISTS trg_sys_page_updated ON system_pages;
CREATE TRIGGER trg_sys_page_updated BEFORE UPDATE ON system_pages FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();
DROP TRIGGER IF EXISTS trg_sys_field_updated ON system_fields;
CREATE TRIGGER trg_sys_field_updated BEFORE UPDATE ON system_fields FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();
DROP TRIGGER IF EXISTS trg_sys_action_updated ON system_actions;
CREATE TRIGGER trg_sys_action_updated BEFORE UPDATE ON system_actions FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();

-- 视图
CREATE OR REPLACE VIEW v_menu_tree AS
SELECT m.id, m.module_key, m.name_zh, m.name_en, m.icon, m.sort_order, m.parent_module_id,
    p.name_zh AS parent_module_name, m.is_enabled, m.is_visible_in_menu, m.route_path, m.config,
    (SELECT COUNT(*) FROM system_pages sp WHERE sp.module_id = m.id AND sp.is_enabled = true) AS enabled_page_count
FROM system_modules m LEFT JOIN system_modules p ON m.parent_module_id = p.id
WHERE m.is_enabled = true ORDER BY COALESCE(p.sort_order, 0), m.sort_order;

CREATE OR REPLACE VIEW v_page_config AS
SELECT sp.id AS page_id, sp.page_key, sp.name_zh AS page_name, sp.route_path, sp.layout_template,
    sp.is_enabled, sp.config AS page_config, sm.id AS module_id, sm.module_key, sm.name_zh AS module_name,
    sm.icon AS module_icon, sm.route_path AS module_route, sm.parent_module_id,
    (SELECT COUNT(*) FROM system_fields sf WHERE sf.page_id = sp.id AND sf.is_visible = true) AS visible_field_count,
    (SELECT COUNT(*) FROM system_actions sa WHERE sa.page_id = sp.id AND sa.is_visible = true) AS visible_action_count
FROM system_pages sp INNER JOIN system_modules sm ON sp.module_id = sm.id
WHERE sp.is_enabled = true AND sm.is_enabled = true ORDER BY sm.sort_order, sp.page_key;

CREATE OR REPLACE VIEW v_config_change_history AS
SELECT ccl.id, ccl.target_type, ccl.target_id, ccl.old_value, ccl.new_value, ccl.change_description,
    ccl.created_at, u.email AS admin_email, COALESCE(u.metadata->>'name', u.metadata->>'nickname', u.email) AS admin_name
FROM config_change_logs ccl LEFT JOIN users u ON ccl.admin_id = u.id ORDER BY ccl.created_at DESC;


-- ============================================================================
-- PART 2: 种子数据 (018_init_config_data.sql)
-- ============================================================================

-- 1. 模块配置
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible_in_menu, route_path, config) VALUES
    ('a0000001-0000-0000-0000-000000000001', 'dashboard',     '仪表盘',       'Dashboard',             'LayoutDashboard', 1,  true, true, '/admin',               '{}'),
    ('a0000001-0000-0000-0000-000000000002', 'user',          '用户管理',     'User Management',      'Users',           2,  true, true, '/admin/users',          '{}'),
    ('a0000001-0000-0000-0000-000000000003', 'enterprise',    '企业用户管理', 'Enterprise Management','Building2',       3,  true, true, '/admin/enterprise',     '{}'),
    ('a0000001-0000-0000-0000-000000000004', 'audit',         '内容审核',     'Content Audit',        'CheckCircle',     4,  true, true, '/admin/audit',          '{}'),
    ('a0000001-0000-0000-0000-000000000010', 'product',       '产品管理',     'Product Management',   'Database',        10, true, true, '/admin/products',       '{}'),
    ('a0000001-0000-0000-0000-000000000011', 'quote',         '报价管理',     'Quote Management',     'FileText',        11, true, true, '/admin/quotes',         '{}'),
    ('a0000001-0000-0000-0000-000000000012', 'membership',    '会员管理',     'Membership Management','Star',            12, true, true, '/admin/membership',     '{}'),
    ('a0000001-0000-0000-0000-000000000020', 'points',        '积分管理',     'Points System',        'Coins',           20, true, true, '/admin/points',         '{}'),
    ('a0000001-0000-0000-0000-000000000021', 'points_levels', '等级权限配置', 'Level Permissions',    'Shield',           21, true, true, '/admin/points/levels',   '{"parent_module_id": "a0000001-0000-0000-0000-000000000020"}'),
    ('a0000001-0000-0000-0000-000000000022', 'points_rules',  '积分规则配置', 'Points Rules',         'Coins',           22, true, true, '/admin/points/rules',    '{"parent_module_id": "a0000001-0000-0000-0000-000000000020"}'),
    ('a0000001-0000-0000-0000-000000000023', 'points_history','积分流水',     'Points History',       'History',         23, true, true, '/admin/points/history',  '{"parent_module_id": "a0000001-0000-0000-0000-000000000020"}'),
    ('a0000001-0000-0000-0000-000000000024', 'points_rules_mgr','积分规则管理','Points Rules Manager', 'ScrollText',      24, true, true, '/admin/points-rules',    '{}'),
    ('a0000001-0000-0000-0000-000000000030', 'stats',         '数据统计',     'Statistics',           'BarChart3',       30, true, true, '/admin/stats',          '{}'),
    ('a0000001-0000-0000-0000-000000000031', 'analytics',     '数据分析',     'Analytics',            'TrendingUp',      31, false, false, '/admin/analytics',      '{"hidden": true}'),
    ('a0000001-0000-0000-0000-000000000040', 'knowledge',     '知识库管理',   'Knowledge Base',       'BookOpen',        40, true, true, '/admin/knowledge',      '{}'),
    ('a0000001-0000-0000-0000-000000000041', 'module',        '模块管理',     'Module Management',    'Puzzle',          41, true, true, '/admin/modules',        '{}'),
    ('a0000001-0000-0000-0000-000000000042', 'import_log',    '导入日志',     'Import Logs',          'ClipboardList',   42, true, true, '/admin/import-logs',     '{}'),
    ('a0000001-0000-0000-0000-000000000050', 'system',        '系统设置',     'System Settings',      'Settings',        50, true, true, '/admin/settings',       '{}')
ON CONFLICT (module_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, name_en = EXCLUDED.name_en, icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order, is_enabled = EXCLUDED.is_enabled,
    is_visible_in_menu = EXCLUDED.is_visible_in_menu, route_path = EXCLUDED.route_path, config = EXCLUDED.config;

UPDATE system_modules SET parent_module_id = 'a0000001-0000-0000-0000-000000000020'
WHERE module_key IN ('points_levels', 'points_rules', 'points_history') AND parent_module_id IS NULL;

-- 2. 页面配置
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config) VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'dashboard_main', '仪表盘',     '/admin',                   'dashboard', true, '{}'),
    ('b0000001-0000-0000-0000-000000000010', 'a0000001-0000-0000-0000-000000000002', 'user_list',     '用户列表',   '/admin/users',             'list',     true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000011', 'a0000001-0000-0000-0000-000000000002', 'user_detail',   '用户详情',   '/admin/users/:id',         'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000012', 'a0000001-0000-0000-0000-000000000002', 'user_grant',    '积分赠送',   '/admin/users/:id/grant',  'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000020', 'a0000001-0000-0000-0000-000000000003', 'enterprise_list',   '企业列表', '/admin/enterprise',       'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000021', 'a0000001-0000-0000-0000-000000000003', 'enterprise_detail', '企业详情', '/admin/enterprise/:id',   'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000030', 'a0000001-0000-0000-0000-000000000004', 'audit_pending',  '待审核列表', '/admin/audit',            'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000031', 'a0000001-0000-0000-0000-000000000004', 'audit_detail',   '审核详情',   '/admin/audit/:id',        'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000032', 'a0000001-0000-0000-0000-000000000004', 'audit_history',  '审核历史',   '/admin/audit/history',    'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000100', 'a0000001-0000-0000-0000-000000000010', 'product_list',           '产品列表',   '/admin/products',                'list',     true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000101', 'a0000001-0000-0000-0000-000000000010', 'product_form',           '新增/编辑产品', '/admin/products/new',      'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000102', 'a0000001-0000-0000-0000-000000000010', 'product_detail',         '产品详情',   '/admin/products/:id',           'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000103', 'a0000001-0000-0000-0000-000000000010', 'product_import',         '产品导入',   '/admin/products/import',       'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000104', 'a0000001-0000-0000-0000-000000000010', 'product_duplicate_config','判重配置',  '/admin/products/duplicate-config','form', true, '{}'),
    ('b0000001-0000-0000-0000-000000000110', 'a0000001-0000-0000-0000-000000000011', 'quote_list',     '报价单列表', '/admin/quotes',            'list',     true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000111', 'a0000001-0000-0000-0000-000000000011', 'quote_detail',   '报价单详情', '/admin/quotes/:id',        'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000112', 'a0000001-0000-0000-0000-000000000011', 'quote_terms',    '报价条款管理','/admin/quotes/terms',      'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000120', 'a0000001-0000-0000-0000-000000000012', 'membership_levels',   '等级配置',     '/admin/membership',          'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000121', 'a0000001-0000-0000-0000-000000000012', 'membership_field_perm','字段权限',   '/admin/membership/fields',  'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000122', 'a0000001-0000-0000-0000-000000000012', 'membership_stats',     '等级分布',     '/admin/membership/stats',   'statistics',true, '{}'),
    ('b0000001-0000-0000-0000-000000000130', 'a0000001-0000-0000-0000-000000000030', 'stats_overview',    '统计概览',   '/admin/stats',              'dashboard', true, '{}'),
    ('b0000001-0000-0000-0000-000000000131', 'a0000001-0000-0000-0000-000000000030', 'stats_revenue',     '收入统计',   '/admin/stats/revenue',      'statistics',true, '{}'),
    ('b0000001-0000-0000-0000-000000000140', 'a0000001-0000-0000-0000-000000000040', 'knowledge_list',    '知识条目列表','/admin/knowledge',         'list',     true, '{"showSearch": true}'),
    ('b0000001-0000-0000-0000-000000000141', 'a0000001-0000-0000-0000-000000000040', 'knowledge_form',    '知识条目编辑','/admin/knowledge/new',     'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000142', 'a0000001-0000-0000-0000-000000000040', 'knowledge_category','分类管理',    '/admin/knowledge/category','form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000150', 'a0000001-0000-0000-0000-000000000042', 'import_log_list',   '日志列表',   '/admin/import-logs',        'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000151', 'a0000001-0000-0000-0000-000000000042', 'import_log_detail', '日志详情',   '/admin/import-logs/:id',    'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000160', 'a0000001-0000-0000-0000-000000000050', 'settings_basic',    '基本设置',   '/admin/settings',           'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000161', 'a0000001-0000-0000-0000-000000000050', 'settings_security', '安全设置',   '/admin/settings/security',  'form',     true, '{}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled, config = EXCLUDED.config;


-- 3. 字段配置 — 用户列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000010', 'email', 'text', '邮箱', true, true, false, '基本信息', 1, '{"width": 220, "placeholder": "用户邮箱", "sortable": true, "searchable": true, "filterable": true}'),
    ('c0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000010', 'username', 'text', '用户名', true, true, false, '基本信息', 2, '{"width": 150, "placeholder": "用户名", "sortable": true, "searchable": true, "filterable": true}'),
    ('c0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000010', 'full_name', 'text', '姓名', true, true, false, '基本信息', 3, '{"width": 120, "sortable": true, "searchable": true}'),
    ('c0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000010', 'role', 'select', '角色', true, true, false, '基本信息', 4, '{"width": 120, "optionsConfig": {"type": "static", "options": [{"label": "免费用户", "value": "free"}, {"label": "高级会员", "value": "premium"}, {"label": "VIP会员", "value": "vip"}, {"label": "企业管理员", "value": "enterprise_admin"}, {"label": "管理员", "value": "admin"}, {"label": "超级管理员", "value": "super_admin"}]}, "sortable": true, "searchable": true, "filterable": true}'),
    ('c0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000010', 'status', 'select', '状态', true, true, false, '基本信息', 5, '{"width": 100, "optionsConfig": {"type": "static", "options": [{"label": "正常", "value": "active"}, {"label": "禁用", "value": "disabled"}]}, "sortable": true, "filterable": true}'),
    ('c0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000010', 'phone', 'text', '手机号', true, true, false, '联系信息', 6, '{"width": 140, "searchable": true}'),
    ('c0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000010', 'points', 'number', '积分', true, false, false, '积分信息', 7, '{"width": 100, "sortable": true}'),
    ('c0000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000010', 'level', 'number', '等级', true, false, false, '积分信息', 8, '{"width": 80, "sortable": true, "filterable": true}'),
    ('c0000001-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000010', 'created_at', 'date', '注册时间', true, false, false, '系统信息', 9, '{"width": 170, "sortable": true, "filterable": true}'),
    ('c0000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000010', 'last_login', 'date', '最后登录', true, false, false, '系统信息', 10, '{"width": 170, "sortable": true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- 4. 字段配置 — 产品列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000002-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000100', 'category', 'select', '分类', true, true, false, '基础信息', 1, '{"width": 120, "sortable": true, "searchable": true, "filterable": true}'),
    ('c0000002-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000100', 'name', 'text', '产品名称', true, true, true, '基础信息', 2, '{"width": 200, "placeholder": "产品名称", "sortable": true, "searchable": true}'),
    ('c0000002-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000100', 'model', 'text', '规格型号', true, true, false, '基础信息', 3, '{"width": 150, "sortable": true, "searchable": true}'),
    ('c0000002-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000100', 'brand', 'text', '品牌', true, true, false, '基础信息', 4, '{"width": 100, "sortable": true, "searchable": true, "filterable": true}'),
    ('c0000002-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000100', 'unit', 'text', '单位', true, true, false, '基础信息', 5, '{"width": 80, "filterable": true}'),
    ('c0000002-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000100', 'supplier', 'text', '供应商', true, true, false, '供应信息', 6, '{"width": 150, "sortable": true, "searchable": true, "filterable": true}'),
    ('c0000002-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000100', 'contact_phone', 'text', '联系电话', true, true, false, '供应信息', 7, '{"width": 130, "searchable": true}'),
    ('c0000002-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000100', 'cost_price', 'number', '成本价', true, true, false, '价格信息', 8, '{"width": 100, "precision": 2, "sortable": true}'),
    ('c0000002-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000100', 'min_price', 'number', '最低售价', true, true, false, '价格信息', 9, '{"width": 100, "precision": 2, "sortable": true}'),
    ('c0000002-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000100', 'price', 'number', '指导价', true, true, true, '价格信息', 10, '{"width": 100, "precision": 2, "sortable": true}'),
    ('c0000002-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000100', 'image_url', 'image', '产品图片', true, true, false, '基础信息', 11, '{"width": 100}'),
    ('c0000002-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000100', 'created_at', 'date', '创建时间', true, false, false, '系统信息', 12, '{"width": 170, "sortable": true, "filterable": true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- 5. 字段配置 — 报价单列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000003-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000110', 'quote_number', 'text', '报价编号', true, false, false, '基本信息', 1, '{"width": 160, "sortable": true, "searchable": true}'),
    ('c0000003-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000110', 'status', 'select', '状态', true, false, false, '基本信息', 2, '{"width": 100, "optionsConfig": {"type": "static", "options": [{"label": "草稿", "value": "draft"}, {"label": "已发送", "value": "sent"}, {"label": "已审批", "value": "approved"}, {"label": "已驳回", "value": "rejected"}]}, "sortable": true, "filterable": true}'),
    ('c0000003-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000110', 'total_amount', 'number', '总金额', true, false, false, '金额信息', 3, '{"width": 120, "precision": 2, "sortable": true}'),
    ('c0000003-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000110', 'customer_name', 'text', '客户名称', true, false, false, '客户信息', 4, '{"width": 150, "searchable": true, "filterable": true}'),
    ('c0000003-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000110', 'version', 'number', '版本', true, false, false, '系统信息', 5, '{"width": 80}'),
    ('c0000003-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000110', 'created_at', 'date', '创建时间', true, false, false, '系统信息', 6, '{"width": 170, "sortable": true, "filterable": true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- 6. 字段配置 — 产品表单页（含校验规则）
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, depends_on) VALUES
    ('c0000004-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000101', 'name',          'text',   '产品名称', true, true, true,  '基础信息', 1,  '{"required": true, "minLength": 2, "maxLength": 200, "messages": {"required": "产品名称不能为空", "minLength": "至少2个字符"}}', null),
    ('c0000004-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000101', 'category',      'select', '分类',     true, true, false, '基础信息', 2,  '{}', null),
    ('c0000004-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000101', 'model',         'text',   '规格型号', true, true, false, '基础信息', 3,  '{}', null),
    ('c0000004-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000101', 'brand',         'text',   '品牌',     true, true, false, '基础信息', 4,  '{}', null),
    ('c0000004-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000101', 'unit',          'text',   '单位',     true, true, false, '基础信息', 5,  '{}', null),
    ('c0000004-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000101', 'supplier',      'text',   '供应商',   true, true, false, '供应信息', 6,  '{}', null),
    ('c0000004-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000101', 'contact_phone', 'text',   '联系电话', true, true, false, '供应信息', 7,  '{"pattern": "^(1[3-9]\\\\d{9})?$", "messages": {"pattern": "请输入有效手机号"}}', null),
    ('c0000004-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000101', 'cost_price',    'number', '成本价',   true, true, false, '价格信息', 8,  '{"min": 0, "max": 99999999.99, "precision": 2, "messages": {"min": "价格不能为负数"}}', null),
    ('c0000004-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000101', 'min_price',     'number', '最低售价', true, true, false, '价格信息', 9,  '{"min": 0, "precision": 2}', null),
    ('c0000004-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000101', 'price',         'number', '指导价',   true, true, true,  '价格信息', 10, '{"required": true, "min": 0, "max": 99999999.99, "precision": 2, "messages": {"required": "指导价不能为空"}}', null),
    ('c0000004-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000101', 'parameter_description', 'textarea', '参数描述', true, true, false, '详细描述', 11, '{"maxLength": 2000}', null),
    ('c0000004-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000101', 'image_url',     'image',  '产品图片', true, true, false, '基础信息', 12, '{}', null)
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    validation_rules = EXCLUDED.validation_rules,
    depends_on = EXCLUDED.depends_on;


-- 7. 操作按钮 — 用户列表页
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000010', 'create', '新增用户', '/api/admin/users', 'POST', true, 'user.create', 1, '{"icon": "Plus", "buttonType": "primary", "position": "toolbar"}'),
    ('d0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000010', 'edit', '编辑', '/api/admin/users/:id', 'PUT', true, 'user.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
    ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000010', 'grant_points', '赠送积分', '/api/admin/users/:id/grant', 'POST', true, 'user.grant_points', 3, '{"icon": "Gift", "position": "row_action"}'),
    ('d0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000010', 'toggle_status', '启用/禁用', '/api/admin/users/:id', 'PUT', true, 'user.edit', 4, '{"icon": "Power", "position": "row_action", "confirmMessage": "确定要更改该用户状态吗？"}'),
    ('d0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000010', 'delete', '删除', '/api/admin/users/:id', 'DELETE', true, 'user.delete', 5, '{"icon": "Trash2", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定要删除该用户吗？"}'),
    ('d0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000010', 'export', '导出', '/api/admin/users/export', 'GET', true, 'user.export', 6, '{"icon": "Download", "position": "toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint, http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible, permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8. 操作按钮 — 产品列表页
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000002-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000100', 'create', '新增产品', '/api/admin/products', 'POST', true, 'product.create', 1, '{"icon": "Plus", "buttonType": "primary", "position": "toolbar"}'),
    ('d0000002-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000100', 'import', '批量导入', '/api/admin/products/import', 'POST', true, 'product.import', 2, '{"icon": "Upload", "position": "toolbar"}'),
    ('d0000002-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000100', 'export', '导出', '/api/admin/products/export', 'GET', true, 'product.export', 3, '{"icon": "Download", "position": "toolbar"}'),
    ('d0000002-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000100', 'view', '查看', '/api/admin/products/:id', 'GET', true, 'product.view', 4, '{"icon": "Eye", "position": "row_action"}'),
    ('d0000002-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000100', 'edit', '编辑', '/api/admin/products/:id', 'PUT', true, 'product.edit', 5, '{"icon": "Edit", "position": "row_action"}'),
    ('d0000002-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000100', 'delete', '删除', '/api/admin/products/:id', 'DELETE', true, 'product.delete', 6, '{"icon": "Trash2", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定要删除该产品吗？"}'),
    ('d0000002-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000100', 'batch_delete', '批量删除', '/api/admin/products/batch-delete', 'DELETE', true, 'product.delete', 7, '{"icon": "Trash2", "buttonType": "danger", "position": "batch_action", "confirmMessage": "确定要删除选中的产品吗？", "batchSupport": true}'),
    ('d0000002-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000100', 'refresh', '刷新', '/api/admin/products', 'GET', true, 'product.view', 8, '{"icon": "RefreshCw", "position": "toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint, http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible, permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 9. 操作按钮 — 报价单列表页
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000003-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000110', 'view', '查看', '/api/admin/quotes/:id', 'GET', true, 'quote.view', 1, '{"icon": "Eye", "position": "row_action"}'),
    ('d0000003-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000110', 'edit', '编辑', '/api/admin/quotes/:id', 'PUT', true, 'quote.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
    ('d0000003-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000110', 'delete', '删除', '/api/admin/quotes/:id', 'DELETE', true, 'quote.delete', 3, '{"icon": "Trash2", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定要删除该报价单吗？"}'),
    ('d0000003-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000110', 'export', '导出', '/api/admin/quotes/export', 'GET', true, 'quote.export', 4, '{"icon": "Download", "position": "toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint, http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible, permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 10. 操作按钮 — 内容审核页
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000004-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000030', 'approve', '通过', '/api/admin/audit/:id/approve', 'POST', true, 'audit.review', 1, '{"icon": "Check", "buttonType": "primary", "position": "row_action", "confirmMessage": "确定通过该审核内容？"}'),
    ('d0000004-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000030', 'reject', '驳回', '/api/admin/audit/:id/reject', 'POST', true, 'audit.review', 2, '{"icon": "X", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定驳回该审核内容？"}'),
    ('d0000004-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000030', 'batch_approve', '批量通过', '/api/admin/audit/batch-approve', 'POST', true, 'audit.review', 3, '{"icon": "CheckCheck", "buttonType": "primary", "position": "batch_action", "batchSupport": true}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint, http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible, permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 11. 变更日志种子记录
INSERT INTO config_change_logs (admin_id, target_type, target_id, change_description) VALUES
    ('00000000-0000-0000-0000-000000000000', 'module', 'a0000001-0000-0000-0000-000000000001', '系统初始化：创建管理后台菜单配置')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    mod_count INTEGER;
    page_count INTEGER;
    field_count INTEGER;
    action_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO mod_count FROM system_modules WHERE is_enabled = true;
    SELECT COUNT(*) INTO page_count FROM system_pages WHERE is_enabled = true;
    SELECT COUNT(*) INTO field_count FROM system_fields WHERE is_visible = true;
    SELECT COUNT(*) INTO action_count FROM system_actions WHERE is_visible = true;
    RAISE NOTICE '========================================';
    RAISE NOTICE '动态配置系统初始化完成！';
    RAISE NOTICE '  模块: %  页面: %  字段: %  按钮: %', mod_count, page_count, field_count, action_count;
    RAISE NOTICE '========================================';
END $$;
