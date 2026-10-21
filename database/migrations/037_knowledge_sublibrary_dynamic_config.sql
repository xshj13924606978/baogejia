-- ============================================================
-- 037_knowledge_sublibrary_dynamic_config.sql
-- 资料中心子库动态配置同步
-- 同步 system_modules/system_pages/system_fields/system_actions
-- 使用 ON CONFLICT DO NOTHING 不覆盖现有配置
-- ============================================================

-- ============================================================
-- 1. 子模块配置 (system_modules)
--    knowledge-center 已存在 (ID: a0000001-0000-0000-0000-000000000060)
--    在其下创建5个子模块
-- ============================================================
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, sort_order, parent_module_id, is_enabled, is_visible_in_menu, route_path, description, permission_code)
VALUES
  ('a0000001-0000-0000-0000-000000000061', 'document_library', '技术文档库', 'Document Library', 'FileText', 2, 'a0000001-0000-0000-0000-000000000060', true, true, '/admin/knowledge-center/document-library', '管理技术文档的上传、审核和发布', 'knowledge.document.manage'),
  ('a0000001-0000-0000-0000-000000000062', 'case_library', '案例库', 'Case Library', 'Briefcase', 3, 'a0000001-0000-0000-0000-000000000060', true, true, '/admin/knowledge-center/case-library', '管理工程案例的上传、审核和发布', 'knowledge.case.manage'),
  ('a0000001-0000-0000-0000-000000000063', 'standard_library', '标准规范库', 'Standard Library', 'BookOpen', 4, 'a0000001-0000-0000-0000-000000000060', true, true, '/admin/knowledge-center/standard-library', '管理标准规范的上传、审核和发布', 'knowledge.standard.manage'),
  ('a0000001-0000-0000-0000-000000000064', 'drawing_library', '图纸图片库', 'Drawing Library', 'Image', 5, 'a0000001-0000-0000-0000-000000000060', true, true, '/admin/knowledge-center/drawing-library', '管理图纸图片的上传、审核和发布', 'knowledge.drawing.manage'),
  ('a0000001-0000-0000-0000-000000000065', 'quota_library', '定额库', 'Quota Library', 'Calculator', 6, 'a0000001-0000-0000-0000-000000000060', true, true, '/admin/knowledge-center/quota-library', '管理定额数据的上传、审核和发布', 'knowledge.quota.manage')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. 详情页配置 (system_pages)
--    列表页已存在，补充详情页
--    已有列表页 ID:
--      document_library → 6431b0a9-c2a7-4500-9459-78add7b43b96
--      case_library     → 75de93b4-0859-4372-b469-a0aa9071e30e
--      standard_library → df435e9f-9c46-4e4e-8a54-391e8e7a9e2e
--      drawing_library  → c93a70e7-9bda-45c8-bf02-5536d124ad80
--      quota_library    → 4c7acd1e-0aae-4206-b722-97a6b3157cda
-- ============================================================
INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, sort_order, config)
VALUES
  -- 文档详情
  ('b0000001-0000-0000-0000-000000000201', 'a0000001-0000-0000-0000-000000000061', 'document_detail', '文档详情', '/admin/knowledge-center/document-library/:id', 'detail', true, 2, '{"showBackButton": true, "showActions": true}'),
  -- 案例详情
  ('b0000001-0000-0000-0000-000000000202', 'a0000001-0000-0000-0000-000000000062', 'case_detail', '案例详情', '/admin/knowledge-center/case-library/:id', 'detail', true, 2, '{"showBackButton": true, "showActions": true}'),
  -- 标准详情
  ('b0000001-0000-0000-0000-000000000203', 'a0000001-0000-0000-0000-000000000063', 'standard_detail', '标准详情', '/admin/knowledge-center/standard-library/:id', 'detail', true, 2, '{"showBackButton": true, "showActions": true}'),
  -- 图纸详情
  ('b0000001-0000-0000-0000-000000000204', 'a0000001-0000-0000-0000-000000000064', 'drawing_detail', '图纸详情', '/admin/knowledge-center/drawing-library/:id', 'detail', true, 2, '{"showBackButton": true, "showActions": true}'),
  -- 定额详情
  ('b0000001-0000-0000-0000-000000000205', 'a0000001-0000-0000-0000-000000000065', 'quota_detail', '定额详情', '/admin/knowledge-center/quota-library/:id', 'detail', true, 2, '{"showBackButton": true, "showActions": true}')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 3. 列表页字段配置 (system_fields)
