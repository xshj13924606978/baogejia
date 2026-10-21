-- ============================================================
-- 迁移: 103_membership_token_menu
-- 说明: 会员 + Token 套餐的菜单配置（管理端 + 用户端）
--   （#202608292500-阶段二-会员与Token套餐）
-- 管理端新增模块：
--   1. 会员管理（/admin/membership：套餐管理 + 会员用户）
--   2. Token套餐（/admin/token：套餐管理）
-- 用户端新增菜单项（user_menus/user_pages）：
--   「会员中心」「Token充值」挂在「账户中心」分组下
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 管理端菜单：会员管理
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000020-0000-0000-0000-000000000301', 'membership_management', '会员管理', 'Membership',
  'Crown', '/admin/membership', 90, true, true, NULL, '{}'::jsonb,
  '运营管理', '会员套餐管理与会员用户查询', 'admin:membership'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES
  ('c0000020-0000-0000-0000-000000000302', 'c0000020-0000-0000-0000-000000000301', 'membership_plans', '套餐管理', '/admin/membership', 'default', true, '{}'::jsonb, 1),
  ('c0000020-0000-0000-0000-000000000303', 'c0000020-0000-0000-0000-000000000301', 'membership_users', '会员用户', '/admin/membership/users', 'default', true, '{}'::jsonb, 2)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 套餐管理 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000020-0000-0000-0000-000000000304', 'c0000020-0000-0000-0000-000000000302', 'create', '新增套餐', '/api/admin/membership/plans', 'POST', 'admin:membership', 1, now(), now()),
  ('c0000020-0000-0000-0000-000000000305', 'c0000020-0000-0000-0000-000000000302', 'update', '更新套餐', '/api/admin/membership/plans/:id', 'PUT', 'admin:membership', 2, now(), now()),
  ('c0000020-0000-0000-0000-000000000306', 'c0000020-0000-0000-0000-000000000302', 'delete', '删除套餐', '/api/admin/membership/plans/:id', 'DELETE', 'admin:membership', 3, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. 管理端菜单：Token套餐
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000020-0000-0000-0000-000000000311', 'token_management', 'Token套餐', 'Token Packages',
  'Zap', '/admin/token', 91, true, true, NULL, '{}'::jsonb,
  '运营管理', 'Token套餐管理与购买记录', 'admin:token'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES (
  'c0000020-0000-0000-0000-000000000312', 'c0000020-0000-0000-0000-000000000311', 'token_packages', '套餐管理', '/admin/token', 'default', true, '{}'::jsonb, 1
)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- Token 套餐 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000020-0000-0000-0000-000000000313', 'c0000020-0000-0000-0000-000000000312', 'create', '新增套餐', '/api/admin/token/packages', 'POST', 'admin:token', 1, now(), now()),
  ('c0000020-0000-0000-0000-000000000314', 'c0000020-0000-0000-0000-000000000312', 'update', '更新套餐', '/api/admin/token/packages/:id', 'PUT', 'admin:token', 2, now(), now()),
  ('c0000020-0000-0000-0000-000000000315', 'c0000020-0000-0000-0000-000000000312', 'delete', '删除套餐', '/api/admin/token/packages/:id', 'DELETE', 'admin:token', 3, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. 用户端菜单：账户中心分组下新增「会员中心」「Token充值」
-- ------------------------------------------------------------
INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, permission_code, config)
SELECT 'account_center', '账户中心', 'Account', 'Wallet', 6, true, true, '会员中心与Token充值', NULL, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'account_center');

INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, config)
SELECT
  m.id, 'membership', '会员中心', 'Crown', '/account/membership', 'navigate', true, true, 1, '{}'::jsonb
FROM user_menus m
WHERE m.menu_key = 'account_center'
ON CONFLICT (menu_id, page_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, config)
SELECT
  m.id, 'token', 'Token充值', 'Zap', '/account/token', 'navigate', true, true, 2, '{}'::jsonb
FROM user_menus m
WHERE m.menu_key = 'account_center'
ON CONFLICT (menu_id, page_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

COMMIT;
