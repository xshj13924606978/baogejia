-- ============================================================================
-- 用户端菜单动态配置系统 - 迁移脚本
-- 执行时间：2026-03-27
-- 版本：v1.0.0
-- 功能：创建 4 张用户端配置表，支持菜单/页面/字段/按钮的动态配置
--       结构与 system_modules/system_pages/system_fields/system_actions 平行
-- ============================================================================

-- ============================================================================
-- 1. user_menus（用户端菜单模块配置表）
-- 说明：用户端下拉菜单中的分组（如"我的账户"、"商务信息"等）
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_key VARCHAR(100) UNIQUE NOT NULL,            -- 唯一标识，如 'my_account'
    name_zh VARCHAR(100) NOT NULL,                    -- 中文分组名称
    name_en VARCHAR(100),                             -- 英文名称（可选）
    icon VARCHAR(50),                                 -- lucide-react 图标名
    sort_order INT DEFAULT 0,                         -- 排序（升序）
    is_enabled BOOLEAN DEFAULT true,                  -- 是否启用
    is_visible BOOLEAN DEFAULT true,                  -- 是否在下拉菜单中显示
    description VARCHAR(500),                         -- 描述
    permission_code VARCHAR(100),                     -- 所需权限代码（可选）
    config JSONB DEFAULT '{}',                        -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_menu_key ON user_menus(menu_key);
CREATE INDEX IF NOT EXISTS idx_user_menu_sort ON user_menus(sort_order);
CREATE INDEX IF NOT EXISTS idx_user_menu_enabled ON user_menus(is_enabled) WHERE is_enabled = true;

-- 注释
COMMENT ON TABLE user_menus IS '用户端菜单模块配置表 - 下拉菜单中的分组定义';
COMMENT ON COLUMN user_menus.menu_key IS '唯一标识，如 my_account, business_info';
COMMENT ON COLUMN user_menus.icon IS '前端图标名称（lucide-react 图标集）';
COMMENT ON COLUMN user_menus.is_visible IS '是否在下拉菜单中显示';
COMMENT ON COLUMN user_menus.config IS 'JSONB扩展配置，如 {"badge":"New"}';

