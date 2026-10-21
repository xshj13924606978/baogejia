-- ============================================================================
-- 056: 帮助菜单改为站内跳转
-- 问题 #20260818-1430：用户菜单"系统管理 → 帮助"点击无反应
-- 根因：user_pages 中 help 项 action_type='page'，而前端 user-menu.tsx 的
--       handleMenuItemClick 仅处理 navigate / external / dialog 三种类型，
--       page 类型无任何分支 → 点击无反应；且其 route_path='/user/help' 为
--       不存在的死路径（源码全项目无引用）。
-- 修复：action_type 改为 'navigate'、route_path 改为 '/help'（新增帮助中心页），
--       点击后走前端 handleNavigation(route_path) 站内跳转。
-- ============================================================================

UPDATE user_pages
SET action_type = 'navigate',
    route_path = '/help',
    config = '{}'::jsonb
WHERE page_key = 'help'
  AND route_path = '/user/help';

-- 幂等校验：输出当前配置便于验证
DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  SELECT count(*) INTO v_rows FROM user_pages WHERE page_key = 'help';
  RAISE NOTICE '[056] user_pages.help 共 % 条，应为 action_type=navigate, route_path=/help', v_rows;
END $$;
