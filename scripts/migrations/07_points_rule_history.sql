-- ============================================================================
-- 积分规则执行历史表
-- 创建时间: 2026-03-21
-- 说明: 记录每次积分规则执行的详细信息，用于审计和排查问题
-- ============================================================================

CREATE TABLE IF NOT EXISTS points_rule_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES points_rules(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    points_expected INTEGER,
    operation_type VARCHAR(50) NOT NULL,
    context_data JSONB DEFAULT '{}',
    conditions_matched JSONB DEFAULT '{}',
    conditions_evaluated INTEGER DEFAULT 0,
    conditions_passed INTEGER DEFAULT 0,
    execution_status VARCHAR(20) NOT NULL DEFAULT 'success',
    failure_reason TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_points_rule_history_rule_id ON points_rule_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_points_rule_history_user_id ON points_rule_history(user_id);
CREATE INDEX IF NOT EXISTS idx_points_rule_history_execution_status ON points_rule_history(execution_status);
CREATE INDEX IF NOT EXISTS idx_points_rule_history_executed_at ON points_rule_history(executed_at);

-- 注释
COMMENT ON TABLE points_rule_history IS '积分规则执行历史记录表';
COMMENT ON COLUMN points_rule_history.rule_id IS '关联的积分规则 ID';
COMMENT ON COLUMN points_rule_history.user_id IS '执行操作的用户 ID';
COMMENT ON COLUMN points_rule_history.points_awarded IS '实际发放的积分';
COMMENT ON COLUMN points_rule_history.points_expected IS '预期应发放的积分';
COMMENT ON COLUMN points_rule_history.operation_type IS '操作类型: sign_in, purchase, share 等';
COMMENT ON COLUMN points_rule_history.context_data IS '执行上下文数据 (JSON)';
COMMENT ON COLUMN points_rule_history.conditions_matched IS '匹配到的条件详情 (JSON)';
COMMENT ON COLUMN points_rule_history.conditions_evaluated IS '评估的条件总数';
COMMENT ON COLUMN points_rule_history.conditions_passed IS '通过的条件数';
COMMENT ON COLUMN points_rule_history.execution_status IS '执行状态: success, failed, skipped, limited';
COMMENT ON COLUMN points_rule_history.failure_reason IS '失败原因（仅 execution_status=failed 时有值）';
