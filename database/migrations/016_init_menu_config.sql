-- ============================================================================
-- 管理后台菜单配置初始化 - 迁移脚本
-- 执行时间：2026-03-22
-- 版本：v1.0.0
-- 功能：初始化管理后台全部模块与页面的配置数据
--       与 admin/layout.tsx 中的 navItems 保持一致
-- ============================================================================

-- ============================================================================
-- 1. 初始化模块配置（system_modules）
-- 说明：覆盖所有管理后台顶级菜单，含 015 已有的模块（ON CONFLICT 更新）
-- ============================================================================

INSERT INTO system_modules (module_code, module_name, module_name_en, icon, path, description, sort_order, permission_code) VALUES
    -- ── 核心功能 ──
    ('dashboard',     '仪表盘',       'Dashboard',              'LayoutDashboard', '/admin',               '管理后台总览，展示核心指标与快捷入口',         1,  'admin.dashboard'),
    ('user',          '用户管理',     'User Management',        'Users',           '/admin/users',          '管理平台用户，包括角色分配、状态控制、积分赠送',  2,  'user.manage'),
    ('enterprise',    '企业用户管理', 'Enterprise Management',  'Building2',       '/admin/enterprise',     '管理企业入驻申请、企业认证、企业账号权限',       3,  'enterprise.manage'),
    ('audit',         '内容审核',     'Content Audit',          'CheckCircle',     '/admin/audit',          '审核知识库等内容，支持通过/驳回操作',           4,  'audit.manage'),

    -- ── 业务管理 ──
    ('product',       '产品管理',     'Product Management',     'Database',        '/admin/products',       '管理产品库、分类、供应商、判重配置',             10, 'product.manage'),
    ('quote',         '报价管理',     'Quote Management',       'FileText',        '/admin/quotes',         '查看和管理所有报价单，支持发送、审核、导出',     11, 'quote.manage'),
    ('membership',    '会员管理',     'Membership Management',  'Star',            '/admin/membership',     '会员等级配置、字段权限、模块权限、配额管理',     12, 'membership.manage'),

    -- ── 积分体系 ──
    ('points',        '积分管理',     'Points System',          'Coins',           '/admin/points',         '积分规则配置、等级权限、积分流水查询',           20, 'points.manage'),
    ('points_rules',  '积分规则管理', 'Points Rules Manager',   'ScrollText',      '/admin/points-rules',   '积分获取/消费规则的创建、编辑与管理',           21, 'points.rules'),

    -- ── 数据与分析 ──
    ('stats',         '数据统计',     'Statistics',             'BarChart3',       '/admin/stats',          '多维度数据统计面板：收入、用户增长、业务趋势',   30, 'stats.view'),
    ('analytics',     '数据分析',     'Analytics',              'TrendingUp',      '/admin/analytics',      '转化漏斗、留存分析、用户行为分析、数据导出',     31, 'analytics.view'),

    -- ── 内容与运维 ──
    ('knowledge',     '知识库管理',   'Knowledge Base',         'BookOpen',        '/admin/knowledge',      '知识条目的增删改查、分类管理、审核发布',       40, 'knowledge.manage'),
    ('module',        '模块管理',     'Module Management',      'Puzzle',          '/admin/modules',        '系统功能模块的启用/禁用管理',                   41, 'module.manage'),
    ('import_log',    '导入日志',     'Import Logs',            'ClipboardList',   '/admin/import-logs',    '查看产品等数据导入的历史记录与执行详情',       42, 'import_log.view'),

    -- ── 系统配置 ──
    ('system',        '系统设置',     'System Settings',        'Settings',        '/admin/settings',       '分类配置管理：基本设置、安全设置、系统参数',     50, 'system.settings')
ON CONFLICT (module_code) DO UPDATE SET
    module_name   = EXCLUDED.module_name,
    module_name_en = EXCLUDED.module_name_en,
    icon          = EXCLUDED.icon,
    path          = EXCLUDED.path,
    description   = EXCLUDED.description,
    sort_order    = EXCLUDED.sort_order,
    permission_code = EXCLUDED.permission_code;

-- ============================================================================
-- 2. 初始化页面配置（system_pages）
-- 说明：每个模块下的子页面，与实际路由一一对应
-- ============================================================================

