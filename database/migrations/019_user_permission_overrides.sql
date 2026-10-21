-- ============================================================================
-- 用户级权限覆盖系统 - 迁移脚本
-- 执行时间：2026-03-22
-- 功能：支持按用户/等级/角色维度，对模块/页面/字段/按钮进行权限覆盖
-- ============================================================================

-- ============================================================================
-- 1. user_permission_overrides（用户权限覆盖表）
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL,            -- 'user', 'level', 'role'
    target_id VARCHAR(100) NOT NULL,             -- 用户ID / 等级值(1-5) / 角色代码
    permission_type VARCHAR(20) NOT NULL,         -- 'module', 'page', 'field', 'action'
    permission_key VARCHAR(100) NOT NULL,         -- 模块module_key / 页面page_key / 字段field_key / 按钮action_key
    permission_value JSONB NOT NULL,              -- {"visible": true/false, "editable": true/false}
    priority INT DEFAULT 10,                      -- 优先级（数字越小越高），user=5, role=10, level=20
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(target_type, target_id, permission_type, permission_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_perm_override_target ON user_permission_overrides(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_perm_override_type ON user_permission_overrides(permission_type, permission_key);
CREATE INDEX IF NOT EXISTS idx_perm_override_priority ON user_permission_overrides(priority);
CREATE INDEX IF NOT EXISTS idx_perm_override_created ON user_permission_overrides(created_at DESC);

-- 注释
COMMENT ON TABLE user_permission_overrides IS '用户权限覆盖表 - 按用户/等级/角色维度覆盖模块/页面/字段/按钮的访问权限';
COMMENT ON COLUMN user_permission_overrides.target_type IS '配置维度：user(用户)、level(等级)、role(角色)';
COMMENT ON COLUMN user_permission_overrides.target_id IS '目标标识：用户UUID / 等级数字字符串 / 角色代码字符串';
COMMENT ON COLUMN user_permission_overrides.permission_type IS '权限类型：module(模块)、page(页面)、field(字段)、action(按钮)';
COMMENT ON COLUMN user_permission_overrides.permission_key IS '权限标识：对应的 module_key / page_key / field_key / action_key';
COMMENT ON COLUMN user_permission_overrides.permission_value IS '权限值：{"visible": true/false, "editable": true/false}';
COMMENT ON COLUMN user_permission_overrides.priority IS '优先级（数字越小越高），默认 user=5, role=10, level=20';

-- ============================================================================
-- 2. config_change_events（配置变更事件表）
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_type VARCHAR(50) NOT NULL,             -- 'permission_override', 'module_update', 'page_update', etc.
    description TEXT,                             -- 变更描述
    target_users UUID[],                          -- 受影响的用户列表（用于通知推送）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT false                -- 是否已推送给客户端
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cce_type ON config_change_events(change_type);
CREATE INDEX IF NOT EXISTS idx_cce_processed ON config_change_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_cce_created ON config_change_events(created_at DESC);

-- 注释
COMMENT ON TABLE config_change_events IS '配置变更事件表 - 记录权限/配置变更，用于向客户端推送实时通知';
COMMENT ON COLUMN config_change_events.target_users IS '受影响的用户ID数组，用于定向推送通知';
COMMENT ON COLUMN config_change_events.processed IS '是否已通过 WebSocket/SSE 推送给客户端';

-- ============================================================================
-- 3. 触发器：自动更新 updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_perm_override_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_perm_override_updated ON user_permission_overrides;
CREATE TRIGGER trg_perm_override_updated
    BEFORE UPDATE ON user_permission_overrides
    FOR EACH ROW EXECUTE FUNCTION update_perm_override_updated_at();

-- ============================================================================
-- 完成提示
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '用户权限覆盖系统迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  user_permission_overrides - 权限覆盖规则';
    RAISE NOTICE '  config_change_events     - 变更事件通知';
    RAISE NOTICE '========================================';
END $$;
