-- ============================================================================
-- 配置变更日志 - 建表和视图
--
-- 执行方式：复制此脚本到 Supabase Dashboard → SQL Editor 中执行
-- Dashboard 地址：https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql
-- ============================================================================

-- 1. 创建配置变更日志表
CREATE TABLE IF NOT EXISTS config_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type VARCHAR(20) NOT NULL,            -- module, page, field, action, user_override
    target_id VARCHAR(100) NOT NULL,             -- 对应记录的 ID
    old_value JSONB,                             -- 变更前完整快照
    new_value JSONB,                             -- 变更后完整快照
    change_description TEXT,                     -- 变更说明
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ccl_admin ON config_change_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_ccl_target ON config_change_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_ccl_created ON config_change_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccl_type ON config_change_logs(target_type);

-- 注释
COMMENT ON TABLE config_change_logs IS '配置变更日志 - 记录管理员对模块/页面/字段/按钮的所有修改';
COMMENT ON COLUMN config_change_logs.target_type IS '变更目标类型：module, page, field, action, user_override';
COMMENT ON COLUMN config_change_logs.target_id IS '变更目标ID';
COMMENT ON COLUMN config_change_logs.old_value IS '变更前完整快照';
COMMENT ON COLUMN config_change_logs.new_value IS '变更后完整快照';

-- 2. 创建变更历史视图（关联管理员信息）
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

-- 3. 启用 RLS
ALTER TABLE config_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccl_select" ON config_change_logs FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ccl_insert" ON config_change_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 完成
DO $$ BEGIN
    RAISE NOTICE '✅ config_change_logs 表和 v_config_change_history 视图创建成功';
END;
$$;
