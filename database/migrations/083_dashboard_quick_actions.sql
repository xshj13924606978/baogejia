-- ============================================================
-- 迁移: 083_dashboard_quick_actions
-- 说明: 用户级仪表盘"快速操作"快捷入口自定义配置表
--       取代 dashboard.tsx 中硬编码的 4 个固定快捷入口
--       可选项来自 system_modules 和 system_pages 两表（动态管理）
-- 关联: system_modules / system_pages（已有，菜单驱动）
--       users（已有）
-- 触发: #[20260825-2146] 仪表盘菜单下的页面复核优化
--       修复前问题：快速操作 4 个写死，无法自由勾选；缺少自定义持久化
--       修复后：用户可从系统所有功能模块（system_pages/system_modules）中
--                自由勾选/排序/启用/禁用任意条目作为快捷入口，实时生效
--       注意：仅存"快照"字段（label/route/icon）保证菜单改动后已存选项仍可显示
-- ============================================================

BEGIN;

-- 1. 用户快速操作自定义表
CREATE TABLE IF NOT EXISTS dashboard_quick_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,                                -- 用户 ID（兼容多端登录，UUID 类型，与 users.id 严格一致）
  action_type  VARCHAR(16) NOT NULL,                         -- page(子页) / module(模块入口)
  action_key   VARCHAR(128) NOT NULL,                        -- 对应 system_pages.page_key 或 system_modules.module_key
  action_label VARCHAR(128) NOT NULL,                        -- 快照：当时的显示名（菜单改动后兜底）
  action_route VARCHAR(256),                                 -- 快照：当时的目标路径（菜单改动后兜底）
  action_icon  VARCHAR(64),                                  -- 快照：图标名（lucide icon name）
  sort_order   INTEGER NOT NULL DEFAULT 0,                   -- 排序
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,                -- 是否启用
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboard_quick_actions_user_key_unique UNIQUE (user_id, action_type, action_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_quick_actions_user_enabled
  ON dashboard_quick_actions (user_id, enabled, sort_order);

COMMENT ON TABLE dashboard_quick_actions IS '用户仪表盘快速操作自定义（#[20260825-2146]）。存储每个用户从 system_modules/system_pages 勾选的快捷入口及顺序、启用状态。所有取数 API 实时读取，用户无需重新登录即可生效。';
COMMENT ON COLUMN dashboard_quick_actions.user_id      IS '用户 UUID，与 users.id 一致；登录后通过 user.id 读写';
COMMENT ON COLUMN dashboard_quick_actions.action_type  IS 'page=来自 system_pages 的具体页面；module=来自 system_modules 的模块入口';
COMMENT ON COLUMN dashboard_quick_actions.action_key   IS '对应 system_pages.page_key 或 system_modules.module_key（建立真实关联）';
COMMENT ON COLUMN dashboard_quick_actions.action_label IS '快照显示名；当 system_* 表中原始记录变更时仍可保留原名显示';
COMMENT ON COLUMN dashboard_quick_actions.action_route IS '快照路径；菜单改路径时保留原路径跳转（原路径失效时 fallback 至 /admin）';
COMMENT ON COLUMN dashboard_quick_actions.action_icon  IS '快照 lucide 图标名';
COMMENT ON COLUMN dashboard_quick_actions.sort_order   IS '拖拽排序（数字小者靠前）';
COMMENT ON COLUMN dashboard_quick_actions.enabled      IS '是否启用；false 时 UI 仍展示但置灰，提供一次性恢复入口';

-- 2. RLS：service_role 通过；其余角色默认拒绝
--    API 全部通过 service_role client 读写，用户身份仅作 user_id 取值依据，不依赖 RLS
ALTER TABLE dashboard_quick_actions ENABLE ROW LEVEL SECURITY;

-- 3. updated_at 自动更新触发器（与既有触发器风格一致）
CREATE OR REPLACE FUNCTION trg_dashboard_quick_actions_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_quick_actions_touch ON dashboard_quick_actions;
CREATE TRIGGER dashboard_quick_actions_touch
BEFORE UPDATE ON dashboard_quick_actions
FOR EACH ROW
EXECUTE FUNCTION trg_dashboard_quick_actions_touch();

COMMIT;
