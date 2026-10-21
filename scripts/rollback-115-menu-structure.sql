-- ============================================================
-- 回滚脚本: 115_menu_structure_optimization（菜单结构优化）
-- 用途: 若生产验证发现问题，执行本脚本恢复到迁移前状态
-- 数据基准: 2026-08-30 应用 115 前的 system_modules / system_pages 快照
-- 注意: 恢复后请人工复核菜单
-- ============================================================

BEGIN;

-- 1. 恢复模块分组/排序/可见性
UPDATE system_modules SET group_label = '核心业务', sort_order = 1  WHERE module_key = 'dashboard';
UPDATE system_modules SET group_label = '核心业务', sort_order = 2  WHERE module_key = 'users';
UPDATE system_modules SET group_label = '核心业务', sort_order = 3  WHERE module_key = 'enterprise';
UPDATE system_modules SET group_label = '核心业务', sort_order = 4  WHERE module_key = 'customer_management';
UPDATE system_modules SET group_label = '核心业务', sort_order = 5  WHERE module_key = 'audit';
UPDATE system_modules SET group_label = '核心业务', sort_order = 6  WHERE module_key = 'products';
UPDATE system_modules SET group_label = '核心业务', sort_order = 7  WHERE module_key = 'quotes';

UPDATE system_modules SET group_label = '运营管理', sort_order = 12 WHERE module_key = 'membership';
UPDATE system_modules SET group_label = '运营管理', sort_order = 20 WHERE module_key = 'points';
UPDATE system_modules SET group_label = '运营管理', sort_order = 42 WHERE module_key = 'import-logs';
UPDATE system_modules SET group_label = '运营管理', sort_order = 88 WHERE module_key = 'withdraw_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 89 WHERE module_key = 'mall_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 91 WHERE module_key = 'order_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 92 WHERE module_key = 'brand_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 94 WHERE module_key = 'trade_config_mgmt';

UPDATE system_modules SET group_label = '内容管理', sort_order = 35 WHERE module_key = 'knowledge-center';
UPDATE system_modules SET group_label = '内容管理', sort_order = 36, is_enabled = true, is_visible_in_menu = false WHERE module_key = 'knowledge';
UPDATE system_modules SET group_label = '内容管理', sort_order = 37, is_enabled = true WHERE module_key = 'contributor';

UPDATE system_modules SET group_label = '系统管理', sort_order = 30 WHERE module_key = 'stats';
UPDATE system_modules SET group_label = '系统管理', sort_order = 31, is_visible_in_menu = false WHERE module_key = 'analytics';
UPDATE system_modules SET group_label = '系统管理', sort_order = 50 WHERE module_key = 'system';

-- 2. 恢复被删除的模块（成员管理去重前的冗余模块）
INSERT INTO system_modules (id, module_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code)
VALUES
  ('c0000020-0000-0000-0000-000000000301', 'membership_management', '会员管理', 'Membership', 'Crown', 90, true, true, NULL, '{}'::jsonb, '运营管理', '会员套餐管理与会员用户查询', 'admin:membership'),
  ('c0000020-0000-0000-0000-000000000311', 'token_management',     'Token套餐', 'Token Packages', 'Zap', 91, true, true, NULL, '{}'::jsonb, '运营管理', 'Token套餐管理与购买记录', 'admin:token'),
  ('c0000020-0000-0000-0000-000000000331', 'brand_packages_mgmt',  '品牌套餐', 'Brand Packages', 'Megaphone', 93, true, true, NULL, '{}'::jsonb, '运营管理', '品牌推广套餐管理', 'admin:brand')
ON CONFLICT (id) DO NOTHING;

-- 3. 恢复页面归属与排序
UPDATE system_pages SET module_id = 'c0000020-0000-0000-0000-000000000301', sort_order = 1 WHERE page_key = 'membership_plans';
UPDATE system_pages SET module_id = 'c0000020-0000-0000-0000-000000000301', sort_order = 2 WHERE page_key = 'membership_users';
UPDATE system_pages SET module_id = 'c0000020-0000-0000-0000-000000000311', name_zh = '套餐管理', sort_order = 1 WHERE page_key = 'token_packages';
UPDATE system_pages SET module_id = 'c0000020-0000-0000-0000-000000000331', name_zh = '套餐管理', sort_order = 1 WHERE page_key = 'brand_packages';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'membership_stats';

UPDATE system_pages SET sort_order = 1 WHERE page_key = 'points_history';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'points_exchange_config';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'points_download_config';

UPDATE system_pages SET module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge'),    sort_order = 1 WHERE page_key = 'import_config';
UPDATE system_pages SET module_id = (SELECT id FROM system_modules WHERE module_key = 'contributor'),  sort_order = 1 WHERE page_key = 'contributor_uploads';

COMMIT;
