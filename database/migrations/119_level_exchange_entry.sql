-- ============================================================
-- 迁移: 119_level_exchange_entry
-- 说明: 用户菜单新增「权限升级」入口（#[202608302800] P0-2）
-- 背景: 等级兑换接口 /api/user/level/exchange 此前无任何可达入口：
--       PermissionPanel 组件未被任何页面引用（user-sidebar 亦为未挂载死代码），
--       用户无法触达积分兑换等级功能。
-- 方案:
--   1. 在「会员积分中心」(points_center) 分组下新增子页「权限升级」，
--      route_path = '/account/permissions'，action_type = 'navigate'
--      （前端 UserMenu → handleNavigation → window.location.href）
--   2. 对应页面：src/app/account/permissions/page.tsx（复用 AccountPageLayout）
--   3. 同时为兼容保留在 user-sidebar 中挂载 PermissionPanel（#202608302800）
-- 幂等性: 按 (menu_id, page_key) 精确 upsert，可重复执行
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 新增「权限升级」子页
-- ------------------------------------------------------------
-- 防御：分组缺失时按 103 迁移的定义补建 points_center
INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, permission_code, config)
SELECT 'points_center', '会员积分中心', 'Points Center', 'Gift', 5, true, true, '会员、积分与权限升级', NULL, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'points_center');

INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, config)
SELECT
  -- icon 使用 DynamicIcon 已静态导入的 Shield（ArrowUpCircle 等未导入会渲染占位符）
  m.id, 'permission_upgrade', '权限升级', 'Shield', '/account/permissions', 'navigate', true, true, 6, '{}'::jsonb
FROM user_menus m
WHERE m.menu_key = 'points_center'
ON CONFLICT (menu_id, page_key) DO UPDATE SET
  name_zh    = EXCLUDED.name_zh,
  icon       = EXCLUDED.icon,
  route_path = EXCLUDED.route_path,
  action_type = EXCLUDED.action_type,
  is_enabled = true,
  is_visible = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- ------------------------------------------------------------
-- 2. 校验输出
-- ------------------------------------------------------------
DO $$
DECLARE
  v_entry INT;
  v_points INT;
BEGIN
  SELECT count(*) INTO v_entry FROM user_pages
  WHERE page_key = 'permission_upgrade'
    AND route_path = '/account/permissions'
    AND action_type = 'navigate'
    AND is_enabled = true;
  SELECT count(*) INTO v_points FROM user_pages
  WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center')
    AND is_enabled = true;

  RAISE NOTICE '============================================';
  RAISE NOTICE '[119] 等级兑换入口（权限升级）注册完成';
  RAISE NOTICE '  权限升级入口: %（应为 1）', v_entry;
  RAISE NOTICE '  会员积分中心子页: %（应为 6）', v_points;
  RAISE NOTICE '============================================';
END $$;

COMMIT;
