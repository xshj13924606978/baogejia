-- ============================================================
-- 迁移: 115_menu_structure_optimization
-- 说明: 管理后台菜单结构优化（#[20260830-MENU-STRUCTURE]）
-- 目标: 严格按照目标菜单树调整 system_modules / system_pages：
--   🎯 核心业务：仪表盘 / 用户管理 / 企业用户管理 / 客户管理 / 产品管理 / 报价管理
--   👑 运营管理：会员管理 / 积分管理 / 提现管理 / 积分商城 / 订单管理 / 品牌管理 / 交易配置
--   📋 内容管理：资料中心 / 内容审核
--   ⚙️ 系统管理：数据统计 / 数据分析 / 系统设置
-- 要点:
--   1. 现有模块（withdraw_management / mall_management / order_management /
--      brand_management / trade_config_mgmt）已存在，只调整 group_label 与 sort_order，
--      不重复插入（原需求脚本中的 module_key 命名与本库实际命名不同，直接执行会重复）
--   2. 合并冗余/重复模块（先迁移子页面，再删除空模块）：
--      - membership_management → membership（套餐管理、会员用户移入）
--      - token_management     → membership（Token套餐移入，改名）
--      - brand_packages_mgmt  → brand_management（品牌套餐移入，改名）
--      - knowledge            → knowledge-center（导入配置移入）
--      - contributor          → knowledge-center（资料贡献移入）
--   3. 调整子页面 sort_order，使各模块子菜单顺序与目标树一致
--   4. 数据分析（analytics）恢复菜单可见（目标树系统管理含「数据分析」）
-- 幂等性: 全部按 module_key / page_key 精确匹配，可重复执行
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 模块分组与排序（system_modules）
-- ------------------------------------------------------------

-- 🎯 核心业务
UPDATE system_modules SET group_label = '核心业务', sort_order = 1  WHERE module_key = 'dashboard';
UPDATE system_modules SET group_label = '核心业务', sort_order = 2  WHERE module_key = 'users';
UPDATE system_modules SET group_label = '核心业务', sort_order = 3  WHERE module_key = 'enterprise';
UPDATE system_modules SET group_label = '核心业务', sort_order = 4  WHERE module_key = 'customer_management';
UPDATE system_modules SET group_label = '核心业务', sort_order = 5  WHERE module_key = 'products';
UPDATE system_modules SET group_label = '核心业务', sort_order = 6  WHERE module_key = 'quotes';

-- 👑 运营管理
UPDATE system_modules SET group_label = '运营管理', sort_order = 10 WHERE module_key = 'membership';
UPDATE system_modules SET group_label = '运营管理', sort_order = 11 WHERE module_key = 'points';
UPDATE system_modules SET group_label = '运营管理', sort_order = 12 WHERE module_key = 'withdraw_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 13 WHERE module_key = 'mall_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 14 WHERE module_key = 'order_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 15 WHERE module_key = 'brand_management';
UPDATE system_modules SET group_label = '运营管理', sort_order = 16 WHERE module_key = 'trade_config_mgmt';

-- 📋 内容管理（audit 由核心业务移入）
UPDATE system_modules SET group_label = '内容管理', sort_order = 20 WHERE module_key = 'knowledge-center';
UPDATE system_modules SET group_label = '内容管理', sort_order = 21 WHERE module_key = 'audit';

-- ⚙️ 系统管理
UPDATE system_modules SET group_label = '系统管理', sort_order = 30 WHERE module_key = 'stats';
UPDATE system_modules SET group_label = '系统管理', sort_order = 31 WHERE module_key = 'analytics';
UPDATE system_modules SET group_label = '系统管理', sort_order = 32 WHERE module_key = 'system';

-- 数据分析恢复菜单可见（目标树系统管理含「数据分析」）
UPDATE system_modules SET is_visible_in_menu = true WHERE module_key = 'analytics';

-- ------------------------------------------------------------
-- 2. 会员管理合并（去重：只保留 membership）
--    目标子菜单：等级权限配置 / 等级分布 / 套餐管理 / Token套餐 / 会员用户
-- ------------------------------------------------------------

-- 2.1 等级分布排序调整（1 → 2，等级权限配置保持 1）
UPDATE system_pages SET sort_order = 2, updated_at = now()
WHERE page_key = 'membership_stats';

-- 2.2 套餐管理（membership_management → membership）
UPDATE system_pages SET
  module_id  = (SELECT id FROM system_modules WHERE module_key = 'membership'),
  sort_order = 3,
  updated_at = now()
WHERE page_key = 'membership_plans';

-- 2.3 Token套餐（token_management → membership，改名）
UPDATE system_pages SET
  module_id  = (SELECT id FROM system_modules WHERE module_key = 'membership'),
  page_key   = 'token_packages',
  name_zh    = 'Token套餐',
  sort_order = 4,
  updated_at = now()
WHERE page_key = 'token_packages';

-- 2.4 会员用户（membership_management → membership）
UPDATE system_pages SET
  module_id  = (SELECT id FROM system_modules WHERE module_key = 'membership'),
  sort_order = 5,
  updated_at = now()
WHERE page_key = 'membership_users';

