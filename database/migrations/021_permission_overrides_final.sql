-- ============================================================================
-- 权限覆盖系统 - 完整迁移脚本
-- 表：permission_overrides（is_visible/is_editable）
--      permission_change_logs（变更日志）
--
-- 执行方式：复制此脚本到 Supabase Dashboard → SQL Editor 中执行
-- Dashboard 地址：https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql
-- ============================================================================

-- ============================================================================
-- 1. permission_overrides（权限覆盖表）
-- ============================================================================
CREATE TABLE IF NOT EXISTS permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL,            -- 'user', 'level', 'role'
    target_id VARCHAR(100) NOT NULL,             -- 用户ID / 等级值(1-5) / 角色代码
    permission_type VARCHAR(20) NOT NULL,         -- 'module', 'page', 'field', 'action'
    permission_key VARCHAR(100) NOT NULL,         -- 模块/页面/字段/按钮的唯一标识
    is_visible BOOLEAN,                           -- 是否可见（NULL=不覆盖，使用系统默认）
    is_editable BOOLEAN,                           -- 是否可编辑（NULL=不覆盖，仅字段有意义）
    priority INT DEFAULT 10,                      -- 优先级（数字越小越高），user=5, role=10, level=20
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(target_type, target_id, permission_type, permission_key)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_perm_override_target ON permission_overrides(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_perm_override_type ON permission_overrides(permission_type, permission_key);
CREATE INDEX IF NOT EXISTS idx_perm_override_priority ON permission_overrides(priority);
CREATE INDEX IF NOT EXISTS idx_perm_override_created ON permission_overrides(created_at DESC);

-- 注释
COMMENT ON TABLE permission_overrides IS '权限覆盖表 - 按用户/等级/角色维度覆盖模块/页面/字段/按钮的访问权限';
COMMENT ON COLUMN permission_overrides.target_type IS '配置维度：user(用户)、level(等级)、role(角色)';
COMMENT ON COLUMN permission_overrides.target_id IS '目标标识：用户UUID / 等级数字字符串 / 角色代码字符串';
COMMENT ON COLUMN permission_overrides.permission_type IS '权限类型：module(模块)、page(页面)、field(字段)、action(按钮)';
COMMENT ON COLUMN permission_overrides.permission_key IS '权限标识：对应的 module_key / page_key / field_key / action_key';
COMMENT ON COLUMN permission_overrides.is_visible IS '是否可见：NULL=不覆盖（用默认值），true=允许，false=禁止';
COMMENT ON COLUMN permission_overrides.is_editable IS '是否可编辑：NULL=不覆盖（用默认值），true=可编辑，false=只读';
COMMENT ON COLUMN permission_overrides.priority IS '优先级（数字越小越高），默认 user=5, role=10, level=20';

-- ============================================================================
-- 2. permission_change_logs（权限变更日志表）
-- ============================================================================
CREATE TABLE IF NOT EXISTS permission_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    change_type VARCHAR(20) NOT NULL,            -- 'add', 'update', 'delete'
    permission_type VARCHAR(20) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcl_admin ON permission_change_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_pcl_target ON permission_change_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_pcl_type ON permission_change_logs(permission_type, permission_key);
CREATE INDEX IF NOT EXISTS idx_pcl_created ON permission_change_logs(created_at DESC);

COMMENT ON TABLE permission_change_logs IS '权限变更日志 - 记录管理员对权限覆盖的所有增删改操作';

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

DROP TRIGGER IF EXISTS trg_perm_override_updated ON permission_overrides;
CREATE TRIGGER trg_perm_override_updated
    BEFORE UPDATE ON permission_overrides
    FOR EACH ROW EXECUTE FUNCTION update_perm_override_updated_at();

-- ============================================================================
-- 4. RLS 策略（仅允许已认证的管理员访问）
-- ============================================================================
ALTER TABLE permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_change_logs ENABLE ROW LEVEL SECURITY;

-- permission_overrides: 所有已认证用户可读，仅管理员可写
CREATE POLICY "perm_overrides_select" ON permission_overrides FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "perm_overrides_insert" ON permission_overrides FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "perm_overrides_update" ON permission_overrides FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "perm_overrides_delete" ON permission_overrides FOR DELETE USING (auth.role() = 'authenticated');

-- permission_change_logs: 仅管理员可写
CREATE POLICY "perm_change_logs_select" ON permission_change_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "perm_change_logs_insert" ON permission_change_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 完成
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '权限覆盖系统迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  permission_overrides     - 权限覆盖规则';
    RAISE NOTICE '  permission_change_logs   - 变更日志';
    RAISE NOTICE '========================================';
END $$;
