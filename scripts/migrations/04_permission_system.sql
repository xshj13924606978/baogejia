-- ============================================================================
-- 统一权限管理系统 - 数据库迁移脚本
-- 执行时间：2026-03-12
-- 版本：v2.0.0
-- ============================================================================

-- ============================================================================
-- 1. 权限定义表（permissions）
-- 用于定义系统中所有的权限项
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,        -- 权限代码，如 'user.create'
  name VARCHAR(100) NOT NULL,                -- 权限名称，如 '创建用户'
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
CREATE INDEX idx_permissions_code ON permissions(code);
CREATE INDEX idx_permissions_category ON permissions(category);
CREATE INDEX idx_permissions_resource_type ON permissions(resource_type);
CREATE INDEX idx_permissions_is_active ON permissions(is_active);

-- ============================================================================
-- 2. 角色权限关联表（role_permissions）
-- 用于定义角色与权限的映射关系
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,                 -- 角色名称：free, premium, vip, enterprise_admin, super_admin
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT true,              -- 是否授予：true=授予, false=拒绝
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role, permission_id)
);

-- 创建索引
CREATE INDEX idx_role_permissions_role ON role_permissions(role);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX idx_role_permissions_granted ON role_permissions(granted);

-- ============================================================================
-- 3. 用户权限关联表（user_permissions）
-- 用于给特定用户授予或拒绝特定权限（覆盖默认角色权限）
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT true,              -- true=授予, false=拒绝
  reason VARCHAR(200),                       -- 授予/拒绝的原因
  expires_at TIMESTAMP,                      -- 过期时间（可选）
  created_by INTEGER REFERENCES users(id),   -- 操作人
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, permission_id)
);

-- 创建索引
CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission_id ON user_permissions(permission_id);
CREATE INDEX idx_user_permissions_granted ON user_permissions(granted);
CREATE INDEX idx_user_permissions_expires_at ON user_permissions(expires_at);

-- ============================================================================
-- 4. 创建触发器：自动更新 updated_at 字段
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_role_permissions_updated_at
    BEFORE UPDATE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_permissions_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. 插入基础权限数据
-- ============================================================================

-- 用户相关权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('user.view', '查看用户', 'user', '查看用户列表和详情', 'module'),
('user.create', '创建用户', 'user', '创建新用户', 'module'),
('user.edit', '编辑用户', 'user', '编辑用户信息', 'module'),
('user.delete', '删除用户', 'user', '删除用户', 'module'),
('user.manage', '管理用户', 'user', '管理用户权限和角色', 'module'),
('user.search', '搜索用户', 'user', '搜索用户', 'module');

-- 产品相关权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('product.search', '搜索产品', 'product', '搜索产品信息', 'module'),
('product.view', '查看产品', 'product', '查看产品详情', 'module'),
('product.edit', '编辑产品', 'product', '编辑产品信息', 'module'),
('product.delete', '删除产品', 'product', '删除产品', 'module'),
('product.export', '导出产品', 'product', '导出产品数据', 'module'),
('product.create', '创建产品', 'product', '创建新产品', 'module');

-- 成本相关权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('cost_price.view', '查看成本价', 'product', '查看产品成本价', 'field'),
('cost_price.edit', '编辑成本价', 'product', '编辑产品成本价', 'field'),
('min_price.view', '查看最低售价', 'product', '查看产品最低售价', 'field'),
('manufacturer.view', '查看厂家信息', 'product', '查看厂家信息', 'field'),
('contact.view', '查看联系人', 'product', '查看联系人信息', 'field'),
('phone.view', '查看联系电话', 'product', '查看联系电话', 'field');

-- 报价相关权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('quote.create', '创建报价', 'quote', '创建新的报价单', 'module'),
('quote.view', '查看报价', 'quote', '查看报价详情', 'module'),
('quote.edit', '编辑报价', 'quote', '编辑报价信息', 'module'),
('quote.delete', '删除报价', 'quote', '删除报价单', 'module'),
('quote.export', '导出报价', 'quote', '导出报价数据', 'module'),
('quote.generate', '生成报价方案', 'quote', '使用AI生成报价方案', 'module'),
('quote_market_price.view', '查看市场价', 'quote', '查看产品市场价', 'module');

-- 等级管理权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('admin.levels.view', '查看等级配置', 'admin', '查看等级配置信息', 'module'),
('admin.levels.edit', '编辑等级配置', 'admin', '编辑等级配置', 'module'),
('admin.levels.create', '创建等级', 'admin', '创建新的等级', 'module'),
('admin.levels.delete', '删除等级', 'admin', '删除等级', 'module'),
('admin.levels.batch_update', '批量更新等级', 'admin', '批量更新等级配置', 'module'),
('admin.levels.restore_defaults', '恢复默认配置', 'admin', '恢复等级默认配置', 'module'),
('admin.levels.view_history', '查看等级历史', 'admin', '查看等级修改历史', 'module');

-- 用户管理权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('admin.users.view', '查看用户列表', 'admin', '查看用户列表', 'module'),
('admin.users.edit', '编辑用户', 'admin', '编辑用户信息', 'module'),
('admin.users.disable', '禁用用户', 'admin', '禁用或启用用户', 'module'),
('admin.users.change_role', '修改用户角色', 'admin', '修改用户角色', 'module'),
('admin.users.change_points', '修改用户积分', 'admin', '修改用户积分', 'module');

-- 权限管理权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('admin.permissions.view', '查看权限配置', 'admin', '查看权限配置', 'module'),
('admin.permissions.edit', '编辑权限配置', 'admin', '编辑权限配置', 'module'),
('admin.permissions.manage', '管理权限', 'admin', '管理权限规则', 'module'),
('admin.permissions.assign', '分配权限', 'admin', '为用户或角色分配权限', 'module');

