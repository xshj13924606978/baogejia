-- ============================================================================
-- 积分系统数据库表结构修复
-- 创建时间: 2026-03-17
-- 说明: 修复 point_logs 表的 user_id 字段类型，从 INTEGER 改为 UUID
-- ============================================================================

-- 1. 删除现有的 point_logs 表（如果存在）
DROP TABLE IF EXISTS point_logs CASCADE;

-- 2. 重新创建 point_logs 表，使用正确的 UUID 类型
CREATE TABLE point_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX idx_point_logs_user_id ON point_logs(user_id);
CREATE INDEX idx_point_logs_type ON point_logs(type);
CREATE INDEX idx_point_logs_created_at ON point_logs(created_at);

-- 4. 启用 RLS
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;

-- 5. 创建 RLS 策略
CREATE POLICY "用户可以查看自己的积分流水" ON point_logs
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "服务角色可以插入积分流水" ON point_logs
    FOR INSERT WITH CHECK (true);

-- 6. 授予必要的权限
GRANT SELECT, INSERT ON point_logs TO authenticated;
GRANT SELECT, INSERT ON point_logs TO service_role;

-- ============================================================================
-- 历史 SQL：禁止人工直跑；统一流程见 docs/MIGRATION_RUNNER.md。
-- 低于 127 的版本须先形成单独审阅的替代或收编方案。
-- ============================================================================
