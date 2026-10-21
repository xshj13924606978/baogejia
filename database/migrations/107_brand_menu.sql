-- ============================================================
-- 迁移: 107_brand_menu
-- 说明: 品牌推广的菜单配置（管理端 + 用户端）
--   （#202608292600-阶段三-厂商付费推广）
-- 管理端新增模块：
--   1. 品牌管理（/admin/brand：品牌审核 + 付费记录）
--   2. 品牌套餐（/admin/brand/packages：套餐管理）
-- 用户端新增菜单项（user_menus/user_pages）：
--   「品牌推广」挂在「账户中心」分组下（入驻 + 管理 + 购买套餐）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 管理端菜单：品牌管理
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000020-0000-0000-0000-000000000321', 'brand_management', '品牌管理', 'Brand',
  'Store', '/admin/brand', 92, true, true, NULL, '{}'::jsonb,
  '运营管理', '品牌入驻审核与付费记录', 'admin:brand'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES
  ('c0000020-0000-0000-0000-000000000322', 'c0000020-0000-0000-0000-000000000321', 'brand_vendors', '品牌审核', '/admin/brand', 'default', true, '{}'::jsonb, 1),
  ('c0000020-0000-0000-0000-000000000323', 'c0000020-0000-0000-0000-000000000321', 'brand_payments', '付费记录', '/admin/brand/payments', 'default', true, '{}'::jsonb, 2)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 品牌审核 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000020-0000-0000-0000-000000000324', 'c0000020-0000-0000-0000-000000000322', 'approve', '审核通过', '/api/admin/brand/vendors/:id/approve', 'POST', 'admin:brand', 1, now(), now()),
  ('c0000020-0000-0000-0000-000000000325', 'c0000020-0000-0000-0000-000000000322', 'reject', '审核拒绝', '/api/admin/brand/vendors/:id/reject', 'POST', 'admin:brand', 2, now(), now()),
  ('c0000020-0000-0000-0000-000000000326', 'c0000020-0000-0000-0000-000000000322', 'suspend', '暂停品牌', '/api/admin/brand/vendors/:id/suspend', 'POST', 'admin:brand', 3, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. 管理端菜单：品牌套餐
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000020-0000-0000-0000-000000000331', 'brand_packages_mgmt', '品牌套餐', 'Brand Packages',
  'Megaphone', '/admin/brand/packages', 93, true, true, NULL, '{}'::jsonb,
  '运营管理', '品牌推广套餐管理', 'admin:brand'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES (
  'c0000020-0000-0000-0000-000000000332', 'c0000020-0000-0000-0000-000000000331', 'brand_packages', '套餐管理', '/admin/brand/packages', 'default', true, '{}'::jsonb, 1
)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 品牌套餐 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000020-0000-0000-0000-000000000333', 'c0000020-0000-0000-0000-000000000332', 'create', '新增套餐', '/api/admin/brand/packages', 'POST', 'admin:brand', 1, now(), now()),
  ('c0000020-0000-0000-0000-000000000334', 'c0000020-0000-0000-0000-000000000332', 'update', '更新套餐', '/api/admin/brand/packages/:id', 'PUT', 'admin:brand', 2, now(), now()),
  ('c0000020-0000-0000-0000-000000000335', 'c0000020-0000-0000-0000-000000000332', 'delete', '删除套餐', '/api/admin/brand/packages/:id', 'DELETE', 'admin:brand', 3, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. 用户端菜单：账户中心分组下新增「品牌推广」
-- ------------------------------------------------------------
INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, permission_code, config)
SELECT 'account_center', '账户中心', 'Account', 'Wallet', 6, true, true, '会员中心与Token充值', NULL, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'account_center');

INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, config)
SELECT
  m.id, 'brand', '品牌推广', 'Store', '/account/brand', 'navigate', true, true, 3, '{}'::jsonb
FROM user_menus m
WHERE m.menu_key = 'account_center'
ON CONFLICT (menu_id, page_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

COMMIT;
