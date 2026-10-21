-- ============================================================
-- 迁移: 116_user_menu_structure_optimization
-- 说明: 用户前端菜单结构优化（#[20260830-USER-MENU-STRUCTURE]）
-- 目标: 严格按照目标菜单树调整 user_menus / user_pages：
--   👤 我的账户：个人资料 / 修改密码 / 积分明细 / 邀请好友 / 通知中心 / 资料中心
--   📄 报价管理：我的报价单 / 新建报价
--   📋 商务信息：供应方资料库 / 客户资料库 / 商务条款
--   📊 数据与统计：厂商支付排行 / 数据统计 / 最近记录
--   🎁 会员积分中心：会员中心 / 积分提现 / 积分商城 / Token充值 / 品牌推广
--   🔧 系统管理：管理后台（仅管理员）/ 设置 / 帮助
-- 要点:
--   1. 用户前端菜单实际存储于 user_menus / user_pages 表（由
--      /api/admin/config/query/user-menu 读取、前端 useUserMenuConfig 动态渲染），
--      不涉及 system_modules / system_pages（管理后台菜单表）
--   2. 合并「积分中心」(points_center_ext) + 「账户中心」(account_center)
--      → 「会员积分中心」(points_center)，子页迁移后删除空分组
--   3. 「管理资料」改名「资料中心」（保持 route_path / dialogKey 不变，
--      前端仍通过 dialogKey=knowledge 打开资料中心弹窗）
--   4. 管理后台仅管理员可见：沿用 permission_overrides 现有规则
--      （user_menu_page: admin = false，角色 free/vip/premium/contributor/
--       enterprise_admin/user），本迁移不改动权限规则；
--      super_admin / admin 无隐藏规则 → 默认可见
--   5. 图标全部使用前端 DynamicIcon 已支持的图标（Settings2 等未静态导入
--      会渲染占位符，故系统管理仍用 Settings）
-- 幂等性: 全部按 menu_key / page_key 精确匹配，可重复执行
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 合并积分/账户中心 → 会员积分中心（points_center）
-- ------------------------------------------------------------

-- 1.1 重命名 points_center_ext → points_center，改名「会员积分中心」
UPDATE user_menus SET
  menu_key   = 'points_center',
  name_zh    = '会员积分中心',
  name_en    = 'Points Center',
  icon       = 'Gift',
  sort_order = 5,
  updated_at = now()
WHERE menu_key = 'points_center_ext';

-- 1.2 将 account_center 子页面迁入 points_center
UPDATE user_pages SET
  menu_id    = (SELECT id FROM user_menus WHERE menu_key = 'points_center'),
  updated_at = now()
WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'account_center');

-- 1.3 重设 points_center 子页面排序与图标（目标顺序）
--     会员中心(1) / 积分提现(2) / 积分商城(3) / Token充值(4) / 品牌推广(5)
UPDATE user_pages SET sort_order = 1, icon = 'Star',       updated_at = now() WHERE page_key = 'membership' AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center');
UPDATE user_pages SET sort_order = 2, icon = 'CreditCard', updated_at = now() WHERE page_key = 'withdraw'   AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center');
UPDATE user_pages SET sort_order = 3, icon = 'Gift',       updated_at = now() WHERE page_key = 'mall'       AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center');
UPDATE user_pages SET sort_order = 4, icon = NULL,         updated_at = now() WHERE page_key = 'token'      AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center');
UPDATE user_pages SET sort_order = 5, icon = NULL,         updated_at = now() WHERE page_key = 'brand'      AND menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center');

-- 1.4 删除已空的 account_center 分组（校验无残留子页面）
DO $$
DECLARE
  v_leftover INT;
BEGIN
  SELECT count(*) INTO v_leftover FROM user_pages
  WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'account_center');
  IF v_leftover = 0 THEN
    DELETE FROM user_menus WHERE menu_key = 'account_center';
    RAISE NOTICE '[116] 已删除空分组 account_center';
  ELSE
    RAISE NOTICE '[116] account_center 仍有 % 个子页面，未删除', v_leftover;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. 「管理资料」改名「资料中心」
