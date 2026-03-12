-- 权限审计日志表
-- 用于记录所有权限相关操作的审计日志

CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,                    -- 操作用户ID
  username TEXT,                              -- 操作用户名（冗余）
  action VARCHAR(50) NOT NULL,                -- 操作类型：CREATE/UPDATE/DELETE/GRANT/REVOKE
  resource_type VARCHAR(50) NOT NULL,         -- 资源类型：user_level/api_permission/module_permission
  resource_id TEXT,                           -- 资源ID（可能是JSON字符串，如等级ID）
  old_value JSONB,                            -- 旧值（JSON格式）
  new_value JSONB,                            -- 新值（JSON格式）
  changes JSONB,                              -- 变更内容（格式：{field: {old, new}}）
  reason TEXT,                                -- 变更原因
  ip_address INET,                            -- 操作IP地址
  user_agent TEXT,                            -- 用户代理
  status VARCHAR(20) DEFAULT 'success',       -- 操作状态：success/failure
  error_message TEXT,                         -- 错误信息（如果有）
  metadata JSONB,                             -- 额外元数据（JSON格式）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_user_id ON permission_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_action ON permission_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_resource_type ON permission_audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_created_at ON permission_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_status ON permission_audit_logs(status);

-- 创建复合索引用于查询特定资源的变更历史
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_resource
  ON permission_audit_logs(resource_type, resource_id, created_at DESC);

-- 创建触发器自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_permission_audit_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_permission_audit_logs_updated_at
  ON permission_audit_logs;

CREATE TRIGGER trigger_update_permission_audit_logs_updated_at
  BEFORE UPDATE ON permission_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_permission_audit_logs_updated_at();

-- 添加表注释
COMMENT ON TABLE permission_audit_logs IS '权限审计日志表，记录所有权限相关操作的审计信息';
COMMENT ON COLUMN permission_audit_logs.action IS '操作类型：CREATE/UPDATE/DELETE/GRANT/REVOKE';
COMMENT ON COLUMN permission_audit_logs.resource_type IS '资源类型：user_level/api_permission/module_permission';
COMMENT ON COLUMN permission_audit_logs.changes IS '变更内容，格式：{field: {old, new}}';
COMMENT ON COLUMN permission_audit_logs.status IS '操作状态：success/failure';

-- 示例数据
-- INSERT INTO permission_audit_logs (user_id, username, action, resource_type, resource_id, changes, reason, status)
-- VALUES (
--   1,
--   'admin',
--   'UPDATE',
--   'user_level',
--   '3',
--   '{"field_permissions": {"can_view_cost_price": {"old": false, "new": true}}}',
--   '管理员手动调整权限',
--   'success'
-- );
