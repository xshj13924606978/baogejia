-- =============================================================================
-- 036_user_menu_knowledge.sql
-- 在用户端菜单(user_menus/user_pages)中添加"资料中心"分组及子页面
-- 执行时间：2026-03-29
-- =============================================================================

-- 1. 添加"资料中心"菜单分组
INSERT INTO user_menus (id, menu_key, name_zh, icon, sort_order, is_enabled, is_visible)
VALUES (
  'd0000001-0000-0000-0000-000000000001',
  'knowledge_center',
  '资料中心',
  'BookOpen',
  20,
  true,
  true
)
ON CONFLICT (menu_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_enabled = EXCLUDED.is_enabled,
  is_visible = EXCLUDED.is_visible;

-- 2. 获取资料中心的 menu_id
DO $$
DECLARE
  v_menu_id UUID;
BEGIN
  SELECT id INTO v_menu_id FROM user_menus WHERE menu_key = 'knowledge_center' LIMIT 1;
  IF v_menu_id IS NULL THEN
    RAISE EXCEPTION '资料中心菜单未找到';
  END IF;

  -- 3. 添加子页面
  INSERT INTO user_pages (id, menu_id, page_key, name_zh, sort_order, is_enabled, is_visible, route_path, config) VALUES
    ('e0000001-0000-0000-0000-000000000001', v_menu_id, 'knowledge_documents', '技术文档库', 1, true, true, '/knowledge-center?type=document', '{"icon":"FileText"}'),
    ('e0000001-0000-0000-0000-000000000002', v_menu_id, 'knowledge_cases',      '案例库',     2, true, true, '/knowledge-center?type=case',     '{"icon":"Briefcase"}'),
    ('e0000001-0000-0000-0000-000000000003', v_menu_id, 'knowledge_standards', '标准规范库', 3, true, true, '/knowledge-center?type=standard', '{"icon":"BookMarked"}'),
    ('e0000001-0000-0000-0000-000000000004', v_menu_id, 'knowledge_drawings',  '图纸图片库', 4, true, true, '/knowledge-center?type=drawing',  '{"icon":"Image"}'),
    ('e0000001-0000-0000-0000-000000000005', v_menu_id, 'knowledge_quotas',    '定额库',     5, true, true, '/knowledge-center?type=quota',    '{"icon":"Calculator"}'),
    ('e0000001-0000-0000-0000-000000000006', v_menu_id, 'knowledge_my_uploads','我的上传',   6, true, true, '/knowledge-center?tab=my-uploads',  '{"icon":"UploadCloud"}')
  ON CONFLICT (menu_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    is_visible = EXCLUDED.is_visible,
    route_path = EXCLUDED.route_path,
    config = EXCLUDED.config;
END
$$;