-- 2.5 删除已合并的重复/空模块（子页面已全部移走，级联无副作用）
DELETE FROM system_modules WHERE module_key IN ('membership_management', 'token_management');

-- ------------------------------------------------------------
-- 3. 积分管理子菜单排序
--    目标顺序：积分规则管理 / 积分流水 / 积分兑换配置 / 积分扣费配置
--    （points_rules_list 保持 sort_order = 1）
-- ------------------------------------------------------------
UPDATE system_pages SET sort_order = 2, updated_at = now() WHERE page_key = 'points_history';
UPDATE system_pages SET sort_order = 3, updated_at = now() WHERE page_key = 'points_exchange_config';
UPDATE system_pages SET sort_order = 4, updated_at = now() WHERE page_key = 'points_download_config';

-- ------------------------------------------------------------
-- 4. 品牌管理合并
--    目标子菜单：品牌审核 / 付费记录 / 品牌套餐
-- ------------------------------------------------------------

-- 品牌套餐（brand_packages_mgmt → brand_management，改名）
UPDATE system_pages SET
  module_id  = (SELECT id FROM system_modules WHERE module_key = 'brand_management'),
  page_key   = 'brand_packages',
  name_zh    = '品牌套餐',
  sort_order = 3,
  updated_at = now()
WHERE page_key = 'brand_packages';

-- 删除已合并的空模块
DELETE FROM system_modules WHERE module_key = 'brand_packages_mgmt';

-- ------------------------------------------------------------
-- 5. 资料中心合并
--    目标子菜单：技术文档库 / 案例库 / 标准规范库 / 图纸图片库 /
--               定额库 / 全局搜索 / 导入配置 / 资料贡献
--    （document/case/standard/drawing/quota/global_search 页面已归属 knowledge-center）
-- ------------------------------------------------------------

-- 5.1 导入配置（knowledge → knowledge-center）
UPDATE system_pages SET
  module_id  = (SELECT id FROM system_modules WHERE module_key = 'knowledge-center'),
  sort_order = 8,
  updated_at = now()
WHERE page_key = 'import_config';

-- 5.2 资料贡献（contributor → knowledge-center）
UPDATE system_pages SET
  module_id  = (SELECT id FROM system_modules WHERE module_key = 'knowledge-center'),
  sort_order = 9,
  updated_at = now()
WHERE page_key = 'contributor_uploads';

-- 5.3 禁用已合并的空模块（保留数据便于回溯，不删除）
UPDATE system_modules SET is_enabled = false, updated_at = now()
WHERE module_key IN ('knowledge', 'contributor');

-- ------------------------------------------------------------
-- 6. 校验输出
-- ------------------------------------------------------------
DO $$
DECLARE
  v_core     INT;  -- 核心业务模块数
  v_ops      INT;  -- 运营管理模块数
  v_content  INT;  -- 内容管理模块数
  v_system   INT;  -- 系统管理模块数
  v_mem_pages INT; -- 会员管理子页数
  v_brand_pages INT; -- 品牌管理子页数
  v_kc_pages   INT; -- 资料中心子页数
  v_dup_membership INT; -- 会员管理重复数
  v_disabled INT;  -- 禁用模块数
BEGIN
  SELECT count(*) INTO v_core     FROM system_modules WHERE is_enabled = true AND group_label = '核心业务';
  SELECT count(*) INTO v_ops      FROM system_modules WHERE is_enabled = true AND group_label = '运营管理';
  SELECT count(*) INTO v_content  FROM system_modules WHERE is_enabled = true AND group_label = '内容管理';
  SELECT count(*) INTO v_system   FROM system_modules WHERE is_enabled = true AND group_label = '系统管理';
  SELECT count(*) INTO v_mem_pages FROM system_pages WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'membership') AND is_enabled = true;
  SELECT count(*) INTO v_brand_pages FROM system_pages WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'brand_management') AND is_enabled = true;
  SELECT count(*) INTO v_kc_pages  FROM system_pages WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge-center') AND is_enabled = true;
  SELECT count(*) INTO v_dup_membership FROM system_modules WHERE is_enabled = true AND name_zh = '会员管理';
  SELECT count(*) INTO v_disabled FROM system_modules WHERE is_enabled = false AND module_key IN ('knowledge', 'contributor');

  RAISE NOTICE '============================================';
  RAISE NOTICE '[115] 菜单结构优化完成';
  RAISE NOTICE '  核心业务模块数: %', v_core;
  RAISE NOTICE '  运营管理模块数: %', v_ops;
  RAISE NOTICE '  内容管理模块数: %', v_content;
  RAISE NOTICE '  系统管理模块数: %', v_system;
  RAISE NOTICE '  会员管理子页数: %', v_mem_pages;
  RAISE NOTICE '  品牌管理子页数: %', v_brand_pages;
  RAISE NOTICE '  资料中心子页数: %', v_kc_pages;
  RAISE NOTICE '  会员管理重复数: %（应为 1）', v_dup_membership;
  RAISE NOTICE '  已禁用空模块数: %', v_disabled;
  RAISE NOTICE '============================================';
END $$;

COMMIT;
