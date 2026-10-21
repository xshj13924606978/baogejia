-- ============================================================================
-- 超级管理员全配置系统 - 动态配置迁移脚本
-- 执行时间：2026-03-22
-- 版本：v2.0.0
-- 功能：创建 6 张配置表，支持模块/页面/字段/按钮的动态配置
--       新增用户级字段覆盖、配置变更日志（版本回滚）
--       UUID 主键、JSONB 扩展配置、二级菜单支持
-- ============================================================================

-- ============================================================================
-- 0. 清理旧版表（015 中已创建的 system_modules 等旧表结构不同，需先删除）
-- ============================================================================
DROP TABLE IF EXISTS config_change_logs CASCADE;
DROP TABLE IF EXISTS user_field_overrides CASCADE;
DROP TABLE IF EXISTS system_actions CASCADE;
DROP TABLE IF EXISTS system_fields CASCADE;
DROP TABLE IF EXISTS system_pages CASCADE;
DROP TABLE IF EXISTS system_modules CASCADE;
DROP VIEW IF EXISTS v_config_change_history CASCADE;
DROP VIEW IF EXISTS v_page_config CASCADE;
DROP VIEW IF EXISTS v_menu_tree CASCADE;

-- 清理旧版函数（触发器已随 DROP TABLE CASCADE 自动删除）
DROP FUNCTION IF EXISTS update_system_modules_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_pages_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_fields_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_actions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_dynamic_config_updated_at() CASCADE;

-- ============================================================================

-- ============================================================================
-- 1. system_modules（模块配置表）
-- 说明：管理后台左侧菜单项，支持二级嵌套菜单
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key VARCHAR(100) UNIQUE NOT NULL,         -- 唯一标识，如 'user_management'
    name_zh VARCHAR(100) NOT NULL,                   -- 中文名称
    name_en VARCHAR(100),                            -- 英文名称（可选）
    icon VARCHAR(50),                                -- lucide-react 图标名
    sort_order INT DEFAULT 0,                        -- 菜单排序（升序）
    parent_module_id UUID REFERENCES system_modules(id) ON DELETE SET NULL,  -- 二级菜单父级
    is_enabled BOOLEAN DEFAULT true,                 -- 是否启用
    is_visible_in_menu BOOLEAN DEFAULT true,         -- 是否在侧边栏显示
    route_path VARCHAR(200),                         -- 模块默认路由
    config JSONB DEFAULT '{}',                       -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sys_mod_key ON system_modules(module_key);
