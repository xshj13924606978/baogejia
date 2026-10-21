-- ============================================================================
-- 071: 删除重复的「账户设置」菜单项（问题 #20260824-1628-1）
-- 背景：#20260824-1628 已将原「账户管理」迁移到「系统管理」分组并改为对话框。
-- 问题：用户验证发现「系统管理 → 设置」与「系统管理 → 账户设置」打开同一设置
--       对话框，造成重复入口，体验不佳。
-- 修复：直接删除 page_key='account_management' 的菜单项，仅保留「设置」入口。
-- 幂等性：仅当该记录存在时删除；若不存在则不执行任何操作。
-- ============================================================================

DO $$
DECLARE
  v_cnt INT;
BEGIN
  SELECT count(*) INTO v_cnt FROM user_pages WHERE page_key = 'account_management';

  IF v_cnt = 0 THEN
    RAISE NOTICE '[071] page_key=account_management 不存在，跳过';
    RETURN;
  END IF;

  DELETE FROM user_pages WHERE page_key = 'account_management';
  RAISE NOTICE '[071] 已删除 page_key=account_management 的重复菜单项（删除数: %）', v_cnt;
END $$;

-- 校验输出
DO $$
DECLARE
  v_cnt INT;
BEGIN
  SELECT count(*) INTO v_cnt FROM user_pages WHERE page_key = 'account_management';
  RAISE NOTICE '[071] 校验：page_key=account_management 剩余数 = %（应为 0）', v_cnt;
END $$;
