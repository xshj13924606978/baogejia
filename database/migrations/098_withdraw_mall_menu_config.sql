-- ============================================================
-- 迁移: 098_withdraw_mall_menu_config
-- 说明: 积分提现 + 积分商城 的菜单配置（管理端 + 用户端）
--       + 积分流水新类型（withdraw / withdraw_refund / mall_exchange）
--   （#202608292400-阶段一-积分提现与积分商城）
-- 管理端新增模块：
--   1. 提现管理（/admin/withdraw，页面「提现审核」）
--   2. 积分商城（/admin/mall，页面「商品管理」+「兑换记录」）
-- 用户端新增菜单项（user_menus/user_pages）：
--   「积分提现」「积分商城」挂在「积分中心」分组下
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 积分流水新类型（提现扣减/提现退款/商城兑换）
-- ------------------------------------------------------------
INSERT INTO point_log_types (type_code, type_name, category, badge_class, icon_name, display_order, is_active, is_reversible, is_editable, is_deletable, description)
VALUES
  ('withdraw',         '提现扣减',   'consume', 'bg-violet-100 text-violet-700', 'banknote',     51, true, true,  false, false, '积分提现申请扣减'),
  ('withdraw_refund',  '提现退回',   'reward',  'bg-violet-100 text-violet-700', 'rotate-ccw',   22, true, false, false, false, '提现被拒绝/失败退还积分'),
  ('mall_exchange',    '商城兑换',   'consume', 'bg-amber-100 text-amber-700',   'shopping-bag', 52, true, true,  false, false, '积分商城兑换消费')
ON CONFLICT (type_code) DO UPDATE SET
  type_name     = EXCLUDED.type_name,
  category      = EXCLUDED.category,
  badge_class   = EXCLUDED.badge_class,
  icon_name     = EXCLUDED.icon_name,
  display_order = EXCLUDED.display_order,
  is_reversible = EXCLUDED.is_reversible,
  description   = EXCLUDED.description,
  updated_at    = NOW();

-- ------------------------------------------------------------
-- 2. 管理端菜单：提现管理
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000020-0000-0000-0000-000000000201', 'withdraw_management', '提现管理', 'Withdraw',
  'Banknote', '/admin/withdraw', 88, true, true, NULL, '{}'::jsonb,
  '运营管理', '积分提现审核与打款', 'admin:withdraw'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES (
  'c0000020-0000-0000-0000-000000000202',
  'c0000020-0000-0000-0000-000000000201', 'withdraw_list', '提现审核', '/admin/withdraw',
  'default', true, '{}'::jsonb, 1
)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 提现页 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000020-0000-0000-0000-000000000203', 'c0000020-0000-0000-0000-000000000202', 'approve', '审核通过', '/api/admin/withdraw/approve', 'POST', 'admin:withdraw', 1, now(), now()),
  ('c0000020-0000-0000-0000-000000000204', 'c0000020-0000-0000-0000-000000000202', 'reject',  '审核拒绝', '/api/admin/withdraw/reject',  'POST', 'admin:withdraw', 2, now(), now()),
  ('c0000020-0000-0000-0000-000000000205', 'c0000020-0000-0000-0000-000000000202', 'pay',     '确认打款', '/api/admin/withdraw/pay',     'POST', 'admin:withdraw', 3, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. 管理端菜单：积分商城
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000020-0000-0000-0000-000000000211', 'mall_management', '积分商城', 'Points Mall',
  'ShoppingBag', '/admin/mall', 89, true, true, NULL, '{}'::jsonb,
  '运营管理', '积分商城商品管理与兑换交付', 'admin:mall'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES
  ('c0000020-0000-0000-0000-000000000212', 'c0000020-0000-0000-0000-000000000211', 'mall_products', '商品管理', '/admin/mall', 'default', true, '{}'::jsonb, 1),
  ('c0000020-0000-0000-0000-000000000213', 'c0000020-0000-0000-0000-000000000211', 'mall_exchanges', '兑换记录', '/admin/mall/exchanges', 'default', true, '{}'::jsonb, 2)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 商品管理 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000020-0000-0000-0000-000000000214', 'c0000020-0000-0000-0000-000000000212', 'create', '新增商品', '/api/admin/mall/products', 'POST', 'admin:mall', 1, now(), now()),
  ('c0000020-0000-0000-0000-000000000215', 'c0000020-0000-0000-0000-000000000212', 'update', '更新商品', '/api/admin/mall/products/:id', 'PUT', 'admin:mall', 2, now(), now()),
  ('c0000020-0000-0000-0000-000000000216', 'c0000020-0000-0000-0000-000000000212', 'delete', '删除商品', '/api/admin/mall/products/:id', 'DELETE', 'admin:mall', 3, now(), now()),
  ('c0000020-0000-0000-0000-000000000217', 'c0000020-0000-0000-0000-000000000213', 'deliver', '确认发货', '/api/admin/mall/exchanges/:id/deliver', 'POST', 'admin:mall', 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4. 用户端菜单：积分中心分组下新增「积分提现」「积分商城」
-- ------------------------------------------------------------
-- 找到「积分中心」分组（points 相关 user_menu）
INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, permission_code, config)
SELECT 'points_center_ext', '积分中心', 'Points', 'Coins', 5, true, true, '积分提现与积分商城', NULL, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'points_center_ext');

INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, config)
SELECT
  m.id, 'withdraw', '积分提现', 'Banknote', '/account/withdraw', 'navigate', true, true, 1, '{}'::jsonb
FROM user_menus m
WHERE m.menu_key = 'points_center_ext'
ON CONFLICT (menu_id, page_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, config)
SELECT
  m.id, 'mall', '积分商城', 'ShoppingBag', '/account/mall', 'navigate', true, true, 2, '{}'::jsonb
FROM user_menus m
WHERE m.menu_key = 'points_center_ext'
ON CONFLICT (menu_id, page_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

COMMIT;
