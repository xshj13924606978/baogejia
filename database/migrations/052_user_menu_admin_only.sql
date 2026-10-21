-- ============================================================
-- 052: 用户菜单权限 - 管理后台入口 / 厂商支付排行（全局）仅管理员可见
-- 需求：#20260816001 用户菜单权限控制
-- 通过 permission_overrides 对非管理员角色隐藏：
--   user_menu_page: admin（管理后台）
--   user_menu_page: payment_ranking（数据统计→厂商支付排行（全局））
-- 管理员角色（super_admin / admin）不在此表配置 → 默认可见
-- ============================================================

-- 需要隐藏的目标角色（非管理员）
DO $$
DECLARE
    r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['free', 'vip', 'premium', 'contributor', 'enterprise_admin', 'user']
    LOOP
        -- 管理后台入口
        IF NOT EXISTS (
            SELECT 1 FROM permission_overrides
            WHERE target_type = 'role' AND target_id = r
              AND permission_type = 'user_menu_page' AND permission_key = 'admin'
        ) THEN
            INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
            VALUES ('role', r, 'user_menu_page', 'admin', FALSE, NULL, 100);
        END IF;

        -- 厂商支付排行（全局）
        IF NOT EXISTS (
            SELECT 1 FROM permission_overrides
            WHERE target_type = 'role' AND target_id = r
              AND permission_type = 'user_menu_page' AND permission_key = 'payment_ranking'
        ) THEN
            INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable, priority)
            VALUES ('role', r, 'user_menu_page', 'payment_ranking', FALSE, NULL, 100);
        END IF;
    END LOOP;
END $$;