-- ============================================================================
-- 2. user_pages（用户端页面配置表）
-- 说明：每个菜单分组下的子菜单项
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID NOT NULL REFERENCES user_menus(id) ON DELETE CASCADE,
    page_key VARCHAR(100) NOT NULL,                   -- 页面标识，如 'profile'
    name_zh VARCHAR(100) NOT NULL,                    -- 菜单项中文名
    icon VARCHAR(50),                                 -- 菜单项图标（覆盖父级图标）
    route_path VARCHAR(200),                          -- 路由路径
    action_type VARCHAR(50) DEFAULT 'navigate',       -- 动作类型：navigate(路由跳转), dialog(弹窗), external(外部链接)
    is_enabled BOOLEAN DEFAULT true,                  -- 是否启用
    is_visible BOOLEAN DEFAULT true,                  -- 是否显示
    sort_order INT DEFAULT 0,                         -- 排序
    badge_text VARCHAR(50),                           -- 徽标文字（如积分数量）
    badge_type VARCHAR(20),                           -- 徽标类型：info, success, warning, danger
    config JSONB DEFAULT '{}',                        -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(menu_id, page_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_page_menu ON user_pages(menu_id);
CREATE INDEX IF NOT EXISTS idx_user_page_key ON user_pages(page_key);
CREATE INDEX IF NOT EXISTS idx_user_page_enabled ON user_pages(is_enabled) WHERE is_enabled = true;

-- 注释
COMMENT ON TABLE user_pages IS '用户端页面配置表 - 菜单分组下的子菜单项';
COMMENT ON COLUMN user_pages.action_type IS '动作类型：navigate(路由跳转), dialog(弹窗), external(外部链接)';
COMMENT ON COLUMN user_pages.badge_text IS '徽标显示文字，动态渲染时由前端替换';
COMMENT ON COLUMN user_pages.config IS 'JSONB扩展配置，如 {"showBadge":true,"badgeKey":"points"}';

-- ============================================================================
-- 3. user_fields（用户端字段配置表）
-- 说明：每个页面的表单字段、列表字段定义
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES user_pages(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,                  -- 字段标识
    field_type VARCHAR(50) NOT NULL DEFAULT 'text',   -- 字段类型
    label_zh VARCHAR(100) NOT NULL,                   -- 字段中文标签
    is_visible BOOLEAN DEFAULT true,                  -- 是否可见
    is_editable BOOLEAN DEFAULT true,                 -- 是否可编辑
    is_required BOOLEAN DEFAULT false,                -- 是否必填
    sort_order INT DEFAULT 0,                         -- 排序
    group_name VARCHAR(100),                          -- 表单分组名
    default_value JSONB,                              -- 默认值
    validation_rules JSONB DEFAULT '{}',              -- 校验规则
    options_config JSONB,                             -- 下拉选项配置
    depends_on JSONB,                                -- 依赖字段
    config JSONB DEFAULT '{}',                        -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, field_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_field_page ON user_fields(page_id);
CREATE INDEX IF NOT EXISTS idx_user_field_key ON user_fields(field_key);
CREATE INDEX IF NOT EXISTS idx_user_field_visible ON user_fields(is_visible) WHERE is_visible = true;

-- 注释
COMMENT ON TABLE user_fields IS '用户端字段配置表 - 页面中的表单字段和列表字段定义';

-- ============================================================================
-- 4. user_actions（用户端按钮配置表）
-- 说明：每个页面的操作按钮定义
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES user_pages(id) ON DELETE CASCADE,
    action_key VARCHAR(100) NOT NULL,                 -- 按钮标识，如 'save', 'cancel'
    name_zh VARCHAR(100) NOT NULL,                    -- 按钮中文名
    api_endpoint VARCHAR(200),                        -- 关联的 API 端点
    http_method VARCHAR(10) DEFAULT 'POST',           -- HTTP 方法
    is_visible BOOLEAN DEFAULT true,                  -- 是否可见
    permission_required VARCHAR(100),                 -- 所需权限代码
    sort_order INT DEFAULT 0,                         -- 排序
    config JSONB DEFAULT '{}',                        -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, action_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_action_page ON user_actions(page_id);
CREATE INDEX IF NOT EXISTS idx_user_action_key ON user_actions(action_key);
CREATE INDEX IF NOT EXISTS idx_user_action_visible ON user_actions(is_visible) WHERE is_visible = true;

-- 注释
COMMENT ON TABLE user_actions IS '用户端按钮配置表 - 页面中的操作按钮定义';

-- ============================================================================
-- 5. 触发器：自动更新 updated_at 字段
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_menu_updated ON user_menus;
CREATE TRIGGER trg_user_menu_updated
    BEFORE UPDATE ON user_menus
    FOR EACH ROW EXECUTE FUNCTION update_user_config_updated_at();

DROP TRIGGER IF EXISTS trg_user_page_updated ON user_pages;
CREATE TRIGGER trg_user_page_updated
    BEFORE UPDATE ON user_pages
    FOR EACH ROW EXECUTE FUNCTION update_user_config_updated_at();

DROP TRIGGER IF EXISTS trg_user_field_updated ON user_fields;
CREATE TRIGGER trg_user_field_updated
    BEFORE UPDATE ON user_fields
    FOR EACH ROW EXECUTE FUNCTION update_user_config_updated_at();

DROP TRIGGER IF EXISTS trg_user_action_updated ON user_actions;
CREATE TRIGGER trg_user_action_updated
    BEFORE UPDATE ON user_actions
    FOR EACH ROW EXECUTE FUNCTION update_user_config_updated_at();

-- ============================================================================
-- 6. 便捷视图
-- ============================================================================

-- 6.1 用户菜单树视图
CREATE OR REPLACE VIEW v_user_menu_tree AS
SELECT
    m.id,
    m.menu_key,
    m.name_zh,
    m.name_en,
    m.icon,
    m.sort_order,
    m.is_enabled,
    m.is_visible,
    m.description,
    m.config,
    (
        SELECT COUNT(*)
        FROM user_pages p
        WHERE p.menu_id = m.id AND p.is_enabled = true AND p.is_visible = true
    ) AS visible_page_count
FROM user_menus m
WHERE m.is_enabled = true
ORDER BY m.sort_order;

COMMENT ON VIEW v_user_menu_tree IS '用户菜单树视图 - 带可见页面计数';

-- ============================================================================
-- 7. 种子数据：初始化用户菜单配置
-- ============================================================================

-- 7.1 菜单分组
INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description) VALUES
    ('my_account', '我的账户', 'My Account', 'User', 1, true, true, '个人账户相关功能'),
    ('business_info', '商务信息', 'Business Info', 'Briefcase', 2, true, true, '商务信息和客户管理'),
    ('data_stats', '数据与统计', 'Data & Stats', 'BarChart3', 3, true, true, '数据统计和排行'),
    ('system_mgmt', '系统管理', 'System', 'Settings', 4, true, true, '系统设置和管理功能')
ON CONFLICT (menu_key) DO NOTHING;

-- 7.2 菜单项 - 我的账户
INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, badge_type, config) VALUES
    ((SELECT id FROM user_menus WHERE menu_key = 'my_account'),
     'profile', '个人资料', 'User', '/profile', 'dialog', true, true, 1, NULL, '{"dialogKey":"profile"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'my_account'),
     'change_password', '修改密码', 'Lock', '/profile/change-password', 'dialog', true, true, 2, NULL, '{"dialogKey":"password"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'my_account'),
     'points_history', '积分明细', 'CreditCard', '/points/history', 'dialog', true, true, 3, 'info', '{"dialogKey":"points","showBadge":true,"badgeKey":"points"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'my_account'),
     'invite', '邀请好友', 'Gift', '/invite', 'dialog', true, true, 4, NULL, '{"dialogKey":"invite"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'my_account'),
     'notifications', '通知中心', 'Bell', '/notifications', 'dialog', true, true, 5, 'danger', '{"dialogKey":"notifications","showBadge":true,"badgeKey":"unreadCount"}')
