-- =============================================================================
-- 041_chat_brand_compare_config.sql
-- 为智能对话(chat)模块新增品牌对比页面和"选用此产品"按钮配置
-- 关联功能：品牌对比卡片中点击展开→选用此产品→添加到报价表→导出打印
-- 执行时间：2026/04/02
-- =============================================================================

-- ============================================================================
-- 1. 为 chat 模块新增"品牌对比"页面
-- ============================================================================

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, sort_order, config)
SELECT
    'b0000001-0000-0000-0000-000000000300',
    sm.id,
    'brand_compare',
    '品牌对比',
    '/admin/chat/brand-compare',
    'detail',
    true,
    1,
    '{"description":"品牌对比卡片 - 用户询价后展示多品牌产品对比，支持选用产品生成报价表","type":"feature"}'
FROM system_modules sm
WHERE sm.module_key = 'chat'
ON CONFLICT (module_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    route_path = EXCLUDED.route_path,
    config = EXCLUDED.config;

-- ============================================================================
-- 2. 为品牌对比页面注册"选用此产品"操作按钮
-- ============================================================================

INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config)
SELECT
    'd0000041-0000-0000-0000-000000000001',
    sp.id,
    'select_product',
    '选用此产品',
    '/api/messages',
    'PATCH',
    true,
    'chat.brand_compare',
    1,
    '{"icon":"Check","position":"card_action","buttonType":"primary","confirmMessage":null,"description":"点击展开品牌对比卡片后，选用该产品添加到报价表"}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, action_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    api_endpoint = EXCLUDED.api_endpoint,
    http_method = EXCLUDED.http_method,
    is_visible = EXCLUDED.is_visible,
    permission_required = EXCLUDED.permission_required,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config;

-- ============================================================================
-- 3. 为品牌对比页面补充字段配置（用于管理后台展示对比卡片中的产品信息）
-- ============================================================================

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000001',
    sp.id,
    'brand',
    'text',
    '品牌',
    true, false, false,
    '产品信息',
    1,
    '{"width":120}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000002',
    sp.id,
    'model',
    'text',
    '型号',
    true, false, false,
    '产品信息',
    2,
    '{"width":150}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000003',
    sp.id,
    'price',
    'number',
    '参考价',
    true, false, false,
    '价格信息',
    3,
    '{"width":100,"format":"currency"}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000004',
    sp.id,
    'parameter_description',
    'textarea',
    '参数描述',
    true, false, false,
    '产品信息',
    4,
    '{"width":250}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000005',
    sp.id,
    'confidence',
    'number',
    '匹配置信度',
    true, false, false,
    '匹配信息',
    5,
    '{"width":100,"format":"percent"}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000006',
    sp.id,
    'is_recommended',
    'switch',
    '推荐',
    true, false, false,
    '匹配信息',
    6,
    '{"width":80}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

INSERT INTO system_fields (id, page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config)
SELECT
    'c0000041-0000-0000-0000-000000000007',
    sp.id,
    'supplier',
    'text',
    '供应商',
    true, false, false,
    '供应商信息',
    7,
    '{"width":150}'
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_key = 'chat' AND sp.page_key = 'brand_compare'
ON CONFLICT (page_id, field_key) DO UPDATE SET
    label_zh = EXCLUDED.label_zh, field_type = EXCLUDED.field_type,
    is_visible = EXCLUDED.is_visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config;

-- ============================================================================
-- 完成提示
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '041 迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已新增:';
    RAISE NOTICE '  system_pages: brand_compare (品牌对比页面)';
    RAISE NOTICE '  system_actions: select_product (选用此产品按钮)';
    RAISE NOTICE '  system_fields: brand, model, price, parameter_description, confidence, is_recommended, supplier';
    RAISE NOTICE '所属模块: chat (智能对话)';
    RAISE NOTICE '========================================';
END $$;
