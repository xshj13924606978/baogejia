-- ============================================================
-- 回滚脚本: 116_user_menu_structure_optimization（用户前端菜单结构优化）
-- 用途: 若生产验证发现问题，执行本脚本恢复到迁移前状态
-- 数据基准: 2026-08-30 应用 116 前的 user_menus / user_pages 快照
-- 注意: 恢复后请人工复核菜单
-- ============================================================

BEGIN;

-- 1. 重建「账户中心」分组（迁移 103 原配置）
INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, permission_code, config)
SELECT 'account_center', '账户中心', 'Account', 'Wallet', 6, true, true, '会员中心与Token充值', NULL, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'account_center');

-- 2. 「会员积分中心」改回「积分中心」(points_center_ext)
UPDATE user_menus SET
  menu_key   = 'points_center_ext',
  name_zh    = '积分中心',
  name_en    = 'Points',
  icon       = 'Coins',
  sort_order = 5,
  updated_at = now()
WHERE menu_key = 'points_center';

-- 3. 会员中心/Token充值/品牌推广迁回「账户中心」并还原图标与排序
UPDATE user_pages SET
  menu_id    = (SELECT id FROM user_menus WHERE menu_key = 'account_center'),
  sort_order = 1, icon = 'Crown',
  updated_at = now()
WHERE page_key = 'membership';

UPDATE user_pages SET
  menu_id    = (SELECT id FROM user_menus WHERE menu_key = 'account_center'),
  sort_order = 2, icon = 'Zap',
  updated_at = now()
WHERE page_key = 'token';

UPDATE user_pages SET
  menu_id    = (SELECT id FROM user_menus WHERE menu_key = 'account_center'),
  sort_order = 3, icon = 'Store',
  updated_at = now()
WHERE page_key = 'brand';

-- 4. 还原「积分中心」子页图标与排序（积分提现/积分商城）
UPDATE user_pages SET sort_order = 1, icon = 'Banknote',    updated_at = now() WHERE page_key = 'withdraw' AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center_ext');
UPDATE user_pages SET sort_order = 2, icon = 'ShoppingBag', updated_at = now() WHERE page_key = 'mall'     AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center_ext');

-- 5. 「资料中心」改回「管理资料」
UPDATE user_pages SET name_zh = '管理资料', updated_at = now() WHERE page_key = 'contributor_upload';

-- 6. 系统管理排序还原为 5
UPDATE user_menus SET sort_order = 5, updated_at = now() WHERE menu_key = 'system_management';

COMMIT;
