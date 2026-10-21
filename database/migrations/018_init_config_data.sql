-- ============================================================================
-- 动态配置系统初始化数据
-- 执行时间：2026-03-22
-- 功能：为 system_modules / system_pages / system_fields / system_actions
--       插入完整的管理后台菜单配置数据
-- ============================================================================

-- ============================================================================
-- 1. 模块配置（system_modules）
-- 与 admin/layout.tsx 中的 navItems 对齐
-- ============================================================================

INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible_in_menu, route_path, config) VALUES
    -- 核心功能
    ('a0000001-0000-0000-0000-000000000001', 'dashboard',     '仪表盘',       'Dashboard',             'LayoutDashboard', 1,  true, true, '/admin',               '{}'),
    ('a0000001-0000-0000-0000-000000000002', 'user',          '用户管理',     'User Management',      'Users',           2,  true, true, '/admin/users',          '{}'),
    ('a0000001-0000-0000-0000-000000000003', 'enterprise',    '企业用户管理', 'Enterprise Management','Building2',       3,  true, true, '/admin/enterprise',     '{}'),
    ('a0000001-0000-0000-0000-000000000004', 'audit',         '内容审核',     'Content Audit',        'CheckCircle',     4,  true, true, '/admin/audit',          '{}'),
    -- 业务管理
    ('a0000001-0000-0000-0000-000000000010', 'product',       '产品管理',     'Product Management',   'Database',        10, true, true, '/admin/products',       '{}'),
    ('a0000001-0000-0000-0000-000000000011', 'quote',         '报价管理',     'Quote Management',     'FileText',        11, true, true, '/admin/quotes',         '{}'),
    ('a0000001-0000-0000-0000-000000000012', 'membership',    '会员管理',     'Membership Management','Star',            12, true, true, '/admin/membership',     '{}'),
    -- 积分体系（使用 parent_module_id 实现二级菜单）
    ('a0000001-0000-0000-0000-000000000020', 'points',        '积分管理',     'Points System',        'Coins',           20, true, true, '/admin/points',         '{}'),
    ('a0000001-0000-0000-0000-000000000021', 'points_levels', '等级权限配置', 'Level Permissions',    'Shield',           21, true, true, '/admin/points/levels',   '{"parent_module_id": "a0000001-0000-0000-0000-000000000020"}'),
    ('a0000001-0000-0000-0000-000000000022', 'points_rules',  '积分规则配置', 'Points Rules',         'Coins',           22, true, true, '/admin/points/rules',    '{"parent_module_id": "a0000001-0000-0000-0000-000000000020"}'),
    ('a0000001-0000-0000-0000-000000000023', 'points_history','积分流水',     'Points History',       'History',         23, true, true, '/admin/points/history',  '{"parent_module_id": "a0000001-0000-0000-0000-000000000020"}'),
    ('a0000001-0000-0000-0000-000000000024', 'points_rules_mgr','积分规则管理','Points Rules Manager', 'ScrollText',      24, true, true, '/admin/points-rules',    '{}'),
    -- 数据与分析
    ('a0000001-0000-0000-0000-000000000030', 'stats',         '数据统计',     'Statistics',           'BarChart3',       30, true, true, '/admin/stats',          '{}'),
    ('a0000001-0000-0000-0000-000000000031', 'analytics',     '数据分析',     'Analytics',            'TrendingUp',      31, false, false, '/admin/analytics',      '{"hidden": true}'),
    -- 内容与运维
    ('a0000001-0000-0000-0000-000000000040', 'knowledge',     '知识库管理',   'Knowledge Base',       'BookOpen',        40, true, true, '/admin/knowledge',      '{}'),
    ('a0000001-0000-0000-0000-000000000041', 'module',        '模块管理',     'Module Management',    'Puzzle',          41, true, true, '/admin/modules',        '{}'),
    ('a0000001-0000-0000-0000-000000000042', 'import_log',    '导入日志',     'Import Logs',          'ClipboardList',   42, true, true, '/admin/import-logs',     '{}'),
    -- 系统配置
    ('a0000001-0000-0000-0000-000000000050', 'system',        '系统设置',     'System Settings',      'Settings',        50, true, true, '/admin/settings',       '{}')
