-- =============================================================================
-- 028_seed_missing_page_configs.sql
-- 补全 14 个缺失页面的字段和按钮配置
-- UPSERT 模式，可安全重复执行
-- =============================================================================

-- =============================================================================
-- PART 1: 详情页字段配置 (6 个页面)
-- =============================================================================

-- 1. 用户详情页 (user_detail)
-- page_id: b0000001-0000-0000-0000-000000000011
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000009-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000011', 'name',       'text',   '姓名',     true, true,  false, '基本信息', 1, '{}'),
    ('c0000009-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000011', 'email',      'email',  '邮箱',     true, true,  false, '基本信息', 2, '{}'),
    ('c0000009-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000011', 'username',   'text',   '用户名',   true, false, false, '基本信息', 3, '{}'),
    ('c0000009-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000011', 'phone',      'phone',  '手机号',   true, true,  false, '联系信息', 4, '{}'),
    ('c0000009-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000011', 'role',       'select', '角色',     true, true,  false, '权限信息', 5, '{"optionsConfig":{"type":"static","options":[{"label":"超级管理员","value":"super_admin"},{"label":"系统管理员","value":"admin"},{"label":"企业管理员","value":"enterprise_admin"},{"label":"VIP会员","value":"vip"},{"label":"付费会员","value":"premium"},{"label":"免费用户","value":"free"}]}}'),
    ('c0000009-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000011', 'status',     'select', '状态',     true, true,  false, '权限信息', 6, '{"optionsConfig":{"type":"static","options":[{"label":"正常","value":"active"},{"label":"禁用","value":"disabled"},{"label":"待审核","value":"pending"}]}}'),
    ('c0000009-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000011', 'points',     'number', '积分',     true, false, false, '积分信息', 7, '{}'),
    ('c0000009-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000011', 'avatar',     'image',  '头像',     true, true,  false, '基本信息', 8, '{}'),
    ('c0000009-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000011', 'created_at','date',   '注册时间', true, false, false, '系统信息', 9, '{}'),
    ('c0000009-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000011', 'last_login','date',   '最后登录', true, false, false, '系统信息', 10, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 2. 企业详情页 (enterprise_detail)
-- page_id: b0000001-0000-0000-0000-000000000021
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000010-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000021', 'name',           'text',     '企业名称',   true, true,  false, '企业信息', 1, '{}'),
    ('c0000010-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000021', 'industry',       'select',   '行业',       true, true,  false, '企业信息', 2, '{}'),
    ('c0000010-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000021', 'scale',         'select',   '规模',       true, true,  false, '企业信息', 3, '{}'),
    ('c0000010-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000021', 'logo_url',      'image',    '企业Logo',   true, true,  false, '企业信息', 4, '{}'),
    ('c0000010-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000021', 'credit_code',   'text',     '信用代码',   true, false, false, '基本信息', 5, '{}'),
    ('c0000010-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000021', 'legal_person',  'text',     '法人代表',   true, true,  false, '基本信息', 6, '{}'),
    ('c0000010-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000021', 'description',   'textarea', '企业描述',   true, true,  false, '基本信息', 7, '{}'),
    ('c0000010-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000021', 'contact_person','text',    '联系人',     true, true,  false, '联系信息', 8, '{}'),
    ('c0000010-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000021', 'contact_phone', 'phone',    '联系电话',   true, true,  false, '联系信息', 9, '{}'),
    ('c0000010-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000021', 'email',         'email',    '邮箱',       true, true,  false, '联系信息', 10, '{}'),
    ('c0000010-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000021', 'address',       'text',     '地址',       true, true,  false, '联系信息', 11, '{}'),
    ('c0000010-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000021', 'status',        'select',   '状态',       true, true,  false, '管理信息', 12, '{"optionsConfig":{"type":"static","options":[{"label":"正常","value":"active"},{"label":"禁用","value":"disabled"},{"label":"待审核","value":"pending"}]}}'),
    ('c0000010-0000-0000-0000-000000000013', 'b0000001-0000-0000-0000-000000000021', 'adminName',     'text',     '管理员',     true, false, false, '管理信息', 13, '{}'),
    ('c0000010-0000-0000-0000-000000000014', 'b0000001-0000-0000-0000-000000000021', 'created_at',    'date',     '创建时间',   true, false, false, '系统信息', 14, '{}'),
    ('c0000010-0000-0000-0000-000000000015', 'b0000001-0000-0000-0000-000000000021', 'updated_at',    'date',     '更新时间',   true, false, false, '系统信息', 15, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 3. 审核详情页 (audit_detail)
-- page_id: b0000001-0000-0000-0000-000000000031
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000011-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000031', 'type',        'select', '类型',     true, false, false, '基本信息', 1, '{"optionsConfig":{"type":"static","options":[{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"},{"label":"其他","value":"other"}]}}'),
    ('c0000011-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000031', 'status',      'select', '状态',     true, false, false, '基本信息', 2, '{"optionsConfig":{"type":"static","options":[{"label":"待审核","value":"pending"},{"label":"已通过","value":"approved"},{"label":"已拒绝","value":"rejected"}]}}'),
    ('c0000011-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000031', 'title',       'text',   '标题',     true, false, false, '基本信息', 3, '{}'),
    ('c0000011-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000031', 'description', 'text',   '描述',     true, false, false, '基本信息', 4, '{}'),
    ('c0000011-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000031', 'uploaderName','text',   '上传者',   true, false, false, '用户信息', 5, '{}'),
    ('c0000011-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000031', 'createdAt',   'date',   '提交时间', true, false, false, '系统信息', 6, '{}'),
    ('c0000011-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000031', 'fileName',    'text',   '文件名',   true, false, false, '文件信息', 7, '{}'),
    ('c0000011-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000031', 'fileSize',    'number', '文件大小', true, false, false, '文件信息', 8, '{}'),
    ('c0000011-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000031', 'fileType',    'text',   '文件类型', true, false, false, '文件信息', 9, '{}'),
    ('c0000011-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000031', 'fileUrl',     'url',   '文件链接', true, false, false, '文件信息', 10, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 4. 产品详情页 (product_detail)
-- page_id: b0000001-0000-0000-0000-000000000102
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000012-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000102', 'name',                   'text',   '产品名称', true, true,  true,  '基础信息', 1, '{}'),
    ('c0000012-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000102', 'category',               'select', '分类',     true, true,  false, '基础信息', 2, '{}'),
    ('c0000012-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000102', 'model',                  'text',   '规格型号', true, true,  false, '基础信息', 3, '{}'),
    ('c0000012-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000102', 'brand',                  'text',   '品牌',     true, true,  false, '基础信息', 4, '{}'),
    ('c0000012-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000102', 'unit',                   'text',   '单位',     true, true,  false, '基础信息', 5, '{}'),
    ('c0000012-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000102', 'price',                  'number', '售价',     true, true,  true,  '价格信息', 6, '{"precision":2}'),
    ('c0000012-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000102', 'cost_price',             'number', '成本价',   true, true,  false, '价格信息', 7, '{"precision":2}'),
    ('c0000012-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000102', 'min_price',              'number', '最低售价', true, true,  false, '价格信息', 8, '{"precision":2}'),
    ('c0000012-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000102', 'stock',                  'number', '库存',     true, true,  false, '库存信息', 9, '{}'),
    ('c0000012-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000102', 'supplier',               'text',   '供应商',   true, true,  false, '供应信息', 10, '{}'),
    ('c0000012-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000102', 'contact_person',         'text',   '联系人',   true, true,  false, '供应信息', 11, '{}'),
    ('c0000012-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000102', 'contact_phone',          'phone',  '联系电话', true, true,  false, '供应信息', 12, '{}'),
    ('c0000012-0000-0000-0000-000000000013', 'b0000001-0000-0000-0000-000000000102', 'image_url',              'image',  '产品图片', true, true,  false, '基础信息', 13, '{}'),
    ('c0000012-0000-0000-0000-000000000014', 'b0000001-0000-0000-0000-000000000102', 'parameter_description', 'textarea','参数描述', true, true,  false, '基础信息', 14, '{}'),
    ('c0000012-0000-0000-0000-000000000015', 'b0000001-0000-0000-0000-000000000102', 'created_at',             'date',   '创建时间', true, false, false, '系统信息', 15, '{}'),
    ('c0000012-0000-0000-0000-000000000016', 'b0000001-0000-0000-0000-000000000102', 'updated_at',             'date',   '更新时间', true, false, false, '系统信息', 16, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 5. 报价单详情页 (quote_detail)
-- page_id: b0000001-0000-0000-0000-000000000111
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000013-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000111', 'quoteNumber',  'text',   '报价编号', true, false, false, '基本信息', 1, '{}'),
    ('c0000013-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000111', 'status',       'select', '状态',     true, false, false, '基本信息', 2, '{"optionsConfig":{"type":"static","options":[{"label":"草稿","value":"draft"},{"label":"待审核","value":"pending_review"},{"label":"已批准","value":"approved"},{"label":"已拒绝","value":"rejected"},{"label":"已发送","value":"sent"}]}}'),
    ('c0000013-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000111', 'subtotal',     'number', '小计',     true, false, false, '价格信息', 3, '{"precision":2}'),
    ('c0000013-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000111', 'taxRate',      'number', '税率',     true, false, false, '价格信息', 4, '{}'),
    ('c0000013-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000111', 'taxAmount',    'number', '税额',     true, false, false, '价格信息', 5, '{"precision":2}'),
    ('c0000013-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000111', 'discountRate', 'number', '折扣率',   true, false, false, '价格信息', 6, '{}'),
    ('c0000013-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000111', 'discountAmount','number','折扣金额', true, false, false, '价格信息', 7, '{"precision":2}'),
    ('c0000013-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000111', 'totalAmount',  'number', '总价',     true, false, false, '价格信息', 8, '{"precision":2}'),
    ('c0000013-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000111', 'version',      'number', '版本',     true, false, false, '基本信息', 9, '{}'),
    ('c0000013-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000111', 'creatorName',  'text',   '创建者',   true, false, false, '用户信息', 10, '{}'),
    ('c0000013-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000111', 'creatorEmail', 'email',  '创建者邮箱',true, false, false, '用户信息', 11, '{}'),
    ('c0000013-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000111', 'issuedAt',     'date',   '签发日期', true, false, false, '时间信息', 12, '{}'),
    ('c0000013-0000-0000-0000-000000000013', 'b0000001-0000-0000-0000-000000000111', 'validUntil',   'date',   '有效期至', true, false, false, '时间信息', 13, '{}'),
    ('c0000013-0000-0000-0000-000000000014', 'b0000001-0000-0000-0000-000000000111', 'createdAt',    'date',   '创建时间', true, false, false, '系统信息', 14, '{}'),
    ('c0000013-0000-0000-0000-000000000015', 'b0000001-0000-0000-0000-000000000111', 'updatedAt',    'date',   '更新时间', true, false, false, '系统信息', 15, '{}'),
    ('c0000013-0000-0000-0000-000000000016', 'b0000001-0000-0000-0000-000000000111', 'products',     'json',   '产品明细', true, false, false, '产品明细', 16, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 6. 导入日志详情页 (import_log_detail)
-- page_id: b0000001-0000-0000-0000-000000000151
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000014-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000151', 'status',       'select', '状态',     true, false, false, '基本信息', 1, '{"optionsConfig":{"type":"static","options":[{"label":"完成","value":"completed"},{"label":"失败","value":"failed"}]}}'),
    ('c0000014-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000151', 'file_name',    'text',   '文件名',   true, false, false, '文件信息', 2, '{}'),
    ('c0000014-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000151', 'file_type',    'text',   '文件类型', true, false, false, '文件信息', 3, '{}'),
    ('c0000014-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000151', 'total_count',  'number', '总记录数', true, false, false, '导入统计', 4, '{}'),
    ('c0000014-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000151', 'imported_count','number','成功数',   true, false, false, '导入统计', 5, '{}'),
    ('c0000014-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000151', 'skipped_count','number', '跳过数',   true, false, false, '导入统计', 6, '{}'),
    ('c0000014-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000151', 'failed_count', 'number', '失败数',   true, false, false, '导入统计', 7, '{}'),
    ('c0000014-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000151', 'duration_ms',  'number', '耗时(ms)', true, false, false, '导入统计', 8, '{}'),
    ('c0000014-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000151', 'created_at',   'date',   '导入时间', true, false, false, '系统信息', 9, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- =============================================================================
-- PART 1.5: 补充 user_list 的 role/status 字段选项颜色
-- =============================================================================

-- 补充 user_list 页 role 字段的完整选项（含 color）
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000010', 'role', 'select', '角色', true, true, false, '基本信息', 4, '{"width": 120, "optionsConfig": {"type": "static", "options": [{"label": "超级管理员", "value": "super_admin", "color": "bg-purple-500"}, {"label": "系统管理员", "value": "admin", "color": "bg-blue-500"}, {"label": "企业管理员", "value": "enterprise_admin", "color": "bg-indigo-500"}, {"label": "产品厂家", "value": "manufacturer", "color": "bg-orange-500"}, {"label": "VIP会员", "value": "vip", "color": "bg-yellow-500"}, {"label": "付费会员", "value": "premium", "color": "bg-green-500"}, {"label": "免费用户", "value": "free", "color": "bg-gray-500"}, {"label": "待审核", "value": "pending", "color": "bg-red-500"}]}}'),
    ('c0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000010', 'status', 'select', '状态', true, true, false, '基本信息', 5, '{"width": 100, "optionsConfig": {"type": "static", "options": [{"label": "正常", "value": "active", "color": "bg-green-100 text-green-800"}, {"label": "已禁用", "value": "disabled", "color": "bg-red-100 text-red-800"}, {"label": "待审核", "value": "pending", "color": "bg-yellow-100 text-yellow-800"}]}}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    config = EXCLUDED.config;

-- =============================================================================
-- PART 2: 特殊功能页字段配置 (8 个页面)
-- =============================================================================

-- 7. 用户积分赠送页 (user_grant)
-- page_id: b0000001-0000-0000-0000-000000000012
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000015-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000012', 'pointsBalance',       'number', '积分余额',     true, false, false, '积分概况', 1, '{}'),
    ('c0000015-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000012', 'totalRechargedPoints','number','累计充值积分', true, false, false, '积分概况', 2, '{}'),
    ('c0000015-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000012', 'totalConsumedPoints','number', '累计消费积分', true, false, false, '积分概况', 3, '{}'),
    ('c0000015-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000012', 'tokenBalance',        'number', 'Token余额',   true, false, false, '积分概况', 4, '{}'),
    ('c0000015-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000012', 'amount',              'number', '调整数量',     true, true,  true,  '积分操作', 5, '{"helpText":"正数赠送，负数扣除"}'),
    ('c0000015-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000012', 'reason',              'text',   '原因备注',     true, true,  false, '积分操作', 6, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8. 字段权限配置页 (membership_field_perm)
-- page_id: b0000001-0000-0000-0000-000000000121
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000016-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000121', 'level',               'number', '等级',       true, false, false, '等级信息', 1, '{}'),
    ('c0000016-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000121', 'name',                'text',   '等级名称',   true, false, false, '等级信息', 2, '{}'),
    ('c0000016-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000121', 'requiredPoints',      'number', '所需积分',   true, false, false, '等级信息', 3, '{}'),
    ('c0000016-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000121', 'can_view_cost_price', 'switch','查看成本价', true, true,  false, '字段权限', 4, '{}'),
    ('c0000016-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000121', 'can_view_min_price',  'switch','查看最低价', true, true,  false, '字段权限', 5, '{}'),
    ('c0000016-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000121', 'can_view_manufacturer','switch','查看厂家', true, true, false, '字段权限', 6, '{}'),
    ('c0000016-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000121', 'can_view_contact',    'switch','查看联系人', true, true,  false, '字段权限', 7, '{}'),
    ('c0000016-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000121', 'can_view_phone',      'switch','查看电话',   true, true,  false, '字段权限', 8, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 9. 等级分布统计页 (membership_stats)
-- page_id: b0000001-0000-0000-0000-000000000122
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000017-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000122', 'totalUsers',      'number', '总用户数',     true, false, false, '概览', 1, '{}'),
    ('c0000017-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000122', 'vipAndAbove',     'number', 'VIP及以上',   true, false, false, '概览', 2, '{}'),
    ('c0000017-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000122', 'averageLevel',    'number', '平均等级',     true, false, false, '概览', 3, '{}'),
    ('c0000017-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000122', 'upgradeRate',     'number', '升级转化率',   true, false, false, '概览', 4, '{}'),
    ('c0000017-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000122', 'level',           'number', '等级',         true, false, false, '等级分布', 5, '{}'),
    ('c0000017-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000122', 'name',            'text',   '等级名称',     true, false, false, '等级分布', 6, '{}'),
    ('c0000017-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000122', 'count',           'number', '人数',         true, false, false, '等级分布', 7, '{}'),
    ('c0000017-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000122', 'percentage',      'number', '占比',         true, false, false, '等级分布', 8, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 10. 积分概览页 (points_overview)
-- page_id: b0000001-0000-0000-0000-000000000070
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000018-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000070', 'totalCount',  'number', '总流水数', true, false, false, '统计概览', 1, '{}'),
    ('c0000018-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000070', 'totalIn',     'number', '总收入',   true, false, false, '统计概览', 2, '{}'),
    ('c0000018-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000070', 'totalOut',    'number', '总支出',   true, false, false, '统计概览', 3, '{}'),
    ('c0000018-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000070', 'netFlow',     'number', '净流量',   true, false, false, '统计概览', 4, '{}'),
    ('c0000018-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000070', 'username',    'text',   '用户名',   true, false, false, '流水记录', 5, '{}'),
    ('c0000018-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000070', 'points',      'number', '积分变动', true, false, false, '流水记录', 6, '{}'),
    ('c0000018-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000070', 'type',        'select', '类型',     true, false, false, '流水记录', 7, '{"optionsConfig":{"type":"static","options":[{"label":"获取","value":"earn"},{"label":"消费","value":"consume"},{"label":"奖励","value":"reward"},{"label":"扣除","value":"deduct"},{"label":"管理员调整","value":"admin_adjust"},{"label":"注册赠送","value":"register"},{"label":"每日签到","value":"daily_sign"},{"label":"对话消费","value":"chat"},{"label":"报价消费","value":"quote"}]}}'),
    ('c0000018-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000070', 'description', 'text',   '描述',     true, false, false, '流水记录', 8, '{}'),
    ('c0000018-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000070', 'createdAt',   'date',   '时间',     true, false, false, '流水记录', 9, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 11. 动态配置管理页 (system_config)
-- page_id: b0000001-0000-0000-0000-000000000162
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000019-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000162', 'tab_name',    'text',   '配置项',   true, false, false, '配置管理', 1, '{}'),
    ('c0000019-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000162', 'item_count',  'number', '配置数量', true, false, false, '配置管理', 2, '{}'),
    ('c0000019-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000162', 'updated_at',  'date',   '最近更新', true, false, false, '系统信息', 3, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 12. 模块管理页 (module_list)
-- page_id: b0000001-0000-0000-0000-000000000090
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000020-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000090', 'module_key',   'text',   '模块标识', true, true,  true,  '模块信息', 1, '{}'),
    ('c0000020-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000090', 'name_zh',      'text',   '中文名称', true, true,  true,  '模块信息', 2, '{}'),
    ('c0000020-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000090', 'icon',         'text',   '图标',     true, true,  false, '模块信息', 3, '{}'),
    ('c0000020-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000090', 'route_path',   'text',   '路径',     true, true,  false, '模块信息', 4, '{}'),
    ('c0000020-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000090', 'sort_order',   'number', '排序',     true, true,  false, '模块信息', 5, '{}'),
    ('c0000020-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000090', 'is_enabled',   'switch', '状态',     true, true,  false, '模块信息', 6, '{}'),
    ('c0000020-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000090', 'group_label',  'select', '分组',     true, true,  false, '模块信息', 7, '{"optionsConfig":{"type":"static","options":[{"label":"核心业务","value":"核心业务"},{"label":"运营管理","value":"运营管理"},{"label":"内容管理","value":"内容管理"},{"label":"系统管理","value":"系统管理"},{"label":"其他","value":"其他"}]}}'),
    ('c0000020-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000090', 'page_count',   'number', '页面数',   true, false, false, '统计信息', 8, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 13. 全局搜索页 (global_search)
-- page_id: b0000001-0000-0000-0000-000000000206
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000021-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000206', 'keyword',      'text',   '搜索关键词', true, true, true,  '搜索', 1, '{"placeholder":"输入关键词搜索全库"}'),
    ('c0000021-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000206', 'library_type', 'select', '资料库类型', true, true, false, '筛选', 2, '{"optionsConfig":{"type":"static","options":[{"label":"全部","value":"all"},{"label":"价格库","value":"price"},{"label":"文档库","value":"document"},{"label":"案例库","value":"case"},{"label":"标准库","value":"standard"},{"label":"图纸库","value":"drawing"},{"label":"定额库","value":"quota"}]}}'),
    ('c0000021-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000206', 'results',      'json',   '搜索结果',   true, false, false, '结果', 3, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 14. 仪表盘页 (dashboard_main)
-- page_id: b0000001-0000-0000-0000-000000000001
INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config) VALUES
    ('c0000022-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'totalUsers',     'number', '总用户数',   true, false, false, '核心指标', 1, '{}'),
    ('c0000022-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'activeToday',    'number', '今日活跃',   true, false, false, '核心指标', 2, '{}'),
    ('c0000022-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000001', 'totalProducts',  'number', '产品总数',   true, false, false, '核心指标', 3, '{}'),
    ('c0000022-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000001', 'pendingQuotes',  'number', '待处理报价', true, false, false, '核心指标', 4, '{}'),
    ('c0000022-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000001', 'pendingAudit',   'number', '待审核',     true, false, false, '核心指标', 5, '{}')
ON CONFLICT (page_id, field_key) DO UPDATE SET
    field_type = EXCLUDED.field_type, label_zh = EXCLUDED.label_zh,
    is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable,
    is_required = EXCLUDED.is_required, group_name = EXCLUDED.group_name,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- =============================================================================
-- PART 3: 按钮配置 (所有 14 个页面)
-- =============================================================================

-- 1. 用户详情页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000009-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000011', 'edit',          '编辑',     '/api/admin/users/:id',     'PUT',    true, 'admin',  1, '{"position":"toolbar","icon":"Pencil"}'),
    ('d0000009-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000011', 'toggle_status', '启用/禁用', '/api/admin/users/:id/disable','POST', true, 'admin',  2, '{"position":"toolbar","icon":"Ban"}'),
    ('d0000009-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000011', 'grant_points',  '赠送积分', '/api/admin/users/:id/grant','POST',  true, 'admin',  3, '{"position":"toolbar","icon":"Coins"}'),
    ('d0000009-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000011', 'delete',        '删除',     '/api/admin/users/:id',     'DELETE', true, 'super_admin', 4, '{"position":"toolbar","icon":"Trash2","confirmMessage":"确定要删除该用户吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 2. 企业详情页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000010-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000021', 'edit',          '编辑',     '/api/admin/enterprise/:id', 'PUT',    true, 'admin',  1, '{"position":"toolbar","icon":"Pencil"}'),
    ('d0000010-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000021', 'toggle_status', '启用/禁用', '/api/admin/enterprise/:id', 'PUT',    true, 'admin',  2, '{"position":"toolbar","icon":"Ban"}'),
    ('d0000010-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000021', 'delete',        '删除',     '/api/admin/enterprise/:id', 'DELETE', true, 'super_admin', 3, '{"position":"toolbar","icon":"Trash2","confirmMessage":"确定要删除该企业吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 3. 审核详情页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000011-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000031', 'approve',       '通过',     '/api/admin/audit/:id/approve','POST',  true, 'admin',  1, '{"position":"toolbar","icon":"CheckCircle"}'),
    ('d0000011-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000031', 'reject',        '拒绝',     '/api/admin/audit/:id/reject', 'POST',  true, 'admin',  2, '{"position":"toolbar","icon":"XCircle","confirmMessage":"请输入拒绝原因"}'),
    ('d0000011-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000031', 'download_file', '下载文件', '/api/admin/audit/:id/download','GET',   true, 'admin',  3, '{"position":"toolbar","icon":"Download"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 4. 产品详情页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000012-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000102', 'edit',   '编辑', '/api/tables/products/:id', 'PATCH',  true, 'admin',  1, '{"position":"toolbar","icon":"Pencil"}'),
    ('d0000012-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000102', 'delete', '删除', '/api/tables/products/:id', 'DELETE', true, 'super_admin', 2, '{"position":"toolbar","icon":"Trash2","confirmMessage":"确定要删除该产品吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 5. 报价单详情页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000013-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000111', 'submit_review',  '提交审核', '/api/admin/quotes/:id',  'PUT', true, 'admin',       1, '{"position":"toolbar","icon":"Clock","showCondition":{"field":"status","operator":"eq","value":"draft"}}'),
    ('d0000013-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000111', 'approve',        '批准',     '/api/admin/quotes/:id',  'PUT', true, 'admin',       2, '{"position":"toolbar","icon":"CheckCircle","showCondition":{"field":"status","operator":"eq","value":"pending_review"}}'),
    ('d0000013-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000111', 'reject',         '拒绝',     '/api/admin/quotes/:id',  'PUT', true, 'admin',       3, '{"position":"toolbar","icon":"XCircle","showCondition":{"field":"status","operator":"eq","value":"pending_review"}}'),
    ('d0000013-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000111', 'send',           '发送',     '/api/admin/quotes/:id',  'PUT', true, 'admin',       4, '{"position":"toolbar","icon":"Send","showCondition":{"field":"status","operator":"eq","value":"approved"}}'),
    ('d0000013-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000111', 'delete',         '删除',     '/api/admin/quotes/:id',  'DELETE', true, 'super_admin', 5, '{"position":"toolbar","icon":"Trash2","confirmMessage":"确定要删除该报价单吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 6. 导入日志详情页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000014-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000151', 'delete', '删除', '/api/admin/import-logs/:id', 'DELETE', true, 'super_admin', 1, '{"position":"toolbar","icon":"Trash2","confirmMessage":"确定要删除该日志吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 7. 用户积分赠送页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000015-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000012', 'grant_100',   '赠送100', '/api/admin/users/:id/grant', 'POST', true, 'admin', 1, '{"position":"toolbar","preset":{"amount":100}}'),
    ('d0000015-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000012', 'grant_500',   '赠送500', '/api/admin/users/:id/grant', 'POST', true, 'admin', 2, '{"position":"toolbar","preset":{"amount":500}}'),
    ('d0000015-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000012', 'grant_1000',  '赠送1000','/api/admin/users/:id/grant', 'POST', true, 'admin', 3, '{"position":"toolbar","preset":{"amount":1000}}'),
    ('d0000015-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000012', 'deduct_100',  '扣除100', '/api/admin/users/:id/grant', 'POST', true, 'admin', 4, '{"position":"toolbar","preset":{"amount":-100}}'),
    ('d0000015-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000012', 'confirm',     '确认操作', '/api/admin/users/:id/grant', 'POST', true, 'admin', 5, '{"position":"toolbar","icon":"CheckCircle","confirmMessage":"确认执行该积分操作？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 8. 字段权限配置页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000016-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000121', 'save',   '保存更改', '/api/admin/membership/field-permissions', 'PUT',  true, 'super_admin', 1, '{"position":"toolbar","icon":"Save"}'),
    ('d0000016-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000121', 'reset',  '重置',     '/api/admin/membership/field-permissions/reset','POST',true, 'super_admin', 2, '{"position":"toolbar","icon":"RotateCcw","confirmMessage":"确定要重置所有字段权限吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 9. 等级分布统计页 (无按钮 - 纯展示)

-- 10. 积分概览页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000018-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000070', 'search',  '搜索',     '/api/admin/points/history', 'GET',  true, 'admin', 1, '{"position":"toolbar","icon":"Search"}'),
    ('d0000018-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000070', 'refresh', '刷新',     '/api/admin/points/overview', 'GET',  true, 'admin', 2, '{"position":"toolbar","icon":"RefreshCw"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 11. 动态配置管理页 (无标准按钮 - 由 Tab 组件管理)

-- 12. 模块管理页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000020-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000090', 'create', '新增模块', '/api/admin/config/modules',   'POST', true, 'super_admin', 1, '{"position":"toolbar","icon":"Plus","buttonType":"primary"}'),
    ('d0000020-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000090', 'edit',   '编辑',     '/api/admin/config/modules/:id','PUT',  true, 'super_admin', 2, '{"position":"row_action","icon":"Edit"}'),
    ('d0000020-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000090', 'delete', '删除',     '/api/admin/config/modules/:id','DELETE',true,'super_admin', 3, '{"position":"row_action","icon":"Trash2","confirmMessage":"确定要删除该模块吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 13. 全局搜索页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000021-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000206', 'search',  '搜索', '/api/admin/knowledge-center/search', 'GET', true, 'admin', 1, '{"position":"toolbar","icon":"Search","buttonType":"primary"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- 14. 仪表盘页按钮
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
    ('d0000022-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'refresh', '刷新数据', '/api/admin/dashboard', 'GET', true, 'admin', 1, '{"position":"toolbar","icon":"RefreshCw"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh, api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method, is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- =============================================================================
-- 完成提示
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '028 种子数据迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已配置页面字段: 14 个页面';
    RAISE NOTICE '  - 详情页: user_detail, enterprise_detail, audit_detail,';
    RAISE NOTICE '           product_detail, quote_detail, import_log_detail';
    RAISE NOTICE '  - 功能页: user_grant, membership_field_perm,';
    RAISE NOTICE '           membership_stats, points_overview,';
    RAISE NOTICE '           system_config, module_list,';
    RAISE NOTICE '           global_search, dashboard_main';
    RAISE NOTICE '已配置操作按钮: 13 个页面共 ~35 个按钮';
    RAISE NOTICE '========================================';
END $$;