-- 统计分析权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('admin.stats.view', '查看统计数据', 'admin', '查看统计数据', 'module'),
('admin.analytics.view', '查看分析报告', 'admin', '查看数据分析报告', 'module'),
('admin.audit.view', '查看审计日志', 'admin', '查看审计日志', 'module');

-- 文档相关权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('document.upload', '上传文档', 'document', '上传文档', 'module'),
('document.view', '查看文档', 'document', '查看文档', 'module'),
('document.delete', '删除文档', 'document', '删除文档', 'module'),
('document.parse', '解析文档', 'document', '解析文档内容', 'module');

-- 知识库相关权限
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('knowledge.view', '查看知识库', 'knowledge', '查看知识库内容', 'module'),
('knowledge.create', '创建知识库', 'knowledge', '创建知识库条目', 'module'),
('knowledge.edit', '编辑知识库', 'knowledge', '编辑知识库内容', 'module'),
('knowledge.delete', '删除知识库', 'knowledge', '删除知识库条目', 'module');

-- ============================================================================
-- 6. 插入角色权限映射数据
-- ============================================================================

-- 超级管理员：拥有所有权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'super_admin', id, true FROM permissions;

-- 企业会员 (enterprise_admin)：大部分权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'enterprise_admin', id, granted FROM (
  SELECT id, 
    CASE 
      WHEN code IN ('admin.levels.edit', 'admin.levels.create', 'admin.levels.delete', 
                    'admin.users.delete', 'admin.permissions.manage') 
      THEN false 
      ELSE true 
    END as granted
  FROM permissions
) as sub;

-- VIP会员 (vip)：产品、报价、文档、知识库相关权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'vip', id, granted FROM (
  SELECT id,
    CASE 
      WHEN category IN ('product', 'quote', 'document', 'knowledge') 
      THEN true 
      ELSE false 
    END as granted
  FROM permissions
) as sub;

-- 普通会员 (premium)：基础查看和创建权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'premium', id, granted FROM (
  SELECT id,
    CASE 
      WHEN code IN ('product.search', 'product.view', 'quote.create', 'quote.view',
                    'document.upload', 'document.view', 'knowledge.view')
      THEN true 
      ELSE false 
    END as granted
  FROM permissions
) as sub;

-- 免费用户：最基本的权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'free', id, granted FROM (
  SELECT id,
    CASE 
      WHEN code = 'product.search' 
      THEN true 
      ELSE false 
    END as granted
  FROM permissions
) as sub;

-- ============================================================================
-- 7. 创建视图：用户有效权限视图
-- 用于快速查询用户的实际权限（考虑角色权限和用户特殊权限）
-- ============================================================================

CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT
  u.id AS user_id,
  u.email,
  u.role,
  p.id AS permission_id,
  p.code,
  p.name,
  p.category,
  p.description,
  COALESCE(up.granted, rp.granted, false) AS granted,
  COALESCE(up.expires_at, NULL) AS expires_at
FROM users u
CROSS JOIN permissions p
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN role_permissions rp ON ur.role = rp.role AND rp.permission_id = p.id
LEFT JOIN user_permissions up ON u.id = up.user_id AND up.permission_id = p.id
WHERE up.expires_at IS NULL OR up.expires_at > NOW();

-- ============================================================================
-- 8. 创建函数：检查用户权限
-- ============================================================================

CREATE OR REPLACE FUNCTION has_permission(
  p_user_id INTEGER,
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

CREATE OR REPLACE FUNCTION check_api_permission(
  p_user_id INTEGER,
  p_api_path VARCHAR,
  p_method VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  -- 检查是否有匹配的 API 权限
  SELECT granted INTO v_result
  FROM user_effective_permissions uep
  JOIN permissions p ON uep.permission_id = p.id
  WHERE uep.user_id = p_user_id
    AND p.resource_type = 'api'
    AND p.resource_path = p_api_path
    AND p.method = p_method
  LIMIT 1;
  
  -- 如果没有找到精确匹配，检查通配符权限
  IF v_result IS NULL THEN
    SELECT granted INTO v_result
    FROM user_effective_permissions uep
    JOIN permissions p ON uep.permission_id = p.id
    WHERE uep.user_id = p_user_id
      AND p.code = 'admin.permissions.manage'
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. 创建函数：获取用户权限列表
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id INTEGER)
RETURNS TABLE(code VARCHAR, name VARCHAR, category VARCHAR, granted BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT p.code, p.name, p.category, COALESCE(uep.granted, false) AS granted
  FROM permissions p
  LEFT JOIN user_effective_permissions uep ON p.id = uep.permission_id AND uep.user_id = p_user_id
  WHERE p.is_active = true
  ORDER BY p.category, p.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. 添加注释
-- ============================================================================

COMMENT ON TABLE permissions IS '权限定义表';
COMMENT ON TABLE role_permissions IS '角色权限关联表';
COMMENT ON TABLE user_permissions IS '用户额外权限表';
COMMENT ON VIEW user_effective_permissions IS '用户有效权限视图';
COMMENT ON FUNCTION has_permission(INTEGER, VARCHAR) IS '检查用户是否有指定权限';
COMMENT ON FUNCTION check_api_permission(INTEGER, VARCHAR, VARCHAR) IS '检查用户是否有API访问权限';
COMMENT ON FUNCTION get_user_permissions(INTEGER) IS '获取用户权限列表';

-- ============================================================================
-- 迁移完成
-- ============================================================================
