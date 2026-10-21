-- ============================================================================
-- 070: 合并重复的「系统管理」菜单分组（问题 #20260824-1625）
-- 问题：用户端菜单出现两个「系统管理」分组
-- 根因：数据库中同时存在 menu_key='system_management'（管理后台/设置/帮助）与
--       menu_key='system_mgmt'（账户管理）两个分组，name_zh 均为「系统管理」，
--       menu_key 不同导致按 menu_key 去重无法合并；且 account_management 的
--       route_path='/account' 为不存在的死路径（点击 404），与「个人资料」重复。
-- 修复：
--   1) 将 system_mgmt 分组下的子页面（account_management）迁移到 system_management 分组；
--   2) account_management 改为「账户设置」对话框（action_type=dialog、
--      config.dialogKey=settings），避免 404，与「个人资料」对话框区分；
--   3) 删除已空的 system_mgmt 分组。
-- 幂等性：仅在 system_management 与 system_mgmt 均存在时执行；
--         删除前校验 system_mgmt 下已无子页面（已移走）。
-- ============================================================================

DO $$
DECLARE
  v_target_id UUID;
  v_source_id UUID;
  v_leftover  INT;
BEGIN
  SELECT id INTO v_target_id FROM user_menus WHERE menu_key = 'system_management';
  SELECT id INTO v_source_id FROM user_menus WHERE menu_key = 'system_mgmt';

  -- 幂等：目标分组或源分组不存在则跳过
  IF v_target_id IS NULL OR v_source_id IS NULL THEN
    RAISE NOTICE '[070] 未找到 system_management 或 system_mgmt 分组，跳过';
    RETURN;
  END IF;

  -- 1) 移动子页面到 system_management，排序追加到分组末尾
  UPDATE user_pages
  SET menu_id = v_target_id,
      sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 1
                    FROM user_pages WHERE menu_id = v_target_id)
  WHERE menu_id = v_source_id;

  -- 2) 账户管理 → 账户设置对话框（避免 /account 死路径 404）
  UPDATE user_pages
  SET name_zh = '账户设置',
      action_type = 'dialog',
      route_path = NULL,
      config = jsonb_build_object('dialogKey', 'settings')
  WHERE page_key = 'account_management' AND menu_id = v_target_id;

  -- 3) 删除空分组（外键 ON DELETE CASCADE，子页面已移走）
  SELECT count(*) INTO v_leftover FROM user_pages WHERE menu_id = v_source_id;
  IF v_leftover = 0 THEN
    DELETE FROM user_menus WHERE id = v_source_id;
    RAISE NOTICE '[070] 已合并分组并删除 system_mgmt（剩余子页面数: 0）';
  ELSE
    RAISE NOTICE '[070] system_mgmt 仍有 % 个子页面，未删除', v_leftover;
  END IF;
END $$;

-- 校验输出
DO $$
DECLARE
  v_menus INT;
  v_pages INT;
  v_acc   RECORD;
BEGIN
  SELECT count(*) INTO v_menus FROM user_menus WHERE name_zh = '系统管理';
  RAISE NOTICE '[070] 校验：name_zh=系统管理 分组数 = %（应为 1）', v_menus;

  SELECT count(*) INTO v_pages FROM user_pages p
  JOIN user_menus m ON p.menu_id = m.id
  WHERE m.menu_key = 'system_management';
  RAISE NOTICE '[070] 校验：system_management 子页面数 = %', v_pages;

  SELECT * INTO v_acc FROM user_pages WHERE page_key = 'account_management';
  IF FOUND THEN
    RAISE NOTICE '[070] 校验：account_management → name_zh=%, action_type=%, route_path=%',
      v_acc.name_zh, v_acc.action_type, v_acc.route_path;
  END IF;
END $$;
