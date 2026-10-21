-- ============================================================================
-- 修复缺失的计费配置权限
-- 执行时间：2026-03-17
-- 问题描述：admin.billing.view 和 admin.billing.edit 权限未在数据库中定义
-- 导致 /api/admin/billing/config 接口返回 403 Forbidden
-- ============================================================================

-- 1. 添加缺失的权限定义
INSERT INTO permissions (code, name, category, description, resource_type) VALUES
('admin.billing.view', '查看计费配置', 'admin', '查看计费配置信息', 'module'),
('admin.billing.edit', '编辑计费配置', 'admin', '编辑计费配置', 'module')
ON CONFLICT (code) DO NOTHING;

-- 2. 为超级管理员授予这些权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'super_admin', id, true FROM permissions
WHERE code IN ('admin.billing.view', 'admin.billing.edit')
ON CONFLICT (role, permission_id) DO UPDATE SET granted = true;

-- 3. 为管理员角色授予查看权限
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'admin', id, true FROM permissions
WHERE code = 'admin.billing.view'
ON CONFLICT (role, permission_id) DO UPDATE SET granted = true;

-- 4. 验证权限已添加
SELECT
  p.code,
  p.name,
  rp.role,
  rp.granted
FROM permissions p
LEFT JOIN role_permissions rp ON p.id = rp.permission_id
WHERE p.code IN ('admin.billing.view', 'admin.billing.edit')
ORDER BY p.code, rp.role;

-- ============================================================================
-- 修复完成
-- ============================================================================