CREATE INDEX IF NOT EXISTS idx_sys_mod_parent ON system_modules(parent_module_id) WHERE parent_module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sys_mod_sort ON system_modules(sort_order);
CREATE INDEX IF NOT EXISTS idx_sys_mod_enabled ON system_modules(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_sys_mod_visible ON system_modules(is_visible_in_menu) WHERE is_visible_in_menu = true;

-- 注释
COMMENT ON TABLE system_modules IS '模块配置表 - 管理后台左侧菜单，支持二级嵌套';
COMMENT ON COLUMN system_modules.module_key IS '唯一标识，如 user_management, product_management';
COMMENT ON COLUMN system_modules.name_zh IS '中文菜单名称';
COMMENT ON COLUMN system_modules.icon IS '前端图标名称（lucide-react 图标集）';
COMMENT ON COLUMN system_modules.parent_module_id IS '父模块ID，支持二级菜单（如积分系统 → 积分规则配置）';
COMMENT ON COLUMN system_modules.is_visible_in_menu IS '是否在侧边栏显示（启用但隐藏的模块仍可通过URL访问）';
COMMENT ON COLUMN system_modules.config IS 'JSONB扩展配置，如 {"badge":"VIP","badgeColor":"bg-yellow-500"}';

-- ============================================================================
-- 2. system_pages（页面配置表）
-- 说明：每个模块下的子页面
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
    page_key VARCHAR(100) NOT NULL,                  -- 页面唯一标识，如 'user-list'
    name_zh VARCHAR(100) NOT NULL,                   -- 页面中文名
    route_path VARCHAR(200),                         -- 页面路由
    layout_template VARCHAR(50) DEFAULT 'default',   -- 布局模板：default, form, detail, dashboard, statistics
    is_enabled BOOLEAN DEFAULT true,                 -- 是否启用
    config JSONB DEFAULT '{}',                       -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(module_id, page_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sys_page_module ON system_pages(module_id);
CREATE INDEX IF NOT EXISTS idx_sys_page_key ON system_pages(page_key);
CREATE INDEX IF NOT EXISTS idx_sys_page_template ON system_pages(layout_template);
CREATE INDEX IF NOT EXISTS idx_sys_page_enabled ON system_pages(is_enabled) WHERE is_enabled = true;

-- 注释
COMMENT ON TABLE system_pages IS '页面配置表 - 模块下的子页面定义';
COMMENT ON COLUMN system_pages.page_key IS '页面唯一标识，同一模块内不可重复';
COMMENT ON COLUMN system_pages.layout_template IS '布局模板：default(默认), form(表单), detail(详情), dashboard(仪表盘), statistics(统计)';
COMMENT ON COLUMN system_pages.config IS 'JSONB扩展配置，如 {"showPagination":true,"defaultPageSize":20}';

-- ============================================================================
-- 3. system_fields（字段配置表）
-- 说明：每个页面的表单字段、列表列定义，支持校验、依赖、分组
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES system_pages(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,                 -- 字段标识，如 'username'
    field_type VARCHAR(50) NOT NULL DEFAULT 'text',  -- 字段类型
    label_zh VARCHAR(100) NOT NULL,                  -- 字段中文标签
    is_visible BOOLEAN DEFAULT true,                 -- 是否可见
    is_editable BOOLEAN DEFAULT true,                -- 是否可编辑
    is_required BOOLEAN DEFAULT false,               -- 是否必填
    sort_order INT DEFAULT 0,                        -- 排序
    group_name VARCHAR(100),                         -- 表单分组名
    default_value JSONB,                             -- 默认值
    validation_rules JSONB DEFAULT '{}',             -- 校验规则
    options_config JSONB,                            -- 下拉选项配置
    depends_on JSONB,                                -- 依赖字段
    config JSONB DEFAULT '{}',                       -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, field_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sys_field_page ON system_fields(page_id);
CREATE INDEX IF NOT EXISTS idx_sys_field_key ON system_fields(field_key);
CREATE INDEX IF NOT EXISTS idx_sys_field_type ON system_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_sys_field_group ON system_fields(group_name) WHERE group_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sys_field_visible ON system_fields(is_visible) WHERE is_visible = true;

-- 注释
COMMENT ON TABLE system_fields IS '字段配置表 - 页面中的表单字段和列表列定义';
COMMENT ON COLUMN system_fields.field_key IS '字段标识，同一页面内不可重复';
COMMENT ON COLUMN system_fields.field_type IS '字段类型：text, number, select, date, datetime, textarea, json, file, image, switch, email, phone, url, color, tag, cascader, rich_text';
COMMENT ON COLUMN system_fields.validation_rules IS 'JSONB校验规则，如 {"required":true,"pattern":"^\\d+$","min":0,"max":99999,"minLength":1,"maxLength":200}';
COMMENT ON COLUMN system_fields.options_config IS 'JSONB下拉选项，如 {"type":"static","options":[{"label":"选项A","value":"a"}]} 或 {"type":"dynamic","api":"/api/options/xxx"}';
COMMENT ON COLUMN system_fields.depends_on IS 'JSONB字段依赖，如 {"field":"category","operator":"eq","value":"electronics"} 表示当category等于electronics时显示';
COMMENT ON COLUMN system_fields.config IS 'JSONB扩展配置，如 {"width":200,"minWidth":100,"placeholder":"请输入","helpText":"帮助说明","tooltip":"提示"}';

-- ============================================================================
-- 4. system_actions（操作按钮配置表）
-- 说明：每个页面的操作按钮定义，关联 API 和权限
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES system_pages(id) ON DELETE CASCADE,
    action_key VARCHAR(100) NOT NULL,                -- 按钮标识，如 'create', 'edit', 'delete'
    name_zh VARCHAR(100) NOT NULL,                   -- 按钮中文名
    api_endpoint VARCHAR(200),                       -- 关联的 API 端点
    http_method VARCHAR(10) DEFAULT 'POST',          -- HTTP 方法
    is_visible BOOLEAN DEFAULT true,                 -- 是否可见
    permission_required VARCHAR(100),                -- 所需权限代码
    sort_order INT DEFAULT 0,                        -- 排序
    config JSONB DEFAULT '{}',                       -- 扩展配置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(page_id, action_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sys_action_page ON system_actions(page_id);
CREATE INDEX IF NOT EXISTS idx_sys_action_key ON system_actions(action_key);
CREATE INDEX IF NOT EXISTS idx_sys_action_method ON system_actions(http_method);
CREATE INDEX IF NOT EXISTS idx_sys_action_perm ON system_actions(permission_required) WHERE permission_required IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sys_action_visible ON system_actions(is_visible) WHERE is_visible = true;

-- 注释
COMMENT ON TABLE system_actions IS '操作按钮配置表 - 页面中的操作按钮定义';
COMMENT ON COLUMN system_actions.action_key IS '按钮标识：create, edit, delete, view, export, import, batch_delete, refresh, print, custom';
COMMENT ON COLUMN system_actions.api_endpoint IS '关联的API端点，如 /api/admin/users 或 /api/products/:id';
COMMENT ON COLUMN system_actions.permission_required IS '执行该操作所需的权限代码';
COMMENT ON COLUMN system_actions.config IS 'JSONB扩展配置，如 {"icon":"Plus","buttonType":"primary","position":"toolbar","confirmMessage":"确定删除？","batchSupport":true,"showCondition":{...}}';

-- ============================================================================
-- 5. user_field_overrides（用户级字段覆盖表）
-- 说明：管理员可为指定用户单独调整字段的可见性、编辑性和默认值
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_field_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,                           -- 目标用户ID
    field_id UUID NOT NULL REFERENCES system_fields(id) ON DELETE CASCADE,
    field_value JSONB,                               -- 覆盖默认值
    is_visible BOOLEAN,                              -- 覆盖可见性（NULL 表示不覆盖）
    is_editable BOOLEAN,                             -- 覆盖可编辑性（NULL 表示不覆盖）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, field_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ufo_user ON user_field_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_ufo_field ON user_field_overrides(field_id);
CREATE INDEX IF NOT EXISTS idx_ufo_user_field ON user_field_overrides(user_id, field_id);

-- 注释
COMMENT ON TABLE user_field_overrides IS '用户级字段覆盖表 - 管理员可为指定用户单独调整字段属性';
COMMENT ON COLUMN user_field_overrides.user_id IS '目标用户ID（被调整配置的用户）';
COMMENT ON COLUMN user_field_overrides.field_id IS '关联的字段配置ID';
COMMENT ON COLUMN user_field_overrides.field_value IS '覆盖该字段对该用户的默认值';
COMMENT ON COLUMN user_field_overrides.is_visible IS '覆盖可见性，NULL表示不覆盖（使用原始配置）';
COMMENT ON COLUMN user_field_overrides.is_editable IS '覆盖可编辑性，NULL表示不覆盖（使用原始配置）';

-- ============================================================================
-- 6. config_change_logs（配置变更日志表）
-- 说明：记录所有配置修改，支持审计追踪和版本回滚
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,                          -- 操作管理员ID
    target_type VARCHAR(50) NOT NULL,                -- 变更目标类型
    target_id UUID NOT NULL,                         -- 变更目标ID
    old_value JSONB,                                 -- 变更前的值
    new_value JSONB,                                 -- 变更后的值
    change_description TEXT,                         -- 变更说明（人工备注）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ccl_admin ON config_change_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_ccl_target ON config_change_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_ccl_created ON config_change_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccl_type ON config_change_logs(target_type);

-- 注释
COMMENT ON TABLE config_change_logs IS '配置变更日志表 - 记录管理员对配置的所有修改，支持审计和回滚';
COMMENT ON COLUMN config_change_logs.admin_id IS '执行操作的管理员用户ID';
COMMENT ON COLUMN config_change_logs.target_type IS '变更目标类型：module, page, field, action, user_override';
COMMENT ON COLUMN config_change_logs.old_value IS '变更前的完整记录快照';
COMMENT ON COLUMN config_change_logs.new_value IS '变更后的完整记录快照';
COMMENT ON COLUMN config_change_logs.change_description IS '管理员填写的变更说明';

-- ============================================================================
-- 7. 触发器：自动更新 updated_at 字段
-- ============================================================================

CREATE OR REPLACE FUNCTION update_dynamic_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sys_mod_updated ON system_modules;
CREATE TRIGGER trg_sys_mod_updated
    BEFORE UPDATE ON system_modules
    FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();

DROP TRIGGER IF EXISTS trg_sys_page_updated ON system_pages;
CREATE TRIGGER trg_sys_page_updated
    BEFORE UPDATE ON system_pages
    FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();

DROP TRIGGER IF EXISTS trg_sys_field_updated ON system_fields;
CREATE TRIGGER trg_sys_field_updated
    BEFORE UPDATE ON system_fields
    FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();

DROP TRIGGER IF EXISTS trg_sys_action_updated ON system_actions;
CREATE TRIGGER trg_sys_action_updated
    BEFORE UPDATE ON system_actions
    FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();

DROP TRIGGER IF EXISTS trg_ufo_updated ON user_field_overrides;
CREATE TRIGGER trg_ufo_updated
    BEFORE UPDATE ON user_field_overrides
    FOR EACH ROW EXECUTE FUNCTION update_dynamic_config_updated_at();

-- ============================================================================
-- 8. 便捷视图
-- ============================================================================

-- 8.1 菜单视图：带父模块名称的完整模块信息
CREATE OR REPLACE VIEW v_menu_tree AS
SELECT
    m.id,
    m.module_key,
    m.name_zh,
    m.name_en,
    m.icon,
    m.sort_order,
    m.parent_module_id,
    p.name_zh AS parent_module_name,
    m.is_enabled,
    m.is_visible_in_menu,
    m.route_path,
    m.config,
    (
        SELECT COUNT(*)
        FROM system_pages sp
        WHERE sp.module_id = m.id AND sp.is_enabled = true
    ) AS enabled_page_count
FROM system_modules m
LEFT JOIN system_modules p ON m.parent_module_id = p.id
WHERE m.is_enabled = true
ORDER BY COALESCE(p.sort_order, 0), m.sort_order;

COMMENT ON VIEW v_menu_tree IS '菜单树视图 - 带父模块名称和已启用页面计数';

-- 8.2 页面配置视图：关联模块信息的完整页面列表
CREATE OR REPLACE VIEW v_page_config AS
SELECT
    sp.id AS page_id,
    sp.page_key,
    sp.name_zh AS page_name,
    sp.route_path,
    sp.layout_template,
    sp.is_enabled,
    sp.config AS page_config,
    sm.id AS module_id,
    sm.module_key,
    sm.name_zh AS module_name,
    sm.icon AS module_icon,
    sm.route_path AS module_route,
    sm.parent_module_id,
    (
        SELECT COUNT(*) FROM system_fields sf WHERE sf.page_id = sp.id AND sf.is_visible = true
    ) AS visible_field_count,
    (
        SELECT COUNT(*) FROM system_actions sa WHERE sa.page_id = sp.id AND sa.is_visible = true
    ) AS visible_action_count
FROM system_pages sp
INNER JOIN system_modules sm ON sp.module_id = sm.id
WHERE sp.is_enabled = true AND sm.is_enabled = true
ORDER BY sm.sort_order, sp.sort_order;

COMMENT ON VIEW v_page_config IS '页面配置视图 - 关联模块信息、可见字段/按钮计数';

-- 8.3 变更历史视图：关联管理员名称
CREATE OR REPLACE VIEW v_config_change_history AS
SELECT
    ccl.id,
    ccl.target_type,
    ccl.target_id,
    ccl.old_value,
    ccl.new_value,
    ccl.change_description,
    ccl.created_at,
    u.email AS admin_email,
    COALESCE(
        u.metadata->>'name',
        u.metadata->>'nickname',
        u.email
    ) AS admin_name
FROM config_change_logs ccl
LEFT JOIN users u ON ccl.admin_id = u.id
ORDER BY ccl.created_at DESC;

COMMENT ON VIEW v_config_change_history IS '配置变更历史视图 - 关联管理员姓名和邮箱';

-- ============================================================================
-- 完成提示
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '动态配置系统迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已创建表:';
    RAISE NOTICE '  system_modules        - 模块配置（支持二级菜单）';
    RAISE NOTICE '  system_pages          - 页面配置';
    RAISE NOTICE '  system_fields         - 字段配置（校验/依赖/分组）';
    RAISE NOTICE '  system_actions        - 操作按钮配置';
    RAISE NOTICE '  user_field_overrides  - 用户级字段覆盖';
    RAISE NOTICE '  config_change_logs    - 配置变更日志';
    RAISE NOTICE '已创建视图:';
    RAISE NOTICE '  v_menu_tree            - 菜单树视图';
    RAISE NOTICE '  v_page_config          - 页面配置视图';
    RAISE NOTICE '  v_config_change_history - 变更历史视图';
    RAISE NOTICE '已添加: 触发器、索引、外键、注释';
    RAISE NOTICE '========================================';
END $$;
