-- =============================================================================
-- 025_complete_dynamic_menu.sql
-- 补全所有缺失的动态菜单配置，实现完全数据库驱动
-- 执行时间：2026-03-25
-- =============================================================================

-- 1. 新增 knowledge_center 模块（资料中心）
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible_in_menu, route_path, config)
VALUES ('a0000001-0000-0000-0000-000000000060', 'knowledge_center', '资料中心', 'Knowledge Center', 'FolderOpen', 35, true, true, '/admin/knowledge-center', '{}')
ON CONFLICT (module_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, name_en = EXCLUDED.name_en, icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order, is_enabled = EXCLUDED.is_enabled,
    is_visible_in_menu = EXCLUDED.is_visible_in_menu, route_path = EXCLUDED.route_path,
    config = EXCLUDED.config;

-- 2. 为 knowledge_center 模块添加 7 个知识库子页面
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config) VALUES
    ('b0000001-0000-0000-0000-000000000200', 'a0000001-0000-0000-0000-000000000060', 'price_library',     '产品价格库', '/admin/knowledge-center/price-library',     'list', true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000201', 'a0000001-0000-0000-0000-000000000060', 'document_library',  '技术文档库', '/admin/knowledge-center/document-library',  'list', true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000202', 'a0000001-0000-0000-0000-000000000060', 'case_library',      '案例库',     '/admin/knowledge-center/case-library',      'list', true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000203', 'a0000001-0000-0000-0000-000000000060', 'standard_library',  '标准规范库', '/admin/knowledge-center/standard-library',  'list', true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000204', 'a0000001-0000-0000-0000-000000000060', 'drawing_library',   '图纸图片库', '/admin/knowledge-center/drawing-library',   'list', true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000205', 'a0000001-0000-0000-0000-000000000060', 'quota_library',     '定额库',     '/admin/knowledge-center/quota-library',     'list', true, '{"showSearch": true, "showPagination": true}'),
    ('b0000001-0000-0000-0000-000000000206', 'a0000001-0000-0000-0000-000000000060', 'global_search',     '全局搜索',   '/admin/knowledge-center/global-search',     'search', true, '{}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 3. 补全 system 模块缺失的"动态配置"页面
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config)
VALUES ('b0000001-0000-0000-0000-000000000162', 'a0000001-0000-0000-0000-000000000050', 'system_config', '动态配置', '/admin/system-config', 'dashboard', true, '{}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 4. 为 points 父模块添加"积分概览"页面入口
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config)
VALUES ('b0000001-0000-0000-0000-000000000070', 'a0000001-0000-0000-0000-000000000020', 'points_overview', '积分概览', '/admin/points', 'dashboard', true, '{}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 5. 为积分子模块添加独立页面
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config) VALUES
    ('b0000001-0000-0000-0000-000000000071', 'a0000001-0000-0000-0000-000000000021', 'levels_config', '等级权限配置', '/admin/points/levels',   'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000072', 'a0000001-0000-0000-0000-000000000022', 'rules_config',  '积分规则配置', '/admin/points/rules',    'form',     true, '{}'),
    ('b0000001-0000-0000-0000-000000000073', 'a0000001-0000-0000-0000-000000000023', 'points_history','积分流水',     '/admin/points/history',  'list',     true, '{"showSearch": true, "showPagination": true}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 6. 为 points_rules_mgr 模块添加页面
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config) VALUES
    ('b0000001-0000-0000-0000-000000000080', 'a0000001-0000-0000-0000-000000000024', 'points_rules_list', '积分规则管理', '/admin/points-rules', 'list', true, '{"showSearch": true, "showPagination": true}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 7. 为 module 模块添加页面
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config) VALUES
    ('b0000001-0000-0000-0000-000000000090', 'a0000001-0000-0000-0000-000000000041', 'module_list', '模块管理', '/admin/modules', 'list', true, '{}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- =============================================================================
-- 8. 知识库子页面字段配置（11列：id, page_id, field_key, field_type, label_zh,
--    is_visible, is_editable, is_required, group_name, sort_order, config）
-- =============================================================================

-- 8.1 产品价格库页面字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000016-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000200', 'title',       'text',   '标题',   true, true, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000016-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000200', 'description', 'text',   '描述',   true, true, false, '基本信息', 2, '{"width":300,"searchable":true}'),
    ('c0000016-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000200', 'fileName',    'text',   '文件名', true, true, false, '文件信息', 3, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000016-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000200', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100,"sortable":true}'),
    ('c0000016-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000200', 'fileType',    'text',   '文件类型', true, true, false, '文件信息', 5, '{"width":100,"filterable":true}'),
    ('c0000016-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000200', 'status',      'select', '状态',   true, false, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000016-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000200', 'uploaderName','text',   '上传者', true, false, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000016-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000200', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8.2 技术文档库页面字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000017-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000201', 'title',       'text',   '标题',   true, true, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000017-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000201', 'description', 'text',   '描述',   true, true, false, '基本信息', 2, '{"width":300,"searchable":true}'),
    ('c0000017-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000201', 'fileName',    'text',   '文件名', true, true, false, '文件信息', 3, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000017-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000201', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100,"sortable":true}'),
    ('c0000017-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000201', 'fileType',    'text',   '文件类型', true, true, false, '文件信息', 5, '{"width":100,"filterable":true}'),
    ('c0000017-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000201', 'status',      'select', '状态',   true, false, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000017-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000201', 'uploaderName','text',   '上传者', true, false, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000017-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000201', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8.3 案例库页面字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000018-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000202', 'title',       'text',   '标题',   true, true, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000018-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000202', 'description', 'text',   '描述',   true, true, false, '基本信息', 2, '{"width":300,"searchable":true}'),
    ('c0000018-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000202', 'fileName',    'text',   '文件名', true, true, false, '文件信息', 3, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000018-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000202', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100,"sortable":true}'),
    ('c0000018-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000202', 'fileType',    'text',   '文件类型', true, true, false, '文件信息', 5, '{"width":100,"filterable":true}'),
    ('c0000018-0000-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000202', 'status',      'select', '状态',   true, false, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000018-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000202', 'uploaderName','text',   '上传者', true, false, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000018-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000202', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8.4 标准规范库页面字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000019-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000203', 'title',       'text',   '标题',   true, true, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000019-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000203', 'description', 'text',   '描述',   true, true, false, '基本信息', 2, '{"width":300,"searchable":true}'),
    ('c0000019-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000203', 'fileName',    'text',   '文件名', true, true, false, '文件信息', 3, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000019-0000-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000203', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100,"sortable":true}'),
    ('c0000019-0000-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000203', 'fileType',    'text',   '文件类型', true, true, false, '文件信息', 5, '{"width":100,"filterable":true}'),
    ('c0000019-0000-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000203', 'status',      'select', '状态',   true, false, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000019-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000203', 'uploaderName','text',   '上传者', true, false, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000019-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000203', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8.5 图纸图片库页面字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000020-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000204', 'title',       'text',   '标题',   true, true, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000020-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000204', 'description', 'text',   '描述',   true, true, false, '基本信息', 2, '{"width":300,"searchable":true}'),
    ('c0000020-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000204', 'fileName',    'text',   '文件名', true, true, false, '文件信息', 3, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000020-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000204', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100,"sortable":true}'),
    ('c0000020-0000-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000204', 'fileType',    'text',   '文件类型', true, true, false, '文件信息', 5, '{"width":100,"filterable":true}'),
    ('c0000020-0000-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000204', 'status',      'select', '状态',   true, false, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000020-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000204', 'uploaderName','text',   '上传者', true, false, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000020-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000204', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8.6 定额库页面字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000021-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000205', 'title',       'text',   '标题',   true, true, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000021-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000205', 'description', 'text',   '描述',   true, true, false, '基本信息', 2, '{"width":300,"searchable":true}'),
    ('c0000021-0000-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000205', 'fileName',    'text',   '文件名', true, true, false, '文件信息', 3, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000021-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000205', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100,"sortable":true}'),
    ('c0000021-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000205', 'fileType',    'text',   '文件类型', true, true, false, '文件信息', 5, '{"width":100,"filterable":true}'),
    ('c0000021-0000-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000205', 'status',      'select', '状态',   true, false, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000021-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000205', 'uploaderName','text',   '上传者', true, false, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000021-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000205', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- =============================================================================
-- 9. 知识库子页面通用按钮（动态生成）
-- =============================================================================
DO $$
DECLARE
    pages_rec RECORD;
    idx INT := 16;
BEGIN
    FOR pages_rec IN
        SELECT id, page_key FROM system_pages WHERE module_id = 'a0000001-0000-0000-0000-000000000060' AND is_enabled = true AND layout_template = 'list'
    LOOP
        INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
            ('d00000' || LPAD(idx::text, 2, '0') || '-0000-0000-000000000001', pages_rec.id, 'upload', '上传',   '/api/admin/knowledge-center/' || pages_rec.page_key, 'POST',   true, 'knowledge.create', 1, '{"icon":"Upload","buttonType":"primary","position":"toolbar"}'),
            ('d00000' || LPAD(idx::text, 2, '0') || '-0000-0000-000000000002', pages_rec.id, 'view',   '查看',   '/api/admin/knowledge-center/' || pages_rec.page_key || '/:id', 'GET',    true, 'knowledge.view',   2, '{"icon":"Eye","position":"row_action"}'),
            ('d00000' || LPAD(idx::text, 2, '0') || '-0000-0000-000000000003', pages_rec.id, 'edit',   '编辑',   '/api/admin/knowledge-center/' || pages_rec.page_key || '/:id', 'PUT',    true, 'knowledge.edit',   3, '{"icon":"Edit","position":"row_action"}'),
            ('d00000' || LPAD(idx::text, 2, '0') || '-0000-0000-000000000004', pages_rec.id, 'delete', '删除',   '/api/admin/knowledge-center/' || pages_rec.page_key || '/:id', 'DELETE', true, 'knowledge.delete', 4, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除吗？"}')
        ON CONFLICT (page_id, action_key) DO UPDATE SET
            name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
            http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
            permission_required = EXCLUDED.permission_required,
            sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;
        idx := idx + 1;
    END LOOP;
END $$;

-- =============================================================================
-- 10. 积分子模块页面按钮配置
-- =============================================================================

INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000020-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000071', 'create', '新增等级', '/api/admin/levels',       'POST', true, 'points.manage', 1, '{"icon":"Plus","buttonType":"primary","position":"toolbar"}'),
    ('d0000020-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000071', 'edit',   '编辑',     '/api/admin/levels/:id',     'PUT',  true, 'points.manage', 2, '{"icon":"Edit","position":"row_action"}'),
    ('d0000020-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000071', 'delete', '删除',     '/api/admin/levels/:id',     'DELETE',true, 'points.manage', 3, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该等级吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000021-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000072', 'create', '新增规则', '/api/admin/points/rules',       'POST', true, 'points.manage', 1, '{"icon":"Plus","buttonType":"primary","position":"toolbar"}'),
    ('d0000021-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000072', 'edit',   '编辑',     '/api/admin/points/rules/:id',   'PUT',  true, 'points.manage', 2, '{"icon":"Edit","position":"row_action"}'),
    ('d0000021-0000-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000072', 'delete', '删除',     '/api/admin/points/rules/:id',   'DELETE',true, 'points.manage', 3, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该规则吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000022-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000073', 'export', '导出', '/api/admin/points/history/export', 'GET', true, 'points.view', 1, '{"icon":"Download","position":"toolbar"}'),
    ('d0000022-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000073', 'refresh','刷新', '/api/admin/points/history',       'GET', true, 'points.view', 2, '{"icon":"RefreshCw","position":"toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000023-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000080', 'create', '新增规则', '/api/admin/points-rules',       'POST', true, 'points.manage', 1, '{"icon":"Plus","buttonType":"primary","position":"toolbar"}'),
    ('d0000023-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000080', 'edit',   '编辑',     '/api/admin/points-rules/:id',   'PUT',  true, 'points.manage', 2, '{"icon":"Edit","position":"row_action"}'),
    ('d0000023-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000080', 'delete', '删除',     '/api/admin/points-rules/:id',   'DELETE',true, 'points.manage', 3, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该规则吗？"}'),
    ('d0000023-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000080', 'activate','激活',   '/api/admin/points-rules/:id/activate', 'POST', true, 'points.manage', 4, '{"icon":"Zap","position":"row_action","confirmMessage":"确定要激活该规则吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 完成验证
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
    RAISE NOTICE '动态菜单补全迁移完成！模块:% 页面:% 字段:% 按钮:%', mod_count, page_count, field_count, action_count;
END $$;