--    每个子库列表页通用字段：标题、文件名、上传者、状态、文件大小、上传时间
-- ============================================================
-- document_library 列表字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, validation_rules, config)
VALUES
  ('c0000001-0000-0000-0000-000000000101', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{}', '{"width": 200, "sortable": true, "filterable": true, "searchable": true, "placeholder": "文档标题"}'),
  ('c0000001-0000-0000-0000-000000000102', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'file_name', 'text', '文件名', true, false, false, 2, '基本信息', '{}', '{"width": 180, "sortable": false, "filterable": false, "searchable": false}'),
  ('c0000001-0000-0000-0000-000000000103', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'uploader_name', 'text', '上传者', true, false, false, 3, '基本信息', '{}', '{"width": 100, "sortable": true, "filterable": true}'),
  ('c0000001-0000-0000-0000-000000000104', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'status', 'select', '状态', true, true, false, 4, '基本信息', '{}', '{"width": 80, "sortable": true, "filterable": true, "options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- case_library 列表字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, validation_rules, config)
VALUES
  ('c0000001-0000-0000-0000-000000000111', '75de93b4-0859-4372-b469-a0aa9071e30e', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{}', '{"width": 200, "sortable": true, "filterable": true, "searchable": true, "placeholder": "案例标题"}'),
  ('c0000001-0000-0000-0000-000000000112', '75de93b4-0859-4372-b469-a0aa9071e30e', 'file_name', 'text', '文件名', true, false, false, 2, '基本信息', '{}', '{"width": 180, "sortable": false, "filterable": false, "searchable": false}'),
  ('c0000001-0000-0000-0000-000000000113', '75de93b4-0859-4372-b469-a0aa9071e30e', 'uploader_name', 'text', '上传者', true, false, false, 3, '基本信息', '{}', '{"width": 100, "sortable": true, "filterable": true}'),
  ('c0000001-0000-0000-0000-000000000114', '75de93b4-0859-4372-b469-a0aa9071e30e', 'status', 'select', '状态', true, true, false, 4, '基本信息', '{}', '{"width": 80, "sortable": true, "filterable": true, "options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- standard_library 列表字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, validation_rules, config)
VALUES
  ('c0000001-0000-0000-0000-000000000121', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{}', '{"width": 200, "sortable": true, "filterable": true, "searchable": true, "placeholder": "标准名称"}'),
  ('c0000001-0000-0000-0000-000000000122', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'file_name', 'text', '文件名', true, false, false, 2, '基本信息', '{}', '{"width": 180, "sortable": false, "filterable": false, "searchable": false}'),
  ('c0000001-0000-0000-0000-000000000123', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'uploader_name', 'text', '上传者', true, false, false, 3, '基本信息', '{}', '{"width": 100, "sortable": true, "filterable": true}'),
  ('c0000001-0000-0000-0000-000000000124', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'status', 'select', '状态', true, true, false, 4, '基本信息', '{}', '{"width": 80, "sortable": true, "filterable": true, "options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- drawing_library 列表字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, validation_rules, config)
VALUES
  ('c0000001-0000-0000-0000-000000000131', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{}', '{"width": 200, "sortable": true, "filterable": true, "searchable": true, "placeholder": "图纸名称"}'),
  ('c0000001-0000-0000-0000-000000000132', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'file_name', 'text', '文件名', true, false, false, 2, '基本信息', '{}', '{"width": 180, "sortable": false, "filterable": false, "searchable": false}'),
  ('c0000001-0000-0000-0000-000000000133', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'uploader_name', 'text', '上传者', true, false, false, 3, '基本信息', '{}', '{"width": 100, "sortable": true, "filterable": true}'),
  ('c0000001-0000-0000-0000-000000000134', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'status', 'select', '状态', true, true, false, 4, '基本信息', '{}', '{"width": 80, "sortable": true, "filterable": true, "options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- quota_library 列表字段
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, validation_rules, config)
VALUES
  ('c0000001-0000-0000-0000-000000000141', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{}', '{"width": 200, "sortable": true, "filterable": true, "searchable": true, "placeholder": "定额名称"}'),
  ('c0000001-0000-0000-0000-000000000142', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'file_name', 'text', '文件名', true, false, false, 2, '基本信息', '{}', '{"width": 180, "sortable": false, "filterable": false, "searchable": false}'),
  ('c0000001-0000-0000-0000-000000000143', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'uploader_name', 'text', '上传者', true, false, false, 3, '基本信息', '{}', '{"width": 100, "sortable": true, "filterable": true}'),
  ('c0000001-0000-0000-0000-000000000144', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'status', 'select', '状态', true, true, false, 4, '基本信息', '{}', '{"width": 80, "sortable": true, "filterable": true, "options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. 详情页字段配置
--    详情页字段：标题、描述、文件信息、上传者、状态、标签、元数据
-- ============================================================
-- document_detail
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, config)
VALUES
  ('c0000001-0000-0000-0000-000000000151', 'b0000001-0000-0000-0000-000000000201', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000152', 'b0000001-0000-0000-0000-000000000201', 'description', 'textarea', '描述', true, true, false, 2, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000153', 'b0000001-0000-0000-0000-000000000201', 'file_name', 'text', '文件名', true, false, false, 3, '文件信息', '{"width": 300}'),
  ('c0000001-0000-0000-0000-000000000154', 'b0000001-0000-0000-0000-000000000201', 'file_size', 'text', '文件大小', true, false, false, 4, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000155', 'b0000001-0000-0000-0000-000000000201', 'file_type', 'text', '文件类型', true, false, false, 5, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000156', 'b0000001-0000-0000-0000-000000000201', 'uploader_name', 'text', '上传者', true, false, false, 6, '审核信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000157', 'b0000001-0000-0000-0000-000000000201', 'status', 'select', '状态', true, true, false, 7, '审核信息', '{"options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- case_detail
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, config)
VALUES
  ('c0000001-0000-0000-0000-000000000161', 'b0000001-0000-0000-0000-000000000202', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000162', 'b0000001-0000-0000-0000-000000000202', 'description', 'textarea', '描述', true, true, false, 2, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000163', 'b0000001-0000-0000-0000-000000000202', 'file_name', 'text', '文件名', true, false, false, 3, '文件信息', '{"width": 300}'),
  ('c0000001-0000-0000-0000-000000000164', 'b0000001-0000-0000-0000-000000000202', 'file_size', 'text', '文件大小', true, false, false, 4, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000165', 'b0000001-0000-0000-0000-000000000202', 'file_type', 'text', '文件类型', true, false, false, 5, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000166', 'b0000001-0000-0000-0000-000000000202', 'uploader_name', 'text', '上传者', true, false, false, 6, '审核信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000167', 'b0000001-0000-0000-0000-000000000202', 'status', 'select', '状态', true, true, false, 7, '审核信息', '{"options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- standard_detail
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, config)
VALUES
  ('c0000001-0000-0000-0000-000000000171', 'b0000001-0000-0000-0000-000000000203', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000172', 'b0000001-0000-0000-0000-000000000203', 'description', 'textarea', '描述', true, true, false, 2, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000173', 'b0000001-0000-0000-0000-000000000203', 'file_name', 'text', '文件名', true, false, false, 3, '文件信息', '{"width": 300}'),
  ('c0000001-0000-0000-0000-000000000174', 'b0000001-0000-0000-0000-000000000203', 'file_size', 'text', '文件大小', true, false, false, 4, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000175', 'b0000001-0000-0000-0000-000000000203', 'file_type', 'text', '文件类型', true, false, false, 5, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000176', 'b0000001-0000-0000-0000-000000000203', 'uploader_name', 'text', '上传者', true, false, false, 6, '审核信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000177', 'b0000001-0000-0000-0000-000000000203', 'status', 'select', '状态', true, true, false, 7, '审核信息', '{"options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- drawing_detail
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, config)
VALUES
  ('c0000001-0000-0000-0000-000000000181', 'b0000001-0000-0000-0000-000000000204', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000182', 'b0000001-0000-0000-0000-000000000204', 'description', 'textarea', '描述', true, true, false, 2, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000183', 'b0000001-0000-0000-0000-000000000204', 'file_name', 'text', '文件名', true, false, false, 3, '文件信息', '{"width": 300}'),
  ('c0000001-0000-0000-0000-000000000184', 'b0000001-0000-0000-0000-000000000204', 'file_size', 'text', '文件大小', true, false, false, 4, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000185', 'b0000001-0000-0000-0000-000000000204', 'file_type', 'text', '文件类型', true, false, false, 5, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000186', 'b0000001-0000-0000-0000-000000000204', 'uploader_name', 'text', '上传者', true, false, false, 6, '审核信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000187', 'b0000001-0000-0000-0000-000000000204', 'status', 'select', '状态', true, true, false, 7, '审核信息', '{"options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;

-- quota_detail
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, config)
VALUES
  ('c0000001-0000-0000-0000-000000000191', 'b0000001-0000-0000-0000-000000000205', 'title', 'text', '标题', true, true, true, 1, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000192', 'b0000001-0000-0000-0000-000000000205', 'description', 'textarea', '描述', true, true, false, 2, '基本信息', '{"width": "full"}'),
  ('c0000001-0000-0000-0000-000000000193', 'b0000001-0000-0000-0000-000000000205', 'file_name', 'text', '文件名', true, false, false, 3, '文件信息', '{"width": 300}'),
  ('c0000001-0000-0000-0000-000000000194', 'b0000001-0000-0000-0000-000000000205', 'file_size', 'text', '文件大小', true, false, false, 4, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000195', 'b0000001-0000-0000-0000-000000000205', 'file_type', 'text', '文件类型', true, false, false, 5, '文件信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000196', 'b0000001-0000-0000-0000-000000000205', 'uploader_name', 'text', '上传者', true, false, false, 6, '审核信息', '{"width": 120}'),
  ('c0000001-0000-0000-0000-000000000197', 'b0000001-0000-0000-0000-000000000205', 'status', 'select', '状态', true, true, false, 7, '审核信息', '{"options": ["pending", "approved", "rejected"]}')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 5. 按钮配置 (system_actions)
--    列表页按钮：下载、编辑、删除、审核通过、审核拒绝
--    详情页按钮：下载、编辑、删除、审核通过、审核拒绝
-- ============================================================
-- document_library 列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
VALUES
  ('d0000001-0000-0000-0000-000000000101', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'download', '下载', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000102', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000103', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "row_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000104', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "row_action", "batch": true}'),
  ('d0000001-0000-0000-0000-000000000105', '6431b0a9-c2a7-4500-9459-78add7b43b96', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "row_action", "confirm": "确定要拒绝吗？"}')
ON CONFLICT (id) DO NOTHING;

-- case_library 列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
VALUES
  ('d0000001-0000-0000-0000-000000000111', '75de93b4-0859-4372-b469-a0aa9071e30e', 'download', '下载', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000112', '75de93b4-0859-4372-b469-a0aa9071e30e', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000113', '75de93b4-0859-4372-b469-a0aa9071e30e', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "row_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000114', '75de93b4-0859-4372-b469-a0aa9071e30e', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "row_action", "batch": true}'),
  ('d0000001-0000-0000-0000-000000000115', '75de93b4-0859-4372-b469-a0aa9071e30e', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "row_action", "confirm": "确定要拒绝吗？"}')
ON CONFLICT (id) DO NOTHING;

-- standard_library 列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
VALUES
  ('d0000001-0000-0000-0000-000000000121', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'download', '下载', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000122', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000123', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "row_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000124', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "row_action", "batch": true}'),
  ('d0000001-0000-0000-0000-000000000125', 'df435e9f-9c46-4e4e-8a54-391e8e7a9e2e', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "row_action", "confirm": "确定要拒绝吗？"}')
ON CONFLICT (id) DO NOTHING;

-- drawing_library 列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
VALUES
  ('d0000001-0000-0000-0000-000000000131', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'download', '下载', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000132', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000133', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "row_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000134', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "row_action", "batch": true}'),
  ('d0000001-0000-0000-0000-000000000135', 'c93a70e7-9bda-45c8-bf02-5536d124ad80', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "row_action", "confirm": "确定要拒绝吗？"}')
ON CONFLICT (id) DO NOTHING;

-- quota_library 列表按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
VALUES
  ('d0000001-0000-0000-0000-000000000141', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'download', '下载', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000142', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "row_action"}'),
  ('d0000001-0000-0000-0000-000000000143', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "row_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000144', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "row_action", "batch": true}'),
  ('d0000001-0000-0000-0000-000000000145', '4c7acd1e-0aae-4206-b722-97a6b3157cda', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "row_action", "confirm": "确定要拒绝吗？"}')
ON CONFLICT (id) DO NOTHING;

-- 详情页按钮 (5个子库共用 download/edit/delete/approve/reject)
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
VALUES
  ('d0000001-0000-0000-0000-000000000201', 'b0000001-0000-0000-0000-000000000201', 'download', '下载文件', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000202', 'b0000001-0000-0000-0000-000000000201', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000203', 'b0000001-0000-0000-0000-000000000201', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "page_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000204', 'b0000001-0000-0000-0000-000000000201', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000205', 'b0000001-0000-0000-0000-000000000201', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000211', 'b0000001-0000-0000-0000-000000000202', 'download', '下载文件', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000212', 'b0000001-0000-0000-0000-000000000202', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000213', 'b0000001-0000-0000-0000-000000000202', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "page_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000214', 'b0000001-0000-0000-0000-000000000202', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000215', 'b0000001-0000-0000-0000-000000000202', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000221', 'b0000001-0000-0000-0000-000000000203', 'download', '下载文件', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000222', 'b0000001-0000-0000-0000-000000000203', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000223', 'b0000001-0000-0000-0000-000000000203', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "page_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000224', 'b0000001-0000-0000-0000-000000000203', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000225', 'b0000001-0000-0000-0000-000000000203', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000231', 'b0000001-0000-0000-0000-000000000204', 'download', '下载文件', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000232', 'b0000001-0000-0000-0000-000000000204', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000233', 'b0000001-0000-0000-0000-000000000204', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "page_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000234', 'b0000001-0000-0000-0000-000000000204', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000235', 'b0000001-0000-0000-0000-000000000204', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000241', 'b0000001-0000-0000-0000-000000000205', 'download', '下载文件', '/api/knowledge/download', 'POST', true, 'knowledge.download', 1, '{"icon": "Download", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000242', 'b0000001-0000-0000-0000-000000000205', 'edit', '编辑', '/api/knowledge/:id', 'PUT', true, 'knowledge.edit', 2, '{"icon": "Edit", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000243', 'b0000001-0000-0000-0000-000000000205', 'delete', '删除', '/api/knowledge/:id', 'DELETE', true, 'knowledge.delete', 3, '{"icon": "Trash2", "position": "page_action", "confirm": "确定要删除吗？"}'),
  ('d0000001-0000-0000-0000-000000000244', 'b0000001-0000-0000-0000-000000000205', 'approve', '审核通过', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 4, '{"icon": "Check", "position": "page_action"}'),
  ('d0000001-0000-0000-0000-000000000245', 'b0000001-0000-0000-0000-000000000205', 'reject', '审核拒绝', '/api/knowledge/audit', 'POST', true, 'knowledge.audit', 5, '{"icon": "X", "position": "page_action"}')
ON CONFLICT (id) DO NOTHING;
