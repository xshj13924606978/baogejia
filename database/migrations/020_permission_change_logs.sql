-- ============================================================================
-- 权限变更日志表
-- 记录管理员对权限覆盖的所有增删改操作
-- ============================================================================
CREATE TABLE IF NOT EXISTS permission_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type VARCHAR(20) NOT NULL,          -- 被配置的维度：user/level/role
    target_id VARCHAR(100) NOT NULL,           -- 被配置的对象ID
    change_type VARCHAR(20) NOT NULL,          -- add/update/delete
    permission_type VARCHAR(20) NOT NULL,      -- module/page/field/action
    permission_key VARCHAR(100) NOT NULL,      -- 权限标识
    old_value JSONB,                           -- 变更前
    new_value JSONB,                           -- 变更后
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcl_admin ON permission_change_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_pcl_target ON permission_change_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_pcl_type ON permission_change_logs(permission_type, permission_key);
CREATE INDEX IF NOT EXISTS idx_pcl_created ON permission_change_logs(created_at DESC);

COMMENT ON TABLE permission_change_logs IS '权限变更日志 - 记录管理员对权限覆盖的所有增删改操作';
