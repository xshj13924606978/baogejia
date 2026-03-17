-- ============================================================================
-- 权限系统迁移脚本
-- 执行时间：2026-03-17
-- 版本：v1.0.0
-- 功能：创建权限表、角色表、添加账单权限、角色名称标准化（中英文支持）
-- ============================================================================

-- ============================================================================
-- 1. 创建枚举类型：角色类型（支持中英文）
-- ============================================================================

-- 创建角色枚举类型（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
        CREATE TYPE user_role_enum AS ENUM (
            'free',           -- 免费用户
            'premium',        -- 高级会员
            'vip',            -- VIP会员
            'enterprise_admin', -- 企业管理员
            'super_admin',    -- 超级管理员
            'admin'           -- 管理员
        );
    END IF;
END $$;

-- ============================================================================
-- 2. 角色名称映射表（中英文支持）
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_names (
    id SERIAL PRIMARY KEY,
    role_code VARCHAR(50) UNIQUE NOT NULL,      -- 角色代码（英文）
    role_name_zh VARCHAR(100) NOT NULL,         -- 角色名称（中文）
    role_name_en VARCHAR(100) NOT NULL,         -- 角色名称（英文）
    description TEXT,                            -- 角色描述
    priority INTEGER DEFAULT 0,                  -- 角色优先级（数字越大权限越高）
    is_active BOOLEAN DEFAULT true,             -- 是否启用
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_role_names_role_code ON role_names(role_code);
CREATE INDEX IF NOT EXISTS idx_role_names_priority ON role_names(priority);

-- 插入角色名称数据（中英文标准化）
INSERT INTO role_names (role_code, role_name_zh, role_name_en, description, priority) VALUES
    ('free', '免费用户', 'Free User', '基础免费用户，享有基本功能', 10),
    ('premium', '高级会员', 'Premium Member', '付费高级会员，享有更多功能', 20),
    ('vip', 'VIP会员', 'VIP Member', 'VIP会员，享有高级功能', 30),
    ('enterprise_admin', '企业管理员', 'Enterprise Admin', '企业管理员，管理企业用户和权限', 40),
    ('admin', '管理员', 'Administrator', '系统管理员', 50),
    ('super_admin', '超级管理员', 'Super Administrator', '超级管理员，拥有所有权限', 100)
ON CONFLICT (role_code) DO UPDATE SET
    role_name_zh = EXCLUDED.role_name_zh,
    role_name_en = EXCLUDED.role_name_en,
    description = EXCLUDED.description,
    priority = EXCLUDED.priority;

COMMENT ON TABLE role_names IS '角色名称映射表，支持中英文显示';
COMMENT ON COLUMN role_names.role_code IS '角色代码（英文标识）';
COMMENT ON COLUMN role_names.role_name_zh IS '角色中文名称';
COMMENT ON COLUMN role_names.role_name_en is '角色英文名称';

-- ============================================================================
-- 3. 权限定义表（permissions）
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,        -- 权限代码，如 'user.create'
    name VARCHAR(100) NOT NULL,                -- 权限名称，如 '创建用户'
    name_en VARCHAR(100),                      -- 权限英文名称，如 'Create User'
    category VARCHAR(50) NOT NULL,             -- 权限分类，如 'user', 'product', 'quote'
    description TEXT,                          -- 权限描述
    resource_type VARCHAR(50),                 -- 资源类型：api, module, field
    resource_path VARCHAR(200),                -- 资源路径，如 '/api/users'
    method VARCHAR(10),                        -- 请求方法：GET, POST, PUT, DELETE
    is_active BOOLEAN DEFAULT true,            -- 是否启用
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_type ON permissions(resource_type);
CREATE INDEX IF NOT EXISTS idx_permissions_is_active ON permissions(is_active);

COMMENT ON TABLE permissions IS '权限定义表';
COMMENT ON COLUMN permissions.code IS '权限代码，格式：模块.操作，如 user.create';
COMMENT ON COLUMN permissions.name IS '权限中文名称';
COMMENT ON COLUMN permissions.name_en IS '权限英文名称';
COMMENT ON COLUMN permissions.category IS '权限分类：user, product, quote, admin等';

-- ============================================================================
-- 4. 角色权限关联表（role_permissions）
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) NOT NULL,                 -- 角色代码
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,              -- 是否授予：true=授予, false=拒绝
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(role, permission_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_granted ON role_permissions(granted);

COMMENT ON TABLE role_permissions IS '角色权限关联表，定义角色与权限的映射关系';

-- ============================================================================
-- 5. 用户权限关联表（user_permissions）- 修正为 UUID 类型
-- ============================================================================

-- 先检查表是否存在，如果存在且类型不对则重建
DO $$
BEGIN
    -- 检查表是否存在
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_permissions') THEN
        -- 检查 user_id 列类型是否为 UUID
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'user_permissions'
            AND column_name = 'user_id'
            AND data_type = 'uuid'
        ) THEN
            -- 删除旧表重建
            DROP TABLE IF EXISTS user_permissions CASCADE;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,              -- true=授予, false=拒绝
    reason VARCHAR(200),                       -- 授予/拒绝的原因
    expires_at TIMESTAMP WITH TIME ZONE,       -- 过期时间（可选）
    created_by UUID REFERENCES users(id),      -- 操作人
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, permission_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_granted ON user_permissions(granted);
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires_at ON user_permissions(expires_at);

