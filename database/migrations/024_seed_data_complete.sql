-- =============================================================================
-- 024_seed_data_complete.sql
-- 补全缺失的 system_fields 和 system_actions 种子数据
-- UPSERT 模式，可安全重复执行
-- =============================================================================

-- =============================================================================
-- PART 1: system_fields
-- =============================================================================

-- 1. 企业用户列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000005-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000020', 'email', 'text', '邮箱', true, true, false, '基本信息', 1, '{"width":220,"sortable":true,"searchable":true}'),
    ('c0000005-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000020', 'username', 'text', '用户名', true, true, false, '基本信息', 2, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000005-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000020', 'full_name', 'text', '姓名', true, true, false, '基本信息', 3, '{"width":100,"sortable":true,"searchable":true}'),
    ('c0000005-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000020', 'role', 'select', '角色', true, true, false, '基本信息', 4, '{"width":120,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"企业管理员","value":"enterprise_admin"}]}}'),
    ('c0000005-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000020', 'status', 'select', '状态', true, true, false, '基本信息', 5, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"正常","value":"active"},{"label":"禁用","value":"disabled"}]}}'),
    ('c0000005-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000020', 'points', 'number', '积分', true, true, false, '积分信息', 6, '{"width":100,"sortable":true}'),
    ('c0000005-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000020', 'phone', 'text', '手机号', true, true, false, '联系信息', 7, '{"width":140,"searchable":true}'),
    ('c0000005-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000020', 'company_name', 'text', '企业名称', true, true, false, '企业信息', 8, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000005-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000020', 'created_at', 'date', '注册时间', true, true, false, '系统信息', 9, '{"width":170,"sortable":true,"filterable":true}'),
    ('c0000005-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000020', 'last_sign_in_at', 'date', '最后登录', true, true, false, '系统信息', 10, '{"width":170,"sortable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 2. 审核待审列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000006-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000030', 'type', 'select', '类型', true, true, false, '基本信息', 1, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"},{"label":"其他","value":"other"}]}}'),
    ('c0000006-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000030', 'title', 'text', '标题', true, true, false, '基本信息', 2, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000006-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000030', 'description', 'text', '描述', true, true, false, '基本信息', 3, '{"width":200,"searchable":true}'),
    ('c0000006-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000030', 'fileName', 'text', '文件名', true, true, false, '文件信息', 4, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000006-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000030', 'fileSize', 'number', '文件大小', true, true, false, '文件信息', 5, '{"width":100,"sortable":true}'),
    ('c0000006-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000030', 'status', 'select', '状态', true, true, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000006-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000030', 'uploaderName', 'text', '上传者', true, true, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true,"filterable":true}'),
    ('c0000006-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000030', 'createdAt', 'date', '提交时间', true, true, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}'),
    ('c0000006-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000030', 'fileType', 'text', '文件类型', true, true, false, '文件信息', 9, '{"width":100,"filterable":true}'),
    ('c0000006-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000030', 'fileUrl', 'text', '文件URL', false, true, false, '文件信息', 10, '{"width":100}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 3. 审核历史页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000007-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000032', 'type', 'select', '类型', true, true, false, '基本信息', 1, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"},{"label":"其他","value":"other"}]}}'),
    ('c0000007-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000032', 'title', 'text', '标题', true, true, false, '基本信息', 2, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000007-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000032', 'description', 'text', '描述', true, true, false, '基本信息', 3, '{"width":200,"searchable":true}'),
    ('c0000007-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000032', 'fileName', 'text', '文件名', true, true, false, '文件信息', 4, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000007-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000032', 'fileSize', 'number', '文件大小', true, true, false, '文件信息', 5, '{"width":100,"sortable":true}'),
    ('c0000007-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000032', 'status', 'select', '状态', true, true, false, '基本信息', 6, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000007-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000032', 'uploaderName', 'text', '上传者', true, true, false, '用户信息', 7, '{"width":120,"sortable":true,"searchable":true,"filterable":true}'),
    ('c0000007-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000032', 'createdAt', 'date', '提交时间', true, true, false, '系统信息', 8, '{"width":170,"sortable":true,"filterable":true}'),
    ('c0000007-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000032', 'fileType', 'text', '文件类型', true, true, false, '文件信息', 9, '{"width":100,"filterable":true}'),
    ('c0000007-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000032', 'fileUrl', 'text', '文件URL', false, true, false, '文件信息', 10, '{"width":100}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 4. 导入日志列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000008-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000150', 'status', 'select', '状态', true, true, false, '基本信息', 1, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"完成","value":"completed"},{"label":"失败","value":"failed"}]}}'),
    ('c0000008-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000150', 'file_name', 'text', '文件名', true, true, false, '文件信息', 2, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000008-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000150', 'file_type', 'text', '文件类型', true, true, false, '文件信息', 3, '{"width":100,"filterable":true}'),
    ('c0000008-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000150', 'total_count', 'number', '总数', true, true, false, '导入统计', 4, '{"width":80,"sortable":true}'),
    ('c0000008-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000150', 'imported_count', 'number', '成功', true, true, false, '导入统计', 5, '{"width":80,"sortable":true}'),
    ('c0000008-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000150', 'skipped_count', 'number', '跳过', true, true, false, '导入统计', 6, '{"width":80,"sortable":true}'),
    ('c0000008-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000150', 'failed_count', 'number', '失败', true, true, false, '导入统计', 7, '{"width":80,"sortable":true}'),
    ('c0000008-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000150', 'duration_ms', 'number', '耗时', true, true, false, '导入统计', 8, '{"width":100,"sortable":true}'),
    ('c0000008-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000150', 'created_at', 'date', '导入时间', true, true, false, '系统信息', 9, '{"width":170,"sortable":true,"filterable":true}'),
    ('c0000008-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000150', 'user_id', 'text', '操作人', false, true, false, '用户信息', 10, '{"width":100}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 5. 知识库列表页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000009-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000140', 'type', 'select', '类型', true, true, false, '基本信息', 1, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"},{"label":"其他","value":"other"}]}}'),
    ('c0000009-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000140', 'title', 'text', '标题', true, true, false, '基本信息', 2, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000009-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000140', 'description', 'text', '描述', true, true, false, '基本信息', 3, '{"width":200,"searchable":true}'),
    ('c0000009-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000140', 'fileName', 'text', '文件名', true, true, false, '文件信息', 4, '{"width":180,"sortable":true,"searchable":true}'),
    ('c0000009-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000140', 'fileSize', 'number', '大小', true, true, false, '文件信息', 5, '{"width":100,"sortable":true}'),
    ('c0000009-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000140', 'fileType', 'text', '文件类型', true, true, false, '文件信息', 6, '{"width":100,"filterable":true}'),
    ('c0000009-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000140', 'status', 'select', '状态', true, true, false, '基本信息', 7, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000009-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000140', 'uploaderName', 'text', '上传者', true, true, false, '用户信息', 8, '{"width":120,"sortable":true,"searchable":true,"filterable":true}'),
    ('c0000009-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000140', 'createdAt', 'date', '上传时间', true, true, false, '系统信息', 9, '{"width":170,"sortable":true,"filterable":true}'),
    ('c0000009-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000140', 'fileUrl', 'text', '文件URL', false, true, false, '文件信息', 10, '{"width":100}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 6. 知识库编辑页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000010-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000141', 'type', 'select', '类型', true, true, false, '基本信息', 1, '{"optionsConfig":{"type":"static","options":[{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"},{"label":"其他","value":"other"}]}}'),
    ('c0000010-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000141', 'title', 'text', '标题', true, true, false, '基本信息', 2, '{"placeholder":"请输入标题"}'),
    ('c0000010-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000141', 'description', 'textarea', '描述', true, true, false, '基本信息', 3, '{"placeholder":"请输入描述"}'),
    ('c0000010-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000141', 'fileName', 'text', '文件名', true, true, false, '文件信息', 4, '{}'),
    ('c0000010-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000141', 'fileSize', 'number', '文件大小', true, true, false, '文件信息', 5, '{}'),
    ('c0000010-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000141', 'fileType', 'text', '文件类型', true, true, false, '文件信息', 6, '{}'),
    ('c0000010-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000141', 'status', 'select', '状态', true, true, false, '基本信息', 7, '{"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000010-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000141', 'uploaderName', 'text', '上传者', false, true, false, '用户信息', 8, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 7. 分类管理页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000011-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000142', 'type', 'select', '所属板块', true, true, false, '基本信息', 1, '{"width":150,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"}]}}'),
    ('c0000011-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000142', 'name', 'text', '分类名称', true, true, false, '基本信息', 2, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000011-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000142', 'description', 'text', '分类描述', true, true, false, '基本信息', 3, '{"width":300,"searchable":true}'),
    ('c0000011-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000142', 'sort_order', 'number', '排序', true, true, false, '基本信息', 4, '{"width":80,"sortable":true}'),
    ('c0000011-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000142', 'is_active', 'switch', '是否启用', true, true, false, '基本信息', 5, '{"width":100}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8. 等级配置页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000012-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000120', 'level', 'number', '等级', true, true, false, '基本信息', 1, '{"width":80,"sortable":true}'),
    ('c0000012-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000120', 'name', 'text', '名称', true, true, false, '基本信息', 2, '{"width":120,"sortable":true,"searchable":true}'),
    ('c0000012-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000120', 'requiredPoints', 'number', '所需积分', true, true, false, '升级条件', 3, '{"width":120,"sortable":true}'),
    ('c0000012-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000120', 'role', 'text', '角色', true, true, false, '角色映射', 4, '{"width":120}'),
    ('c0000012-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000120', 'daily_quota', 'number', '每日配额', true, true, false, '配额设置', 5, '{"width":100,"sortable":true}'),
    ('c0000012-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000120', 'max_files', 'number', '最大文件数', true, true, false, '配额设置', 6, '{"width":100,"sortable":true}'),
    ('c0000012-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000120', 'max_chat_messages', 'number', '每日消息数', true, true, false, '配额设置', 7, '{"width":100,"sortable":true}'),
    ('c0000012-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000120', 'fieldPermissions', 'json', '字段权限', true, true, false, '权限配置', 8, '{"width":100}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 9. 积分流水页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000013-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000012', 'username', 'text', '用户', true, true, false, '基本信息', 1, '{"width":120,"sortable":true,"searchable":true,"filterable":true}'),
    ('c0000013-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000012', 'points', 'number', '积分变动', true, true, false, '积分信息', 2, '{"width":120,"sortable":true}'),
    ('c0000013-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000012', 'type', 'select', '类型', true, true, false, '积分信息', 3, '{"width":100,"sortable":true,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"获取","value":"earn"},{"label":"消费","value":"consume"},{"label":"奖励","value":"reward"},{"label":"扣除","value":"deduct"},{"label":"管理员调整","value":"admin_adjust"},{"label":"注册","value":"register"},{"label":"签到","value":"daily_sign"},{"label":"对话","value":"chat"},{"label":"报价","value":"quote"}]}}'),
    ('c0000013-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000012', 'description', 'text', '说明', true, true, false, '积分信息', 4, '{"width":200,"searchable":true}'),
    ('c0000013-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000012', 'createdAt', 'date', '时间', true, true, false, '系统信息', 5, '{"width":170,"sortable":true,"filterable":true}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 10. 系统基本设置页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000014-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000160', 'key', 'text', '配置键', true, true, false, '基本配置', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000014-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000160', 'value', 'text', '配置值', true, true, false, '基本配置', 2, '{"width":200}'),
    ('c0000014-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000160', 'type', 'select', '值类型', true, true, false, '基本配置', 3, '{"width":100,"filterable":true,"optionsConfig":{"type":"static","options":[{"label":"字符串","value":"string"},{"label":"数字","value":"number"},{"label":"布尔","value":"boolean"},{"label":"JSON","value":"json"}]}}'),
    ('c0000014-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000160', 'label', 'text', '显示名称', true, true, false, '基本配置', 4, '{"width":200,"searchable":true}'),
    ('c0000014-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000160', 'description', 'text', '说明', true, true, false, '基本配置', 5, '{"width":300}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 11. 系统安全设置页
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000015-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000161', 'key', 'text', '配置键', true, true, false, '安全配置', 1, '{"width":200,"sortable":true,"searchable":true}'),
    ('c0000015-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000161', 'value', 'text', '配置值', true, true, false, '安全配置', 2, '{"width":200}'),
    ('c0000015-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000161', 'type', 'select', '值类型', true, true, false, '安全配置', 3, '{"width":100,"optionsConfig":{"type":"static","options":[{"label":"字符串","value":"string"},{"label":"数字","value":"number"},{"label":"布尔","value":"boolean"},{"label":"JSON","value":"json"}]}}'),
    ('c0000015-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000161', 'label', 'text', '显示名称', true, true, false, '安全配置', 4, '{"width":200,"searchable":true}'),
    ('c0000015-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000161', 'description', 'text', '说明', true, true, false, '安全配置', 5, '{"width":300}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- =============================================================================
-- PART 2: system_actions
-- =============================================================================

-- A1. 企业列表页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000005-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000020', 'view', '查看', '/api/admin/users/:id', 'GET', true, 'user.view', 1, '{"icon":"Eye","position":"row_action"}'),
    ('d0000005-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000020', 'toggle_status', '启用/禁用', '/api/admin/users/:id', 'PUT', true, 'user.edit', 2, '{"icon":"Power","position":"row_action","confirmMessage":"确定要更改该用户状态吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A2. 审核历史页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000006-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000032', 'view', '查看', '/api/admin/audit/:id', 'GET', true, 'audit.review', 1, '{"icon":"Eye","position":"row_action"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A3. 导入日志列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000007-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000150', 'view', '查看详情', '/api/admin/import-logs/:id', 'GET', true, 'import_log.view', 1, '{"icon":"Eye","position":"row_action"}'),
    ('d0000007-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000150', 'retry', '重新导入', '/api/admin/import-logs/:id/retry', 'POST', true, 'import_log.manage', 2, '{"icon":"RefreshCw","position":"row_action","confirmMessage":"确定要重新导入该文件吗？"}'),
    ('d0000007-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000150', 'delete', '删除', '/api/admin/import-logs/:id', 'DELETE', true, 'import_log.delete', 3, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该导入记录吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A4. 知识库列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000008-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000140', 'create', '上传知识', '/api/admin/knowledge', 'POST', true, 'knowledge.create', 1, '{"icon":"Upload","buttonType":"primary","position":"toolbar"}'),
    ('d0000008-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000140', 'view', '查看', '/api/admin/knowledge/:id', 'GET', true, 'knowledge.view', 2, '{"icon":"Eye","position":"row_action"}'),
    ('d0000008-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000140', 'edit', '编辑', '/api/admin/knowledge/:id', 'PUT', true, 'knowledge.edit', 3, '{"icon":"Edit","position":"row_action"}'),
    ('d0000008-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000140', 'delete', '删除', '/api/admin/knowledge/:id', 'DELETE', true, 'knowledge.delete', 4, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该知识条目吗？"}'),
    ('d0000008-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000140', 'export', '导出', '/api/admin/knowledge/export', 'GET', true, 'knowledge.export', 5, '{"icon":"Download","position":"toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A5. 分类管理按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000009-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000142', 'create', '新增分类', '/api/admin/knowledge/categories', 'POST', true, 'knowledge.create', 1, '{"icon":"Plus","buttonType":"primary","position":"toolbar"}'),
    ('d0000009-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000142', 'edit', '编辑', '/api/admin/knowledge/categories/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon":"Edit","position":"row_action"}'),
    ('d0000009-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000142', 'delete', '删除', '/api/admin/knowledge/categories/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该分类吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A6. 等级配置按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000010-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000120', 'create', '新增等级', '/api/admin/levels', 'POST', true, 'membership.manage', 1, '{"icon":"Plus","buttonType":"primary","position":"toolbar"}'),
    ('d0000010-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000120', 'edit', '编辑', '/api/admin/levels/:id', 'PUT', true, 'membership.manage', 2, '{"icon":"Edit","position":"row_action"}'),
    ('d0000010-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000120', 'delete', '删除', '/api/admin/levels/:id', 'DELETE', true, 'membership.manage', 3, '{"icon":"Trash2","buttonType":"danger","position":"row_action","confirmMessage":"确定要删除该等级吗？"}'),
    ('d0000010-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000120', 'preview', '预览效果', '/api/admin/levels/:id/preview', 'GET', true, 'membership.view', 4, '{"icon":"Eye","position":"row_action"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A7. 统计概览按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000011-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000130', 'refresh', '刷新数据', '/api/admin/stats', 'GET', true, 'stats.view', 1, '{"icon":"RefreshCw","position":"toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A8. 收入统计按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000012-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000131', 'export', '导出报表', '/api/admin/stats/revenue/export', 'GET', true, 'stats.export', 1, '{"icon":"Download","position":"toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A9. 基本设置按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000013-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000160', 'save', '保存', '/api/admin/settings', 'PUT', true, 'system.settings', 1, '{"icon":"Save","buttonType":"primary","position":"toolbar"}'),
    ('d0000013-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000160', 'reset', '重置', '/api/admin/settings/reset', 'POST', true, 'system.settings', 2, '{"icon":"RotateCcw","position":"toolbar","confirmMessage":"确定要重置为默认设置吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A10. 安全设置按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000014-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000161', 'save', '保存', '/api/admin/settings', 'PUT', true, 'system.settings', 1, '{"icon":"Save","buttonType":"primary","position":"toolbar"}'),
    ('d0000014-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000161', 'reset', '重置', '/api/admin/settings/reset', 'POST', true, 'system.settings', 2, '{"icon":"RotateCcw","position":"toolbar","confirmMessage":"确定要重置为默认设置吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- A11. 产品表单按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000015-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000101', 'save', '保存', '/api/admin/products', 'POST', true, 'product.create', 1, '{"icon":"Save","buttonType":"primary","position":"toolbar"}'),
    ('d0000015-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000101', 'cancel', '取消', '/api/admin/products', 'GET', true, 'product.view', 2, '{"icon":"X","position":"toolbar"}'),
    ('d0000015-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000101', 'preview', '预览', '/api/admin/products/:id/preview', 'GET', true, 'product.view', 3, '{"icon":"Eye","position":"toolbar"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

DO $$
DECLARE f_count INTEGER; a_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO f_count FROM system_fields;
    SELECT COUNT(*) INTO a_count FROM system_actions;
    RAISE NOTICE '024 done! fields=% actions=%', f_count, a_count;
END $$;