--    （保持 route_path / action_type / dialogKey=knowledge 不变）
-- ------------------------------------------------------------
UPDATE user_pages SET name_zh = '资料中心', updated_at = now()
WHERE page_key = 'contributor_upload';

-- ------------------------------------------------------------
-- 3. 分组排序统一（6 个业务域）
-- ------------------------------------------------------------
UPDATE user_menus SET sort_order = 1, updated_at = now() WHERE menu_key = 'my_account';
UPDATE user_menus SET sort_order = 2, updated_at = now() WHERE menu_key = 'quote_management';
UPDATE user_menus SET sort_order = 3, updated_at = now() WHERE menu_key = 'business_info';
UPDATE user_menus SET sort_order = 4, updated_at = now() WHERE menu_key = 'data_stats';
UPDATE user_menus SET sort_order = 5, updated_at = now() WHERE menu_key = 'points_center';
UPDATE user_menus SET sort_order = 6, icon = 'Settings', updated_at = now() WHERE menu_key = 'system_management';

-- 防御：清除历史残留的重复分组 key（重跑幂等）
DELETE FROM user_menus
WHERE menu_key IN ('account_center', 'points_center_ext');

-- ------------------------------------------------------------
-- 4. 校验输出
-- ------------------------------------------------------------
DO $$
DECLARE
  v_groups      INT;
  v_my_acc      INT;
  v_quotes      INT;
  v_biz         INT;
  v_stats       INT;
  v_points      INT;
  v_system      INT;
  v_admin_hidden INT;
  v_data_center INT;
BEGIN
  SELECT count(*) INTO v_groups FROM user_menus WHERE is_enabled = true AND is_visible = true;
  SELECT count(*) INTO v_my_acc FROM user_pages WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'my_account') AND is_enabled = true;
  SELECT count(*) INTO v_quotes FROM user_pages WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'quote_management') AND is_enabled = true;
  SELECT count(*) INTO v_biz    FROM user_pages WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'business_info') AND is_enabled = true;
  SELECT count(*) INTO v_stats  FROM user_pages WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'data_stats') AND is_enabled = true;
  SELECT count(*) INTO v_points FROM user_pages WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'points_center') AND is_enabled = true;
  SELECT count(*) INTO v_system FROM user_pages WHERE menu_id = (SELECT id FROM user_menus WHERE menu_key = 'system_management') AND is_enabled = true;
  SELECT count(*) INTO v_admin_hidden FROM permission_overrides
  WHERE permission_type = 'user_menu_page' AND permission_key = 'admin' AND is_visible = false;
  SELECT count(*) INTO v_data_center FROM user_pages WHERE page_key = 'contributor_upload' AND name_zh = '资料中心';

  RAISE NOTICE '============================================';
  RAISE NOTICE '[116] 用户菜单结构优化完成';
  RAISE NOTICE '  启用分组数: %（应为 6）', v_groups;
  RAISE NOTICE '  我的账户子页: %（应为 6）', v_my_acc;
  RAISE NOTICE '  报价管理子页: %（应为 2）', v_quotes;
  RAISE NOTICE '  商务信息子页: %（应为 3）', v_biz;
  RAISE NOTICE '  数据与统计子页: %（应为 3）', v_stats;
  RAISE NOTICE '  会员积分中心子页: %（应为 5）', v_points;
  RAISE NOTICE '  系统管理子页: %（应为 3）', v_system;
  RAISE NOTICE '  管理后台隐藏角色规则数: %（应为 6）', v_admin_hidden;
  RAISE NOTICE '  资料中心改名项: %（应为 1）', v_data_center;
  RAISE NOTICE '============================================';
END $$;

COMMIT;