ON CONFLICT (module_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    is_visible_in_menu = EXCLUDED.is_visible_in_menu,
    route_path = EXCLUDED.route_path,
    config = EXCLUDED.config;

-- 设置积分子模块的 parent_module_id
UPDATE system_modules SET parent_module_id = 'a0000001-0000-0000-0000-000000000020'
WHERE module_key IN ('points_levels', 'points_rules', 'points_history')
  AND parent_module_id IS NULL;

-- ============================================================================
-- 2. 页面配置（system_pages）
-- ============================================================================

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config) VALUES
    -- ── 仪表盘 ──
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'dashboard_main', '仪表盘',     '/admin',                   'dashboard', true, '{}'),

    -- ── 用户管理 ──
    ('b0000001-0000-0000-0000-000000000010', 'a0000001-0000-0000-0000-000000000002', 'user_list',     '用户列表',   '/admin/users',             'list',     true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000011', 'a0000001-0000-0000-0000-000000000002', 'user_detail',   '用户详情',   '/admin/users/:id',         'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000012', 'a0000001-0000-0000-0000-000000000002', 'user_grant',    '积分赠送',   '/admin/users/:id/grant',  'form',     true, '{}'),

    -- ── 企业用户管理 ──
    ('b0000001-0000-0000-0000-000000000020', 'a0000001-0000-0000-0000-000000000003', 'enterprise_list',   '企业列表', '/admin/enterprise',       'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000021', 'a0000001-0000-0000-0000-000000000003', 'enterprise_detail', '企业详情', '/admin/enterprise/:id',   'detail',   true, '{}'),

    -- ── 内容审核 ──
    ('b0000001-0000-0000-0000-000000000030', 'a0000001-0000-0000-0000-000000000004', 'audit_pending',  '待审核列表', '/admin/audit',            'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000031', 'a0000001-0000-0000-0000-000000000004', 'audit_detail',   '审核详情',   '/admin/audit/:id',        'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000032', 'a0000001-0000-0000-0000-000000000004', 'audit_history',  '审核历史',   '/admin/audit/history',    'list',     true, '{}'),

    -- ── 产品管理 ──
    ('b0000001-0000-0000-0000-000000000100', 'a0000001-0000-0000-0000-000000000010', 'product_list',           '产品列表',   '/admin/products',                'list',     true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000101', 'a0000001-0000-0000-0000-000000000010', 'product_form',           '新增/编辑产品', '/admin/products/new',      'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000102', 'a0000001-0000-0000-0000-000000000010', 'product_detail',         '产品详情',   '/admin/products/:id',           'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000103', 'a0000001-0000-0000-0000-000000000010', 'product_import',         '产品导入',   '/admin/products/import',       'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000104', 'a0000001-0000-0000-0000-000000000010', 'product_duplicate_config','判重配置',  '/admin/products/duplicate-config','form', true, '{}'),

    -- ── 报价管理 ──
    ('b0000001-0000-0000-0000-000000000110', 'a0000001-0000-0000-0000-000000000011', 'quote_list',     '报价单列表', '/admin/quotes',            'list',     true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000111', 'a0000001-0000-0000-0000-000000000011', 'quote_detail',   '报价单详情', '/admin/quotes/:id',        'detail',   true, '{}'),
    ('b0000001-0000-0000-0000-000000000112', 'a0000001-0000-0000-0000-000000000011', 'quote_terms',    '报价条款管理','/admin/quotes/terms',      'form',     true, '{}'),

    -- ── 会员管理 ──
    ('b0000001-0000-0000-0000-000000000120', 'a0000001-0000-0000-0000-000000000012', 'membership_levels',   '等级配置',     '/admin/membership',          'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000121', 'a0000001-0000-0000-0000-000000000012', 'membership_field_perm','字段权限',   '/admin/membership/fields',  'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000122', 'a0000001-0000-0000-0000-000000000012', 'membership_stats',     '等级分布',     '/admin/membership/stats',   'statistics',true, '{}'),

    -- ── 数据统计 ──
    ('b0000001-0000-0000-0000-000000000130', 'a0000001-0000-0000-0000-000000000030', 'stats_overview',    '统计概览',   '/admin/stats',              'dashboard', true, '{}'),
    ('b0000001-0000-0000-0000-000000000131', 'a0000001-0000-0000-0000-000000000030', 'stats_revenue',     '收入统计',   '/admin/stats/revenue',      'statistics',true, '{}'),

    -- ── 知识库管理 ──
    ('b0000001-0000-0000-0000-000000000140', 'a0000001-0000-0000-0000-000000000040', 'knowledge_list',    '知识条目列表','/admin/knowledge',         'list',     true, '{"showSearch": true}'),
    ('b0000001-0000-0000-0000-000000000141', 'a0000001-0000-0000-0000-000000000040', 'knowledge_form',    '知识条目编辑','/admin/knowledge/new',     'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000142', 'a0000001-0000-0000-0000-000000000040', 'knowledge_category','分类管理',    '/admin/knowledge/category','form',     true, '{}'),

    -- ── 导入日志 ──
    ('b0000001-0000-0000-0000-000000000150', 'a0000001-0000-0000-0000-000000000042', 'import_log_list',   '日志列表',   '/admin/import-logs',        'list',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000151', 'a0000001-0000-0000-0000-000000000042', 'import_log_detail', '日志详情',   '/admin/import-logs/:id',    'detail',   true, '{}'),

    -- ── 系统设置 ──
    ('b0000001-0000-0000-0000-000000000160', 'a0000001-0000-0000-0000-000000000050', 'settings_basic',    '基本设置',   '/admin/settings',           'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000161', 'a0000001-0000-0000-0000-000000000050', 'settings_security', '安全设置',   '/admin/settings/security',  'form',     true, '{}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template,
    is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- ============================================================================
-- 3. 字段配置（system_fields）— 用户列表页
-- ============================================================================

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, is_sortable, is_searchable, is_filterable, group_name, sort_order, config) VALUES
    ('c0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000010', 'email',    'text',   '邮箱',       true, true, false, true,  true,  true,  '基本信息', 1, '{"width": 220, "placeholder": "用户邮箱"}'),
    ('c0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000010', 'username', 'text',   '用户名',     true, true, false, true,  true,  true,  '基本信息', 2, '{"width": 150, "placeholder": "用户名"}'),
    ('c0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000010', 'full_name','text',   '姓名',       true, true, false, true,  true,  false, '基本信息', 3, '{"width": 120}'),
    ('c0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000010', 'role',     'select', '角色',       true, true, false, true,  true,  true,  '基本信息', 4, '{"width": 120, "optionsConfig": {"type": "static", "options": [{"label": "免费用户", "value": "free"}, {"label": "高级会员", "value": "premium"}, {"label": "VIP会员", "value": "vip"}, {"label": "企业管理员", "value": "enterprise_admin"}, {"label": "管理员", "value": "admin"}, {"label": "超级管理员", "value": "super_admin"}]}}'),
    ('c0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000010', 'status',   'select', '状态',       true, true, false, true,  false, true,  '基本信息', 5, '{"width": 100, "optionsConfig": {"type": "static", "options": [{"label": "正常", "value": "active"}, {"label": "禁用", "value": "disabled"}]}}'),
    ('c0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000010', 'phone',    'text',   '手机号',     true, true, false, false, true,  false, '联系信息', 6, '{"width": 140}'),
    ('c0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000010', 'points',   'number', '积分',       true, false, false, true,  false, false, '积分信息', 7, '{"width": 100}'),
    ('c0000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000010', 'level',    'number', '等级',       true, false, false, true,  false, true,  '积分信息', 8, '{"width": 80}'),
    ('c0000001-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000010', 'created_at','date',  '注册时间',   true, false, false, true,  false, true,  '系统信息', 9, '{"width": 170}'),
    ('c0000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000010', 'last_login','date',  '最后登录',   true, false, false, true,  false, false, '系统信息', 10, '{"width": 170}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required,
    is_sortable = EXCLUDED.is_sortable,
    is_searchable = EXCLUDED.is_searchable,
    is_filterable = EXCLUDED.is_filterable,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- ============================================================================
-- 4. 字段配置 — 产品列表页
-- ============================================================================

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, is_sortable, is_searchable, is_filterable, group_name, sort_order, config) VALUES
    ('c0000002-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000100', 'category',     'select', '分类',     true, true, false, true,  true,  true,  '基础信息', 1,  '{"width": 120}'),
    ('c0000002-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000100', 'name',         'text',   '产品名称', true, true, true,  true,  true,  false, '基础信息', 2,  '{"width": 200, "placeholder": "产品名称"}'),
    ('c0000002-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000100', 'model',        'text',   '规格型号', true, true, false, true,  true,  false, '基础信息', 3,  '{"width": 150}'),
    ('c0000002-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000100', 'brand',        'text',   '品牌',     true, true, false, true,  true,  true,  '基础信息', 4,  '{"width": 100}'),
    ('c0000002-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000100', 'unit',         'text',   '单位',     true, true, false, false, false, true,  '基础信息', 5,  '{"width": 80}'),
    ('c0000002-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000100', 'supplier',     'text',   '供应商',   true, true, false, true,  true,  true,  '供应信息', 6,  '{"width": 150}'),
    ('c0000002-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000100', 'contact_phone','text',   '联系电话', true, true, false, false, true,  false, '供应信息', 7,  '{"width": 130}'),
    ('c0000002-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000100', 'cost_price',   'number', '成本价',   true, true, false, true,  false, false, '价格信息', 8,  '{"width": 100, "precision": 2}'),
    ('c0000002-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000100', 'min_price',    'number', '最低售价', true, true, false, true,  false, false, '价格信息', 9,  '{"width": 100, "precision": 2}'),
    ('c0000002-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000100', 'price',        'number', '指导价',   true, true, true,  true,  false, false, '价格信息', 10, '{"width": 100, "precision": 2}'),
    ('c0000002-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000100', 'image_url',    'image',  '产品图片', true, true, false, false, false, false, '基础信息', 11, '{"width": 100}'),
    ('c0000002-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000100', 'created_at',   'date',   '创建时间', true, false, false, true,  false, true,  '系统信息', 12, '{"width": 170}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required,
    is_sortable = EXCLUDED.is_sortable,
    is_searchable = EXCLUDED.is_searchable,
    is_filterable = EXCLUDED.is_filterable,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- ============================================================================
-- 5. 字段配置 — 报价单列表页
-- ============================================================================

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, is_sortable, is_searchable, is_filterable, group_name, sort_order, config) VALUES
    ('c0000003-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000110', 'quote_number', 'text',   '报价编号', true, false, false, true,  true,  false, '基本信息', 1,  '{"width": 160}'),
    ('c0000003-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000110', 'status',      'select', '状态',     true, false, false, true,  false, true,  '基本信息', 2,  '{"width": 100, "optionsConfig": {"type": "static", "options": [{"label": "草稿", "value": "draft"}, {"label": "已发送", "value": "sent"}, {"label": "已审批", "value": "approved"}, {"label": "已驳回", "value": "rejected"}]}}'),
    ('c0000003-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000110', 'total_amount','number', '总金额',   true, false, false, true,  false, false, '金额信息', 3,  '{"width": 120, "precision": 2}'),
    ('c0000003-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000110', 'customer_name','text',   '客户名称', true, false, false, false, true,  true,  '客户信息', 4,  '{"width": 150}'),
    ('c0000003-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000110', 'version',     'number', '版本',     true, false, false, false, false, false, '系统信息', 5,  '{"width": 80}'),
    ('c0000003-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000110', 'created_at',  'date',   '创建时间', true, false, false, true,  false, true,  '系统信息', 6,  '{"width": 170}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type,
    label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable,
    is_sortable = EXCLUDED.is_sortable,
    is_searchable = EXCLUDED.is_searchable,
    is_filterable = EXCLUDED.is_filterable,
    group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- ============================================================================
-- 6. 字段配置 — 产品表单页（含校验规则）
-- ============================================================================

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

-- ============================================================================
-- 7. 操作按钮配置（system_actions）
-- ============================================================================

-- 用户列表页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000010', 'create',       '新增用户',   '/api/admin/users',             'POST',   true, 'user.create', 1,  '{"icon": "Plus", "buttonType": "primary", "position": "toolbar"}'),
    ('d0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000010', 'edit',         '编辑',       '/api/admin/users/:id',          'PUT',    true, 'user.edit',   2,  '{"icon": "Edit", "position": "row_action"}'),
    ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000010', 'grant_points', '赠送积分',   '/api/admin/users/:id/grant',   'POST',   true, 'user.grant_points', 3,  '{"icon": "Gift", "position": "row_action"}'),
    ('d0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000010', 'toggle_status','启用/禁用',  '/api/admin/users/:id',          'PUT',    true, 'user.edit',   4,  '{"icon": "Power", "position": "row_action", "confirmMessage": "确定要更改该用户状态吗？"}'),
    ('d0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000010', 'delete',       '删除',       '/api/admin/users/:id',          'DELETE', true, 'user.delete', 5,  '{"icon": "Trash2", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定要删除该用户吗？"}'),
    ('d0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000010', 'export',       '导出',       '/api/admin/users/export',       'GET',    true, 'user.export', 6,  '{"icon": "Download", "position": "toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- 产品列表页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000002-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000100', 'create',        '新增产品',   '/api/admin/products',          'POST',   true, 'product.create', 1, '{"icon": "Plus", "buttonType": "primary", "position": "toolbar"}'),
    ('d0000002-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000100', 'import',        '批量导入',   '/api/admin/products/import',   'POST',   true, 'product.import', 2, '{"icon": "Upload", "position": "toolbar"}'),
    ('d0000002-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000100', 'export',        '导出',       '/api/admin/products/export',   'GET',    true, 'product.export', 3, '{"icon": "Download", "position": "toolbar", "confirmMessage": "确定要导出产品数据吗？"}'),
    ('d0000002-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000100', 'view',          '查看',       '/api/admin/products/:id',      'GET',    true, 'product.view',   4, '{"icon": "Eye", "position": "row_action"}'),
    ('d0000002-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000100', 'edit',          '编辑',       '/api/admin/products/:id',      'PUT',    true, 'product.edit',   5, '{"icon": "Edit", "position": "row_action"}'),
    ('d0000002-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000100', 'delete',        '删除',       '/api/admin/products/:id',      'DELETE', true, 'product.delete', 6, '{"icon": "Trash2", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定要删除该产品吗？删除后不可恢复。"}'),
    ('d0000002-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000100', 'batch_delete', '批量删除',   '/api/admin/products/batch-delete','DELETE',true, 'product.delete', 7, '{"icon": "Trash2", "buttonType": "danger", "position": "batch_action", "confirmMessage": "确定要删除选中的产品吗？", "batchSupport": true}'),
    ('d0000002-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000100', 'refresh',       '刷新',       '/api/admin/products',          'GET',    true, 'product.view',   8, '{"icon": "RefreshCw", "position": "toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- 报价单列表页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000003-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000110', 'view',          '查看',   '/api/admin/quotes/:id',     'GET',    true, 'quote.view',   1, '{"icon": "Eye", "position": "row_action"}'),
    ('d0000003-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000110', 'edit',          '编辑',   '/api/admin/quotes/:id',     'PUT',    true, 'quote.edit',   2, '{"icon": "Edit", "position": "row_action"}'),
    ('d0000003-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000110', 'delete',        '删除',   '/api/admin/quotes/:id',     'DELETE', true, 'quote.delete', 3, '{"icon": "Trash2", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定要删除该报价单吗？"}'),
    ('d0000003-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000110', 'export',        '导出',   '/api/admin/quotes/export','GET',    true, 'quote.export', 4, '{"icon": "Download", "position": "toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- 内容审核页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000004-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000030', 'approve',  '通过',   '/api/admin/audit/:id/approve',  'POST', true, 'audit.review', 1, '{"icon": "Check", "buttonType": "primary", "position": "row_action", "confirmMessage": "确定通过该审核内容？"}'),
    ('d0000004-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000030', 'reject',   '驳回',   '/api/admin/audit/:id/reject',   'POST', true, 'audit.review', 2, '{"icon": "X", "buttonType": "danger", "position": "row_action", "confirmMessage": "确定驳回该审核内容？"}'),
    ('d0000004-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000030', 'batch_approve', '批量通过', '/api/admin/audit/batch-approve','POST', true, 'audit.review', 3, '{"icon": "CheckCheck", "buttonType": "primary", "position": "batch_action", "batchSupport": true}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- ============================================================================
-- 8. 变更日志种子记录
-- ============================================================================

INSERT INTO config_change_logs (admin_id, target_type, target_id, change_description) VALUES
    ('00000000-0000-0000-0000-000000000000', 'module', 'a0000001-0000-0000-0000-000000000001', '系统初始化：创建管理后台菜单配置')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 完成提示
-- ============================================================================

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
    RAISE NOTICE '动态配置系统数据初始化完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  模块: %  （含二级菜单）', mod_count;
    RAISE NOTICE '  页面: %', page_count;
    RAISE NOTICE '  字段: %', field_count;
    RAISE NOTICE '  按钮: %', action_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  已配置页面字段:';
    RAISE NOTICE '    - 用户列表: 10个字段, 6个按钮';
    RAISE NOTICE '    - 产品列表: 12个字段, 8个按钮';
    RAISE NOTICE '    - 产品表单: 12个字段（含校验规则）';
    RAISE NOTICE '    - 报价单列表: 6个字段, 4个按钮';
    RAISE NOTICE '    - 内容审核: 4个按钮';
    RAISE NOTICE '========================================';
END $$;