INSERT INTO system_pages (module_id, page_code, page_name, page_name_en, path, page_type, description, sort_order, permission_code) VALUES
    -- ──────────────────────────────────────────────────────
    -- 仪表盘
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'dashboard'),
     'dashboard_main', '仪表盘', 'Dashboard', '/admin', 'dashboard', '管理后台总览，展示核心运营指标', 1, 'admin.dashboard'),

    -- ──────────────────────────────────────────────────────
    -- 用户管理
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'user'),
     'user_list',     '用户列表',       'User List',          '/admin/users',            'list',  '查看平台用户列表，支持搜索、角色分配、启用/禁用', 1, 'user.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'user'),
     'user_detail',   '用户详情',       'User Detail',        '/admin/users/:id',        'detail','查看用户详细信息、操作记录、积分明细',           2, 'user.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'user'),
     'user_grant',    '积分赠送',       'Grant Points',       '/admin/users/:id/grant',  'form',  '向指定用户赠送积分',                               3, 'user.grant_points'),

    -- ──────────────────────────────────────────────────────
    -- 企业用户管理
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'enterprise'),
     'enterprise_list',   '企业列表',       'Enterprise List',     '/admin/enterprise',          'list',   '查看所有企业账号，管理企业状态',                  1, 'enterprise.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'enterprise'),
     'enterprise_detail', '企业详情',       'Enterprise Detail',   '/admin/enterprise/:id',      'detail', '查看企业详细信息、成员列表、认证信息',           2, 'enterprise.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'enterprise'),
     'enterprise_audit',  '企业审核',       'Enterprise Audit',    '/admin/enterprise/audit',    'list',   '审核企业入驻申请，通过或驳回',                   3, 'enterprise.audit'),

    -- ──────────────────────────────────────────────────────
    -- 内容审核
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'audit'),
     'audit_pending',  '待审核列表',     'Pending Review',     '/admin/audit',             'list',  '查看所有待审核内容，支持批量通过/驳回',           1, 'audit.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'audit'),
     'audit_detail',   '审核详情',       'Review Detail',      '/admin/audit/:id',         'detail','查看内容详情并执行审核操作',                     2, 'audit.review'),
    ((SELECT id FROM system_modules WHERE module_code = 'audit'),
     'audit_history',  '审核历史',       'Review History',     '/admin/audit/history',     'list',  '查看已审核内容的历史记录',                       3, 'audit.history'),

    -- ──────────────────────────────────────────────────────
    -- 产品管理（更新 015 已有的种子数据）
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_list',   '产品列表',       'Product List',       '/admin/products',          'list',  '查看和管理所有产品，支持搜索、筛选、排序',        1, 'product.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_form',   '新增/编辑产品',  'Product Form',       '/admin/products/new',      'form',  '新增或编辑产品信息',                             2, 'product.create'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_detail', '产品详情',       'Product Detail',     '/admin/products/:id',      'detail','查看产品详细信息',                               3, 'product.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_import', '产品导入',       'Product Import',     '/admin/products/import',   'form',  '批量导入产品数据',                               4, 'product.import'),
    ((SELECT id FROM system_modules WHERE module_code = 'product'),
     'product_duplicate_config', '判重配置', 'Duplicate Config', '/admin/products/duplicate-config', 'form', '配置产品查重字段和规则', 5, 'product.config'),

    -- ──────────────────────────────────────────────────────
    -- 报价管理
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'quote'),
     'quote_list',     '报价单列表',     'Quote List',         '/admin/quotes',            'list',  '查看所有报价单，支持搜索、筛选、发送、导出',      1, 'quote.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'quote'),
     'quote_detail',   '报价单详情',     'Quote Detail',       '/admin/quotes/:id',        'detail','查看报价单详细信息和操作记录',                   2, 'quote.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'quote'),
     'quote_terms',    '报价条款管理',   'Quote Terms',        '/admin/quotes/terms',      'form',  '管理报价单条款模板',                             3, 'quote.manage_terms'),
    ((SELECT id FROM system_modules WHERE module_code = 'quote'),
     'quote_export',   '报价导出',       'Quote Export',       '/admin/quotes/export',     'list',  '批量导出报价单数据',                             4, 'quote.export'),

    -- ──────────────────────────────────────────────────────
    -- 会员管理
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'membership'),
     'membership_levels',   '等级配置',       'Level Config',      '/admin/membership',          'form',  '会员等级的创建、编辑、权限和配额配置',           1, 'membership.levels'),
    ((SELECT id FROM system_modules WHERE module_code = 'membership'),
     'membership_field_perm', '字段权限',     'Field Permissions', '/admin/membership/fields',   'form',  '配置各等级可查看/编辑的字段权限',               2, 'membership.field_permissions'),
    ((SELECT id FROM system_modules WHERE module_code = 'membership'),
     'membership_module_perm', '模块权限',    'Module Permissions','/admin/membership/modules', 'form',  '配置各等级可访问的功能模块',                     3, 'membership.module_permissions'),
    ((SELECT id FROM system_modules WHERE module_code = 'membership'),
     'membership_stats', '等级分布',         'Level Statistics',  '/admin/membership/stats',    'statistics', '各会员等级的用户分布和增长统计',              4, 'membership.stats'),

    -- ──────────────────────────────────────────────────────
    -- 积分管理（/admin/points/*）
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'points'),
     'points_levels',  '等级权限配置',   'Level Permissions',  '/admin/points/levels',    'form',  '管理用户等级与对应权限配置',                    1, 'points.levels'),
    ((SELECT id FROM system_modules WHERE module_code = 'points'),
     'points_rules',   '积分规则配置',   'Points Rules',       '/admin/points/rules',     'form',  '配置积分获取和消费规则',                        2, 'points.rules'),
    ((SELECT id FROM system_modules WHERE module_code = 'points'),
     'points_history', '积分流水',       'Points History',     '/admin/points/history',   'list',  '查看所有用户的积分变动记录',                    3, 'points.history'),
    ((SELECT id FROM system_modules WHERE module_code = 'points'),
     'points_exchange','积分兑换',       'Points Exchange',    '/admin/points/exchange',  'list',  '管理积分兑换记录和规则',                        4, 'points.exchange'),

    -- ──────────────────────────────────────────────────────
    -- 积分规则管理（/admin/points-rules，独立菜单入口）
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'points_rules'),
     'points_rules_list',    '规则列表',   'Rules List',        '/admin/points-rules',          'list',  '查看和管理所有积分规则',                       1, 'points.rules.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'points_rules'),
     'points_rules_form',    '规则编辑',   'Rule Editor',       '/admin/points-rules/:id',      'form',  '创建或编辑积分规则',                           2, 'points.rules.edit'),
    ((SELECT id FROM system_modules WHERE module_code = 'points_rules'),
     'points_rules_history', '规则变更历史', 'Rule Change Log', '/admin/points-rules/history',   'list',  '查看积分规则的变更历史记录',                   3, 'points.rules.history'),

    -- ──────────────────────────────────────────────────────
    -- 数据统计
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'stats'),
     'stats_overview',   '统计概览',     'Statistics Overview',  '/admin/stats',              'dashboard', '核心运营指标总览面板',                      1, 'stats.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'stats'),
     'stats_revenue',    '收入统计',     'Revenue Statistics',   '/admin/stats/revenue',      'statistics','收入趋势、订单金额分布分析',               2, 'stats.revenue'),
    ((SELECT id FROM system_modules WHERE module_code = 'stats'),
     'stats_user_growth','用户增长',     'User Growth',          '/admin/stats/users',        'statistics','用户注册趋势、活跃度分析',                 3, 'stats.users'),
    ((SELECT id FROM system_modules WHERE module_code = 'stats'),
     'stats_business',   '业务统计',     'Business Statistics',  '/admin/stats/business',     'statistics','报价单、产品等业务维度统计',               4, 'stats.business'),

    -- ──────────────────────────────────────────────────────
    -- 数据分析
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'analytics'),
     'analytics_funnel',   '转化漏斗',     'Conversion Funnel',    '/admin/analytics/funnel',  'statistics', '用户转化漏斗分析',                        1, 'analytics.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'analytics'),
     'analytics_retention','留存分析',     'Retention Analysis',   '/admin/analytics/retention','statistics','用户留存率与回访分析',                       2, 'analytics.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'analytics'),
     'analytics_behavior', '用户行为',     'User Behavior',        '/admin/analytics/behavior', 'statistics','用户操作行为与路径分析',                    3, 'analytics.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'analytics'),
     'analytics_export',   '数据导出',     'Data Export',          '/admin/analytics/export',  'form',     '自定义查询并导出分析数据',                   4, 'analytics.export'),

    -- ──────────────────────────────────────────────────────
    -- 知识库管理
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'knowledge'),
     'knowledge_list',   '知识条目列表', 'Knowledge List',      '/admin/knowledge',         'list',  '知识条目的增删改查、搜索过滤',                 1, 'knowledge.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'knowledge'),
     'knowledge_form',   '知识条目编辑', 'Knowledge Editor',     '/admin/knowledge/new',     'form',  '创建或编辑知识条目',                           2, 'knowledge.create'),
    ((SELECT id FROM system_modules WHERE module_code = 'knowledge'),
     'knowledge_detail', '知识条目详情', 'Knowledge Detail',     '/admin/knowledge/:id',     'detail','查看知识条目详细信息',                         3, 'knowledge.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'knowledge'),
     'knowledge_category','分类管理',     'Category Management', '/admin/knowledge/category','form',  '知识条目分类的创建和管理',                     4, 'knowledge.category'),

    -- ──────────────────────────────────────────────────────
    -- 模块管理
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'module'),
     'module_list',   '模块列表',       'Module List',          '/admin/modules',            'list',  '系统功能模块的启用/禁用管理',                  1, 'module.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'module'),
     'module_config', '模块配置',       'Module Configuration', '/admin/modules/:code',      'form',  '配置模块的详细参数和权限',                    2, 'module.config'),

    -- ──────────────────────────────────────────────────────
    -- 导入日志
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'import_log'),
     'import_log_list',   '日志列表',   'Import Log List',      '/admin/import-logs',        'list',  '查看数据导入的历史记录，支持状态筛选',         1, 'import_log.view'),
    ((SELECT id FROM system_modules WHERE module_code = 'import_log'),
     'import_log_detail', '日志详情',   'Import Log Detail',    '/admin/import-logs/:id',    'detail','查看单次导入的详细记录和错误信息',             2, 'import_log.view'),

    -- ──────────────────────────────────────────────────────
    -- 系统设置
    -- ──────────────────────────────────────────────────────
    ((SELECT id FROM system_modules WHERE module_code = 'system'),
     'settings_basic',    '基本设置',     'Basic Settings',       '/admin/settings',           'form',  '系统基本参数配置',                             1, 'system.settings'),
    ((SELECT id FROM system_modules WHERE module_code = 'system'),
     'settings_security', '安全设置',     'Security Settings',    '/admin/settings/security',  'form',  '安全相关配置：密码策略、登录限制、API 密钥',    2, 'system.security'),
    ((SELECT id FROM system_modules WHERE module_code = 'system'),
     'settings_email',    '邮件设置',     'Email Settings',       '/admin/settings/email',     'form',  '邮件服务配置：SMTP、通知模板',                 3, 'system.email'),
    ((SELECT id FROM system_modules WHERE module_code = 'system'),
     'settings_payment',  '支付设置',     'Payment Settings',     '/admin/settings/payment',   'form',  '支付渠道配置：支付宝、微信支付参数',           4, 'system.payment')
ON CONFLICT (page_code) DO UPDATE SET
    module_id      = EXCLUDED.module_id,
    page_name      = EXCLUDED.page_name,
    page_name_en   = EXCLUDED.page_name_en,
    path           = EXCLUDED.path,
    page_type      = EXCLUDED.page_type,
    description    = EXCLUDED.description,
    sort_order     = EXCLUDED.sort_order,
    permission_code = EXCLUDED.permission_code;

-- ============================================================================
-- 3. 清理 015 中已废弃的旧模块数据
-- 说明：015 中插入了 customer/supplier 独立模块，实际未在后台使用，标记为禁用
-- ============================================================================

UPDATE system_modules
SET is_active = false,
    description = description || '（已合并至产品管理模块）'
WHERE module_code IN ('customer', 'supplier')
  AND NOT EXISTS (
      SELECT 1 FROM system_pages sp
      WHERE sp.module_id = system_modules.id
        AND sp.is_active = true
  );

-- ============================================================================
-- 4. 完成提示
-- ============================================================================

DO $$
DECLARE
    module_count INTEGER;
    page_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO module_count FROM system_modules WHERE is_active = true;
    SELECT COUNT(*) INTO page_count FROM system_pages WHERE is_active = true;

    RAISE NOTICE '========================================';
    RAISE NOTICE '管理后台菜单配置初始化完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '活跃模块数: %', module_count;
    RAISE NOTICE '活跃页面数: %', page_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '模块分布:';
    RAISE NOTICE '  核心功能: 仪表盘、用户、企业、审核';
    RAISE NOTICE '  业务管理: 产品、报价、会员';
    RAISE NOTICE '  积分体系: 积分管理、积分规则管理';
    RAISE NOTICE '  数据分析: 数据统计、数据分析';
    RAISE NOTICE '  内容运维: 知识库、模块管理、导入日志';
    RAISE NOTICE '  系统配置: 系统设置';
    RAISE NOTICE '========================================';
END $$;
