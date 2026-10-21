-- ============================================================================
-- 修复积分相关功能的权限和表结构
-- 执行时间：2026-03-17
-- 问题描述：
--   1. 积分规则配置页面 403 错误 - 缺少 admin.billing.view 权限
--   2. 积分流水页面 500 错误 - 可能缺少 point_logs 表或权限
-- ============================================================================

-- ============================================================================
-- 第一部分：修复权限定义
-- ============================================================================

-- 1. 确保 admin.billing.view 权限存在
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('admin.billing.view', '查看计费配置', 'admin', '查看计费配置信息', 'module'),
('admin.billing.edit', '编辑计费配置', 'admin', '编辑计费配置', 'module'),
('admin.points.view', '查看积分流水', 'admin', '查看所有用户的积分流水记录', 'module'),
('admin.points.manage', '管理积分', 'admin', '管理用户积分，包括手动调整', 'module')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  resource_type = EXCLUDED.resource_type;

-- 2. 为超级管理员授予所有积分相关权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'super_admin', id, true FROM permissions
WHERE code IN ('admin.billing.view', 'admin.billing.edit', 'admin.points.view', 'admin.points.manage')
ON CONFLICT (role, permission_id) DO UPDATE SET granted = true;

-- 3. 为管理员角色授予查看权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'admin', id, true FROM permissions
WHERE code IN ('admin.billing.view', 'admin.points.view')
ON CONFLICT (role, permission_id) DO UPDATE SET granted = true;

-- ============================================================================
-- 第二部分：确保 point_logs 表存在
-- ============================================================================

-- 检查 point_logs 表是否存在，不存在则创建
CREATE TABLE IF NOT EXISTS point_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_point_logs_user_id ON point_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created_at ON point_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_point_logs_type ON point_logs(type);

-- 添加注释
COMMENT ON TABLE point_logs IS '积分变动流水记录';
COMMENT ON COLUMN point_logs.user_id IS '用户ID';
COMMENT ON COLUMN point_logs.points IS '积分变动数量（正数为获得，负数为消费）';
COMMENT ON COLUMN point_logs.type IS '变动类型：register, login, upload, reward, consume, exchange 等';
COMMENT ON COLUMN point_logs.description IS '变动说明';
COMMENT ON COLUMN point_logs.balance_after IS '变动后的积分余额';

-- ============================================================================
-- 第三部分：验证修复结果
-- ============================================================================

-- 验证权限配置
SELECT
    p.code AS permission_code,
    p.name AS permission_name,
    rp.role,
    rp.granted
FROM permissions p
LEFT JOIN role_permissions rp ON p.id = rp.permission_id
WHERE p.code LIKE 'admin.billing%' OR p.code LIKE 'admin.points%'
ORDER BY p.code, rp.role;

-- 验证表结构
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'point_logs'
ORDER BY ordinal_position;

-- ============================================================================
-- 修复完成
-- ============================================================================