ON CONFLICT (menu_id, page_key) DO NOTHING;

-- 7.3 菜单项 - 商务信息
INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, badge_type, config) VALUES
    ((SELECT id FROM user_menus WHERE menu_key = 'business_info'),
     'supplier_info', '供应方信息', 'Building2', '/supplier/info', 'dialog', true, true, 1, NULL, '{"dialogKey":"supplier"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'business_info'),
     'customers', '客户管理', 'Users', '/customers', 'dialog', true, true, 2, NULL, '{"dialogKey":"customer"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'business_info'),
     'terms', '商务条款', 'FileText', '/terms', 'dialog', true, true, 3, NULL, '{"dialogKey":"terms"}')
ON CONFLICT (menu_id, page_key) DO NOTHING;

-- 7.4 菜单项 - 数据与统计
INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, badge_type, config) VALUES
    ((SELECT id FROM user_menus WHERE menu_key = 'data_stats'),
     'payment_ranking', '厂商支付排行', 'TrendingUp', '/ranking/payment', 'dialog', true, true, 1, NULL, '{"dialogKey":"payment","hasSubPanel":true}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'data_stats'),
     'user_stats', '数据统计', 'BarChart3', '/stats/user', 'dialog', true, true, 2, NULL, '{"dialogKey":"stats"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'data_stats'),
     'recent_activities', '最近记录', 'History', '/recent-activities', 'dialog', true, true, 3, NULL, '{"dialogKey":"records"}')
ON CONFLICT (menu_id, page_key) DO NOTHING;

-- 7.5 菜单项 - 系统管理
INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, badge_type, config) VALUES
    ((SELECT id FROM user_menus WHERE menu_key = 'system_mgmt'),
     'admin', '管理后台', 'LayoutDashboard', '/admin', 'navigate', true, true, 1, NULL, '{}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'system_mgmt'),
     'account_management', '用户管理', 'Users', '/settings/account', 'navigate', true, true, 2, NULL, '{}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'system_mgmt'),
     'settings', '设置', 'Settings', '/settings', 'dialog', true, true, 3, NULL, '{"dialogKey":"settings"}'),
    ((SELECT id FROM user_menus WHERE menu_key = 'system_mgmt'),
     'help', '帮助', 'HelpCircle', '/help', 'external', true, true, 4, NULL, '{"externalUrl":"https://help.baogejia.com"}')
ON CONFLICT (menu_id, page_key) DO NOTHING;

-- ============================================================================
-- 完成提示
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '用户端菜单动态配置系统迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已创建表:';
    RAISE NOTICE '  user_menus   - 用户端菜单分组配置';
    RAISE NOTICE '  user_pages   - 用户端菜单项配置';
    RAISE NOTICE '  user_fields  - 用户端字段配置';
    RAISE NOTICE '  user_actions - 用户端按钮配置';
    RAISE NOTICE '已创建视图:';
    RAISE NOTICE '  v_user_menu_tree - 用户菜单树视图';
    RAISE NOTICE '已初始化 4 个菜单分组、15 个菜单项';
    RAISE NOTICE '========================================';
END $$;
