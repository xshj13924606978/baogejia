-- ============================================================
-- 049_user_logs.sql
-- 用户操作日志表（user_logs）
-- 幂等迁移：可重复执行（表已存在时跳过）
--
-- 设计说明：
--   - user_id 关联 users(id)，ON DELETE CASCADE
--   - action_type 白名单：login, logout, upload, download, delete,
--     update, view, share, export, search（应用层校验）
--   - action_details 存 JSON 结构化详情
--   - RLS 启用：用户仅可 SELECT 自己的日志；INSERT/UPDATE/DELETE
--     一律拒绝，写入必须走 service_role（应用层 API）
--   - 保留 90 天，由 cleanup_old_user_logs() 清理（scheduler 每日调用）
-- ============================================================

-- ============================================================
-- 1. 创建 user_logs 表（幂等）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_id UUID,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 2. 字段注释（幂等）
-- ============================================================
COMMENT ON TABLE user_logs IS '用户操作日志表，记录所有用户行为';
COMMENT ON COLUMN user_logs.user_id IS '操作用户ID，关联users表';
COMMENT ON COLUMN user_logs.action_type IS '操作类型：login, logout, upload, download, delete, update, view, share, export, search';
COMMENT ON COLUMN user_logs.action_details IS '操作详情JSON，如：{"file_id":"xxx","file_name":"xxx"}';
COMMENT ON COLUMN user_logs.ip_address IS '客户端IP地址';
COMMENT ON COLUMN user_logs.user_agent IS '客户端User-Agent';
COMMENT ON COLUMN user_logs.session_id IS '会话ID，用于追踪同一会话的操作序列';
COMMENT ON COLUMN user_logs.duration_ms IS '操作耗时（毫秒），用于性能监控';
COMMENT ON COLUMN user_logs.created_at IS '操作时间';

-- ============================================================
-- 3. 创建索引（幂等）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON user_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_logs_action_type ON user_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_user_logs_user_created ON user_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_logs_action_created ON user_logs(action_type, created_at DESC);

-- 部分索引：只索引错误/异常操作（默认启用）
CREATE INDEX IF NOT EXISTS idx_user_logs_errors ON user_logs(created_at)
    WHERE action_details->>'error' IS NOT NULL;

-- ============================================================
-- 4. 外键约束（已包含在 CREATE TABLE 中，幂等）
-- ============================================================

-- ============================================================
-- 5. RLS (Row Level Security) 策略（幂等）
-- ============================================================
ALTER TABLE user_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own logs" ON user_logs;
CREATE POLICY "Users can view own logs"
    ON user_logs
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cannot insert directly" ON user_logs;
CREATE POLICY "Users cannot insert directly"
    ON user_logs
    FOR INSERT
    WITH CHECK (false);

DROP POLICY IF EXISTS "Users cannot update logs" ON user_logs;
CREATE POLICY "Users cannot update logs"
    ON user_logs
    FOR UPDATE
    USING (false);

DROP POLICY IF EXISTS "Users cannot delete logs" ON user_logs;
CREATE POLICY "Users cannot delete logs"
    ON user_logs
    FOR DELETE
    USING (false);

-- service_role key 绕过所有 RLS，无需额外策略（应用层 API 写入）

-- ============================================================
-- 6. 自动清理策略（幂等）- 保留 90 天
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_user_logs()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM user_logs
    WHERE created_at < NOW() - INTERVAL '90 days'
    RETURNING 1 INTO deleted_count;
    RETURN COALESCE(deleted_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. 验证（可选执行）
-- ============================================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_logs' ORDER BY ordinal_position;
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'user_logs';
--
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_logs';
