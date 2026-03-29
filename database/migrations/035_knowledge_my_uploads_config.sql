-- =============================================================================
-- 035_knowledge_my_uploads_config.sql
-- 资料中心新增"我的上传"页面配置 + 审核管理页面配置
-- 执行时间：2026-03-29
-- =============================================================================

-- 1. 为 knowledge_center 模块新增"我的上传"页面
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config)
VALUES ('b0000001-0000-0000-0000-000000000207', 'a0000001-0000-0000-0000-000000000060', 'my_uploads', '我的上传', '/admin/knowledge-center/my-uploads', 'list', true, '{"showSearch": true, "showPagination": true, "showStatusFilter": true}')
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
    layout_template = EXCLUDED.layout_template, is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 2. 为"我的上传"页面添加字段配置
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000035-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000207', 'title',       'text',   '标题',   true, false, false, '基本信息', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000035-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000207', 'description', 'text',   '描述',   true, false, false, '基本信息', 2, '{"width":200,"searchable":true}'),
    ('c0000035-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000207', 'fileName',    'text',   '文件名', true, false, false, '文件信息', 3, '{"width":150}'),
    ('c0000035-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000207', 'fileSize',    'text',   '文件大小', true, false, false, '文件信息', 4, '{"width":100}'),
    ('c0000035-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000207', 'status',      'select', '审核状态', true, false, false, '基本信息', 5, '{"width":100,"sortable":true,"options":["pending","approved","rejected"]}'),
    ('c0000035-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000207', 'rejectReason','text',   '拒绝原因', true, false, false, '审核信息', 6, '{"width":200,"searchable":true}'),
    ('c0000035-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000207', 'createdAt',   'date',   '上传时间', true, false, false, '系统信息', 7, '{"width":130,"sortable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 3. 为"我的上传"页面添加操作按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config) VALUES
    ('d0000035-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000207', 'view',   '查看',   '/api/knowledge/upload',              'GET',    'knowledge.view',      'default', 'row_action', '{}'),
    ('d0000035-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000207', 'upload', '上传',   '/api/knowledge/upload',              'POST',   'knowledge.upload',     'primary', 'toolbar',   '{}'),
    ('d0000035-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000207', 'delete', '删除',   '/api/knowledge/upload',              'DELETE', 'knowledge.delete',    'danger',  'row_action', '{}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, permission_code = EXCLUDED.permission_code,
    button_type = EXCLUDED.button_type, position = EXCLUDED.position,
    config = EXCLUDED.config;

-- 4. 为旧版 knowledge 模块（知识库管理）补充审核相关操作按钮
-- 审核通过按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
VALUES ('d0000035-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-0000000000140', 'approve', '审核通过', '/api/admin/knowledge/:id', 'PATCH', 'knowledge.manage', 'success', 'row_action', '{"body":{"status":"approved"}}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, permission_code = EXCLUDED.permission_code,
    button_type = EXCLUDED.button_type, position = EXCLUDED.position,
    config = EXCLUDED.config;

-- 审核拒绝按钮（需填写原因）
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
VALUES ('d0000035-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-0000000000140', 'reject', '审核拒绝', '/api/admin/knowledge/:id', 'PATCH', 'knowledge.manage', 'warning', 'row_action', '{"body":{"status":"rejected"},"requiresReason":true}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, permission_code = EXCLUDED.permission_code,
    button_type = EXCLUDED.button_type, position = EXCLUDED.position,
    config = EXCLUDED.config;

-- 5. 更新现有 knowledge_center 子页面的操作按钮配置，补充 download 按钮
-- 仅为尚未配置 download 的页面添加（025 中未包含 download）
DO $$ BEGIN
    -- 产品价格库
    INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
    VALUES ('d0000035-0000-0000-0000-000000000020', 'b0000001-0000-0000-0000-000000000200', 'download', '下载', '/api/knowledge/download', 'POST', 'knowledge.price.download', 'default', 'row_action', '{}')
    ON CONFLICT (page_id, action_key) DO NOTHING;

    -- 技术文档库
    INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
    VALUES ('d0000035-0000-0000-0000-000000000021', 'b0000001-0000-0000-0000-000000000201', 'download', '下载', '/api/knowledge/download', 'POST', 'knowledge.doc.download', 'default', 'row_action', '{}')
    ON CONFLICT (page_id, action_key) DO NOTHING;

    -- 案例库
    INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
    VALUES ('d0000035-0000-0000-0000-000000000022', 'b0000001-0000-0000-0000-000000000202', 'download', '下载', '/api/knowledge/download', 'POST', 'knowledge.case.download', 'default', 'row_action', '{}')
    ON CONFLICT (page_id, action_key) DO NOTHING;

    -- 标准规范库
    INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
    VALUES ('d0000035-0000-0000-0000-000000000023', 'b0000001-0000-0000-0000-000000000203', 'download', '下载', '/api/knowledge/download', 'POST', 'knowledge.standard.download', 'default', 'row_action', '{}')
    ON CONFLICT (page_id, action_key) DO NOTHING;

    -- 图纸图片库
    INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
    VALUES ('d0000035-0000-0000-0000-000000000024', 'b0000001-0000-0000-0000-000000000204', 'download', '下载', '/api/knowledge/download', 'POST', 'knowledge.drawing.download', 'default', 'row_action', '{}')
    ON CONFLICT (page_id, action_key) DO NOTHING;

    -- 定额库
    INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_code, button_type, position, config)
    VALUES ('d0000035-0000-0000-0000-000000000025', 'b0000001-0000-0000-0000-000000000205', 'download', '下载', '/api/knowledge/download', 'POST', 'knowledge.quota.download', 'default', 'row_action', '{}')
    ON CONFLICT (page_id, action_key) DO NOTHING;
END $$;
