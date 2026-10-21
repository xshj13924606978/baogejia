-- ============================================================
-- 迁移: 110_orders_menu
-- 说明: 订单管理的菜单配置（管理端）
--   （#202608292700-阶段四-统一订单与后台管理）
-- 管理端新增模块：
--   1. 订单管理（/admin/orders：统一订单列表/详情/统计/退款/导出）
--   2. 交易配置（/admin/trade-config：交易配置中心）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 管理端菜单：订单管理
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000030-0000-0000-0000-000000000401', 'order_management', '订单管理', 'Orders',
  'Receipt', '/admin/orders', 91, true, true, NULL, '{}'::jsonb,
  '运营管理', '统一订单管理（充值/商城/会员/Token/品牌）', 'admin:orders'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES (
  'c0000030-0000-0000-0000-000000000402', 'c0000030-0000-0000-0000-000000000401', 'orders', '订单管理', '/admin/orders', 'default', true, '{}'::jsonb, 1
)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 订单管理 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000030-0000-0000-0000-000000000403', 'c0000030-0000-0000-0000-000000000402', 'refund', '退款操作', '/api/admin/orders/:orderNo/refund', 'POST', 'admin:orders', 1, now(), now()),
  ('c0000030-0000-0000-0000-000000000404', 'c0000030-0000-0000-0000-000000000402', 'export', '导出报表', '/api/admin/orders/export', 'GET', 'admin:orders', 2, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. 管理端菜单：交易配置
-- ------------------------------------------------------------
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES (
  'c0000030-0000-0000-0000-000000000411', 'trade_config_mgmt', '交易配置', 'Trade Config',
  'SlidersHorizontal', '/admin/trade-config', 94, true, true, NULL, '{}'::jsonb,
  '运营管理', '统一管理支付/积分/会员/Token/品牌等交易配置', 'admin:orders'
)
ON CONFLICT (module_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path,
  group_label = EXCLUDED.group_label, permission_code = EXCLUDED.permission_code,
  is_enabled = true, updated_at = NOW();

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
VALUES (
  'c0000030-0000-0000-0000-000000000412', 'c0000030-0000-0000-0000-000000000411', 'trade_config', '交易配置', '/admin/trade-config', 'default', true, '{}'::jsonb, 1
)
ON CONFLICT (id) DO UPDATE SET
  name_zh = EXCLUDED.name_zh, route_path = EXCLUDED.route_path, is_enabled = true, updated_at = NOW();

-- 交易配置 actions
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('c0000030-0000-0000-0000-000000000413', 'c0000030-0000-0000-0000-000000000412', 'update', '更新配置', '/api/admin/trade/config/:key', 'PUT', 'admin:orders', 1, now(), now())
ON CONFLICT (id) DO NOTHING;

COMMIT;
