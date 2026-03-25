-- ============================================================================
-- 资料中心 - 动态配置系统注册
-- 将资料中心7大板块纳入 system_modules / system_pages / system_actions
-- 并初始化等级权限覆盖到 permission_overrides
--
-- 执行方式：复制此脚本到 Supabase Dashboard → SQL Editor 中执行
-- ============================================================================

-- ============================================================================
-- 1. 添加资料中心模块
-- ============================================================================
INSERT INTO system_modules (module_code, module_name, icon, path, sort_order, is_active)
SELECT 'knowledge_center', '资料中心', 'FolderOpen', '/admin/knowledge-center', 35, true
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE module_code = 'knowledge_center');

-- ============================================================================
-- 2. 添加7个子页面
-- ============================================================================
INSERT INTO system_pages (module_id, page_code, page_name, path, page_type, is_active, permission_code, sort_order)
SELECT
    sm.id,
    page.page_code,
    page.page_name,
    page.path,
    page.page_type,
    true,
    page.permission_code,
    page.sort_order
FROM system_modules sm
CROSS JOIN (VALUES
    ('product_price_library', '产品价格库', '/admin/knowledge-center/price-library', 'list', 'knowledge.price.view', 1),
    ('tech_doc_library',      '技术文档库', '/admin/knowledge-center/document-library', 'list', 'knowledge.doc.view', 2),
    ('case_library',          '案例库',     '/admin/knowledge-center/case-library', 'list', 'knowledge.case.view', 3),
    ('standard_library',      '标准规范库', '/admin/knowledge-center/standard-library', 'list', 'knowledge.standard.view', 4),
    ('drawing_library',      '图纸图片库', '/admin/knowledge-center/drawing-library', 'list', 'knowledge.drawing.view', 5),
    ('quota_library',        '定额库',     '/admin/knowledge-center/quota-library', 'list', 'knowledge.quota.view', 6),
    ('global_search',        '全局搜索',   '/admin/knowledge-center/global-search', 'search', 'knowledge.search', 7)
) AS page(page_code, page_name, path, page_type, permission_code, sort_order)
WHERE sm.module_code = 'knowledge_center'
  AND NOT EXISTS (SELECT 1 FROM system_pages sp WHERE sp.page_code = page.page_code);

-- ============================================================================
-- 3. 为每个板块配置操作按钮（全局搜索除外）
-- ============================================================================
INSERT INTO system_actions (page_id, action_code, action_name, action_type, button_type, icon, position, permission_code, is_active, sort_order)
SELECT
    sp.id,
    action.action_code,
    action.action_name,
    action.action_type,
    action.button_type,
    action.icon,
    action.position,
    action.permission_code,
    true,
    action.sort_order
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
CROSS JOIN (VALUES
    ('view',     '查看',   'api',    'default', 'Eye',     'table_row', 'knowledge.:type:.view',     1),
    ('download', '下载',   'api',    'default', 'Download','table_row', 'knowledge.:type:.download', 2),
    ('upload',   '上传',   'api',    'primary', 'Upload',  'toolbar',   'knowledge.:type:.upload',   3),
    ('edit',     '编辑',   'api',    'default', 'Edit',    'table_row', 'knowledge.:type:.edit',     4),
    ('delete',   '删除',   'api',    'danger',  'Trash2',  'table_row', 'knowledge.:type:.delete',   5)
) AS action(action_code, action_name, action_type, button_type, icon, position, permission_code, sort_order)
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
  AND NOT EXISTS (
      SELECT 1 FROM system_actions sa
      WHERE sa.page_id = sp.id AND sa.action_code = action.action_code
  );

-- ============================================================================
-- 4. 全局搜索只配查看按钮
-- ============================================================================
INSERT INTO system_actions (page_id, action_code, action_name, action_type, button_type, icon, position, permission_code, is_active, sort_order)
SELECT
    sp.id,
    'search',
    '搜索',
    'api',
    'primary',
    'Search',
    'toolbar',
    'knowledge.search',
    true,
    1
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code = 'global_search'
  AND NOT EXISTS (SELECT 1 FROM system_actions sa WHERE sa.page_id = sp.id AND sa.action_code = 'search');

-- ============================================================================
-- 5. 初始化等级权限覆盖（permission_overrides）
-- ============================================================================

-- 免费用户（等级1）：只能查看页面
INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '1', 'page', sp.page_code, true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible,
    is_editable = EXCLUDED.is_editable;

-- 普通会员（等级2）：查看 + 下载
INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '2', 'page', sp.page_code, true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '2', 'action', sp.page_code || '.download', true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

-- VIP会员（等级3）：查看 + 下载 + 上传
INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '3', 'page', sp.page_code, true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '3', 'action', sp.page_code || '.download', true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '3', 'action', sp.page_code || '.upload', true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

-- 企业用户（等级4）：全部权限（包含查看+下载+上传+编辑+删除，由继承等级3的权限+新增覆盖实现）
INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '4', 'action', sp.page_code || '.upload', true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '4', 'action', sp.page_code || '.edit', true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
SELECT 'level', '4', 'action', sp.page_code || '.delete', true, false, 20
FROM system_pages sp
JOIN system_modules sm ON sp.module_id = sm.id
WHERE sm.module_code = 'knowledge_center'
  AND sp.page_code != 'global_search'
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET
    is_visible = EXCLUDED.is_visible;

-- ============================================================================
-- 完成提示
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ 资料中心配置完成';
    RAISE NOTICE '  - 1 个模块（knowledge_center）';
    RAISE NOTICE '  - 7 个页面（产品价格库/技术文档库/案例库/标准规范库/图纸图片库/定额库/全局搜索）';
    RAISE NOTICE '  - 每个板块 5 个操作按钮（全局搜索 1 个）';
    RAISE NOTICE '  - 4 个等级的默认权限覆盖';
END;
$$;
