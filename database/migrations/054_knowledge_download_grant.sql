-- ============================================================
-- 054: 资料中心基础权限授予
-- 需求：#20260816001 资料中心权限控制
--
-- 背景：system_actions 中没有任何 knowledge:* 动作行，且 permission_overrides
--       仅对少数角色设置了 knowledge:view/download/edit/delete=false，
--       导致所有角色 actions['knowledge:download'] 为 undefined → 前端 can_download=false，
--       下载按钮对所有人生效前即被隐藏，下载功能实际不可用。
--
-- 修复：为标准角色显式授予 knowledge:view / knowledge:download = true
--       （guest 保持 download 禁止；edit/delete 继续由 048 覆盖控制）
-- ============================================================

DO $$
DECLARE
    r TEXT;
BEGIN
    -- 授予查看与下载的角色（下载需按 points_download_config 扣积分）
    FOREACH r IN ARRAY ARRAY['super_admin', 'admin', 'vip', 'premium', 'free', 'contributor', 'enterprise_admin', 'user']
    LOOP
        -- knowledge:view 默认 true
        IF NOT EXISTS (
            SELECT 1 FROM permission_overrides
            WHERE target_type = 'role' AND target_id = r
              AND permission_key = 'knowledge:view'
        ) THEN
            INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
            VALUES ('role', r, 'action', 'knowledge:view', TRUE, NULL, 10);
        END IF;

        -- knowledge:download 默认 true（免费用户也可下载，按扣费配置扣积分）
        IF NOT EXISTS (
            SELECT 1 FROM permission_overrides
            WHERE target_type = 'role' AND target_id = r
              AND permission_key = 'knowledge:download'
        ) THEN
            INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
            VALUES ('role', r, 'action', 'knowledge:download', TRUE, NULL, 10);
        END IF;
    END LOOP;
END $$;