COMMENT ON TABLE user_permissions IS '用户额外权限表，为特定用户授予或拒绝特定权限';

-- ============================================================================
-- 6. 用户角色关联表（user_roles）- 支持一个用户多个角色
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,                 -- 角色代码
    is_primary BOOLEAN DEFAULT false,          -- 是否为主角色
    granted_by UUID REFERENCES users(id),      -- 授予人
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,       -- 过期时间
    UNIQUE(user_id, role)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_primary ON user_roles(is_primary);

COMMENT ON TABLE user_roles IS '用户角色关联表，支持一个用户拥有多个角色';

-- ============================================================================
-- 7. 插入/更新权限数据 - 包含账单权限
-- ============================================================================

-- 用户管理权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('user.view', '查看用户', 'View Users', 'user', '查看用户列表和详情', 'module'),
    ('user.create', '创建用户', 'Create User', 'user', '创建新用户', 'module'),
    ('user.edit', '编辑用户', 'Edit User', 'user', '编辑用户信息', 'module'),
    ('user.delete', '删除用户', 'Delete User', 'user', '删除用户', 'module'),
    ('user.manage', '管理用户', 'Manage Users', 'user', '管理用户权限和角色', 'module'),
    ('user.search', '搜索用户', 'Search Users', 'user', '搜索用户', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 产品相关权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('product.search', '搜索产品', 'Search Products', 'product', '搜索产品信息', 'module'),
    ('product.view', '查看产品', 'View Products', 'product', '查看产品详情', 'module'),
    ('product.edit', '编辑产品', 'Edit Products', 'product', '编辑产品信息', 'module'),
    ('product.delete', '删除产品', 'Delete Products', 'product', '删除产品', 'module'),
    ('product.export', '导出产品', 'Export Products', 'product', '导出产品数据', 'module'),
    ('product.create', '创建产品', 'Create Products', 'product', '创建新产品', 'module'),
    ('product.import', '导入产品', 'Import Products', 'product', '导入产品数据', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 成本相关权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('cost_price.view', '查看成本价', 'View Cost Price', 'product', '查看产品成本价', 'field'),
    ('cost_price.edit', '编辑成本价', 'Edit Cost Price', 'product', '编辑产品成本价', 'field'),
    ('min_price.view', '查看最低售价', 'View Min Price', 'product', '查看产品最低售价', 'field'),
    ('manufacturer.view', '查看厂家信息', 'View Manufacturer', 'product', '查看厂家信息', 'field'),
    ('contact.view', '查看联系人', 'View Contact', 'product', '查看联系人信息', 'field'),
    ('phone.view', '查看联系电话', 'View Phone', 'product', '查看联系电话', 'field')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 报价相关权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('quote.create', '创建报价', 'Create Quote', 'quote', '创建新的报价单', 'module'),
    ('quote.view', '查看报价', 'View Quotes', 'quote', '查看报价详情', 'module'),
    ('quote.edit', '编辑报价', 'Edit Quotes', 'quote', '编辑报价信息', 'module'),
    ('quote.delete', '删除报价', 'Delete Quotes', 'quote', '删除报价单', 'module'),
    ('quote.export', '导出报价', 'Export Quotes', 'quote', '导出报价数据', 'module'),
    ('quote.generate', '生成报价方案', 'Generate Quote', 'quote', '使用AI生成报价方案', 'module'),
    ('quote_market_price.view', '查看市场价', 'View Market Price', 'quote', '查看产品市场价', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 等级管理权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('admin.levels.view', '查看等级配置', 'View Level Config', 'admin', '查看等级配置信息', 'module'),
    ('admin.levels.edit', '编辑等级配置', 'Edit Level Config', 'admin', '编辑等级配置', 'module'),
    ('admin.levels.create', '创建等级', 'Create Level', 'admin', '创建新的等级', 'module'),
    ('admin.levels.delete', '删除等级', 'Delete Level', 'admin', '删除等级', 'module'),
    ('admin.levels.batch_update', '批量更新等级', 'Batch Update Levels', 'admin', '批量更新等级配置', 'module'),
    ('admin.levels.restore_defaults', '恢复默认配置', 'Restore Defaults', 'admin', '恢复等级默认配置', 'module'),
    ('admin.levels.view_history', '查看等级历史', 'View Level History', 'admin', '查看等级修改历史', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 用户管理权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('admin.users.view', '查看用户列表', 'View User List', 'admin', '查看用户列表', 'module'),
    ('admin.users.edit', '编辑用户', 'Edit Users', 'admin', '编辑用户信息', 'module'),
    ('admin.users.disable', '禁用用户', 'Disable Users', 'admin', '禁用或启用用户', 'module'),
    ('admin.users.change_role', '修改用户角色', 'Change User Role', 'admin', '修改用户角色', 'module'),
    ('admin.users.change_points', '修改用户积分', 'Change User Points', 'admin', '修改用户积分', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 权限管理权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('admin.permissions.view', '查看权限配置', 'View Permissions', 'admin', '查看权限配置', 'module'),
    ('admin.permissions.edit', '编辑权限配置', 'Edit Permissions', 'admin', '编辑权限配置', 'module'),
    ('admin.permissions.manage', '管理权限', 'Manage Permissions', 'admin', '管理权限规则', 'module'),
    ('admin.permissions.assign', '分配权限', 'Assign Permissions', 'admin', '为用户或角色分配权限', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 统计分析权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('admin.stats.view', '查看统计数据', 'View Statistics', 'admin', '查看统计数据', 'module'),
    ('admin.analytics.view', '查看分析报告', 'View Analytics', 'admin', '查看数据分析报告', 'module'),
    ('admin.audit.view', '查看审计日志', 'View Audit Logs', 'admin', '查看审计日志', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- ============================================================================
-- 账单权限 - admin.billing.view 和 admin.billing.edit
-- ============================================================================
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('admin.billing.view', '查看计费配置', 'View Billing Config', 'admin', '查看计费配置信息', 'module'),
    ('admin.billing.edit', '编辑计费配置', 'Edit Billing Config', 'admin', '编辑计费配置', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 文档相关权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('document.upload', '上传文档', 'Upload Documents', 'document', '上传文档', 'module'),
    ('document.view', '查看文档', 'View Documents', 'document', '查看文档', 'module'),
    ('document.delete', '删除文档', 'Delete Documents', 'document', '删除文档', 'module'),
    ('document.parse', '解析文档', 'Parse Documents', 'document', '解析文档内容', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- 知识库相关权限
INSERT INTO permissions (code, name, name_en, category, description, resource_type) VALUES
    ('knowledge.view', '查看知识库', 'View Knowledge Base', 'knowledge', '查看知识库内容', 'module'),
    ('knowledge.create', '创建知识库', 'Create Knowledge', 'knowledge', '创建知识库条目', 'module'),
    ('knowledge.edit', '编辑知识库', 'Edit Knowledge', 'knowledge', '编辑知识库内容', 'module'),
    ('knowledge.delete', '删除知识库', 'Delete Knowledge', 'knowledge', '删除知识库条目', 'module')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    resource_type = EXCLUDED.resource_type;

-- ============================================================================
-- 8. 插入角色权限映射数据
-- ============================================================================

-- 超级管理员（super_admin）：拥有所有权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'super_admin', id, true FROM permissions
ON CONFLICT (role, permission_id) DO UPDATE SET granted = true;

-- 管理员（admin）：大部分管理权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'admin', id, granted FROM (
    SELECT id,
        CASE
            WHEN code IN ('admin.levels.create', 'admin.levels.delete', 'admin.levels.restore_defaults',
                          'admin.permissions.manage', 'admin.permissions.assign', 'admin.billing.edit')
            THEN false
            ELSE true
        END as granted
    FROM permissions
) as sub
ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted;

-- 企业会员（enterprise_admin）：企业管理权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'enterprise_admin', id, granted FROM (
    SELECT id,
        CASE
            WHEN code IN ('admin.levels.edit', 'admin.levels.create', 'admin.levels.delete',
                          'admin.users.delete', 'admin.permissions.manage', 'admin.permissions.assign',
                          'admin.billing.edit', 'admin.audit.view')
            THEN false
            ELSE true
        END as granted
    FROM permissions
) as sub
ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted;

-- VIP会员（vip）：产品、报价、文档、知识库相关权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'vip', id, granted FROM (
    SELECT id,
        CASE
            WHEN category IN ('product', 'quote', 'document', 'knowledge')
            THEN true
            ELSE false
        END as granted
    FROM permissions
) as sub
ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted;

-- 高级会员（premium）：基础查看和创建权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'premium', id, granted FROM (
    SELECT id,
        CASE
            WHEN code IN ('product.search', 'product.view', 'product.create', 'product.import',
                          'quote.create', 'quote.view', 'quote.edit',
                          'document.upload', 'document.view', 'document.parse',
                          'knowledge.view', 'knowledge.create')
            THEN true
            ELSE false
        END as granted
    FROM permissions
) as sub
ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted;

-- 免费用户（free）：最基本的权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'free', id, granted FROM (
    SELECT id,
        CASE
            WHEN code IN ('product.search', 'product.view', 'quote.create', 'quote.view',
                          'document.upload', 'document.view', 'knowledge.view')
            THEN true
            ELSE false
        END as granted
    FROM permissions
) as sub
ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted;

-- ============================================================================
-- 9. 创建视图：用户有效权限视图
-- ============================================================================

CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT
    u.id AS user_id,
    u.email,
    u.role,
    p.id AS permission_id,
    p.code,
    p.name,
    p.name_en,
    p.category,
    p.description,
    COALESCE(up.granted, rp.granted, false) AS granted,
    COALESCE(up.expires_at, NULL) AS expires_at
FROM users u
CROSS JOIN permissions p
LEFT JOIN user_roles ur ON u.id = ur.user_id AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
LEFT JOIN role_permissions rp ON ur.role = rp.role AND rp.permission_id = p.id
LEFT JOIN user_permissions up ON u.id = up.user_id AND up.permission_id = p.id
    AND (up.expires_at IS NULL OR up.expires_at > NOW())
WHERE p.is_active = true;

COMMENT ON VIEW user_effective_permissions IS '用户有效权限视图，合并角色权限和用户特殊权限';

-- ============================================================================
-- 10. 创建视图：角色权限摘要视图
-- ============================================================================

CREATE OR REPLACE VIEW role_permissions_summary AS
SELECT
    rn.role_code,
    rn.role_name_zh,
    rn.role_name_en,
    rn.priority,
    COUNT(DISTINCT rp.permission_id) FILTER (WHERE rp.granted = true) as granted_count,
    COUNT(DISTINCT rp.permission_id) FILTER (WHERE rp.granted = false) as denied_count,
    COUNT(DISTINCT p.id) as total_permissions
FROM role_names rn
LEFT JOIN role_permissions rp ON rn.role_code = rp.role
LEFT JOIN permissions p ON p.is_active = true
GROUP BY rn.role_code, rn.role_name_zh, rn.role_name_en, rn.priority
ORDER BY rn.priority DESC;

COMMENT ON VIEW role_permissions_summary IS '角色权限摘要视图，统计各角色的权限数量';

-- ============================================================================
-- 11. 创建函数：检查用户权限
-- ============================================================================

CREATE OR REPLACE FUNCTION has_permission(
    p_user_id UUID,
    p_permission_code VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN;
BEGIN
    SELECT granted INTO v_result
    FROM user_effective_permissions
    WHERE user_id = p_user_id AND code = p_permission_code
    LIMIT 1;

    RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION has_permission(UUID, VARCHAR) IS '检查用户是否有指定权限';

-- ============================================================================
-- 12. 创建函数：获取用户权限列表
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(code VARCHAR, name VARCHAR, name_en VARCHAR, category VARCHAR, granted BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT p.code::VARCHAR, p.name::VARCHAR, p.name_en::VARCHAR, p.category::VARCHAR,
           COALESCE(uep.granted, false) AS granted
    FROM permissions p
    LEFT JOIN user_effective_permissions uep ON p.id = uep.permission_id AND uep.user_id = p_user_id
    WHERE p.is_active = true
    ORDER BY p.category, p.name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_permissions(UUID) IS '获取用户权限列表';

-- ============================================================================
-- 13. 创建函数：获取角色信息（中英文）
-- ============================================================================

CREATE OR REPLACE FUNCTION get_role_info(p_role_code VARCHAR)
RETURNS TABLE(
    role_code VARCHAR,
    role_name_zh VARCHAR,
    role_name_en VARCHAR,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT rn.role_code::VARCHAR, rn.role_name_zh::VARCHAR, rn.role_name_en::VARCHAR, rn.priority
    FROM role_names rn
    WHERE rn.role_code = p_role_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_role_info(VARCHAR) IS '获取角色信息（支持中英文）';

-- ============================================================================
-- 14. 创建函数：获取所有角色列表（中英文）
-- ============================================================================

CREATE OR REPLACE FUNCTION get_all_roles()
RETURNS TABLE(
    role_code VARCHAR,
    role_name_zh VARCHAR,
    role_name_en VARCHAR,
    description TEXT,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT rn.role_code::VARCHAR, rn.role_name_zh::VARCHAR, rn.role_name_en::VARCHAR,
           rn.description, rn.priority
    FROM role_names rn
    WHERE rn.is_active = true
    ORDER BY rn.priority DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_all_roles() IS '获取所有角色列表（支持中英文）';

-- ============================================================================
-- 15. 创建触发器：自动更新 updated_at 字段
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为相关表添加触发器
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_permissions_updated_at'
    ) THEN
        CREATE TRIGGER update_permissions_updated_at
            BEFORE UPDATE ON permissions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_role_permissions_updated_at'
    ) THEN
        CREATE TRIGGER update_role_permissions_updated_at
            BEFORE UPDATE ON role_permissions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_permissions_updated_at'
    ) THEN
        CREATE TRIGGER update_user_permissions_updated_at
            BEFORE UPDATE ON user_permissions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_role_names_updated_at'
    ) THEN
        CREATE TRIGGER update_role_names_updated_at
            BEFORE UPDATE ON role_names
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- 16. 验证迁移结果
-- ============================================================================

-- 验证权限数量
DO $$
DECLARE
    total_permissions INTEGER;
    billing_permissions INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_permissions FROM permissions;
    SELECT COUNT(*) INTO billing_permissions FROM permissions WHERE code LIKE 'admin.billing%';

    RAISE NOTICE '';
    RAISE NOTICE '========== 迁移验证结果 ==========';
    RAISE NOTICE '权限总数: %', total_permissions;
    RAISE NOTICE '账单权限数量: %', billing_permissions;
    RAISE NOTICE '';
END $$;

-- 显示角色信息（中英文）
SELECT
    role_code AS "角色代码",
    role_name_zh AS "中文名称",
    role_name_en AS "英文名称",
    priority AS "优先级"
FROM role_names
ORDER BY priority DESC;

-- 显示账单权限
SELECT
    code AS "权限代码",
    name AS "中文名称",
    name_en AS "英文名称",
    category AS "分类"
FROM permissions
WHERE code LIKE 'admin.billing%'
ORDER BY code;

-- 显示各角色的账单权限配置
SELECT
    rn.role_name_zh AS "角色",
    p.code AS "权限",
    CASE WHEN rp.granted THEN '已授权' ELSE '未授权' END AS "状态"
FROM role_names rn
LEFT JOIN role_permissions rp ON rn.role_code = rp.role
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE p.code LIKE 'admin.billing%'
ORDER BY rn.priority DESC, p.code;

-- ============================================================================
-- 迁移完成
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '============================================';
RAISE NOTICE '权限系统迁移完成！';
RAISE NOTICE '============================================';
RAISE NOTICE '';
RAISE NOTICE '已创建的表：';
RAISE NOTICE '  - role_names: 角色名称表（中英文支持）';
RAISE NOTICE '  - permissions: 权限定义表';
RAISE NOTICE '  - role_permissions: 角色权限关联表';
RAISE NOTICE '  - user_permissions: 用户权限关联表';
RAISE NOTICE '  - user_roles: 用户角色关联表';
RAISE NOTICE '';
RAISE NOTICE '已添加的账单权限：';
RAISE NOTICE '  - admin.billing.view: 查看计费配置';
RAISE NOTICE '  - admin.billing.edit: 编辑计费配置';
RAISE NOTICE '';
RAISE NOTICE '角色名称标准化（中英文支持）：';
RAISE NOTICE '  - super_admin: 超级管理员 / Super Administrator';
RAISE NOTICE '  - admin: 管理员 / Administrator';
RAISE NOTICE '  - enterprise_admin: 企业管理员 / Enterprise Admin';
RAISE NOTICE '  - vip: VIP会员 / VIP Member';
RAISE NOTICE '  - premium: 高级会员 / Premium Member';
RAISE NOTICE '  - free: 免费用户 / Free User';
RAISE NOTICE '';
