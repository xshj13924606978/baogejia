-- ============================================================
-- 修复: 重建 points_rules 表，对齐代码期望的完整结构
-- 说明: 现有表结构是简化版（只有11列），代码期望完整版（27列）
--       此脚本会：1) 备份现有数据 2) 删除旧表 3) 建新表 4) 迁移数据 5) 插入缺失的预设规则
-- 执行方式: 在 Supabase SQL Editor 中执行
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 备份现有数据到临时表
-- ============================================================
DROP TABLE IF EXISTS _points_rules_backup;
CREATE TABLE _points_rules_backup AS SELECT * FROM points_rules;

-- ============================================================
-- 2. 删除旧表（包含其上的 RLS 策略和触发器）
-- ============================================================
DROP TABLE IF EXISTS points_rules CASCADE;

-- ============================================================
-- 3. 创建完整结构的 points_rules 表
-- ============================================================
CREATE TABLE points_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 基本信息
  rule_name VARCHAR(200) NOT NULL,
  rule_description TEXT DEFAULT '',
  rule_type VARCHAR(20) DEFAULT 'reward',
  rule_key VARCHAR(100),
  operation_type VARCHAR(50) DEFAULT 'task_reward',

  -- 积分相关
  base_points INTEGER DEFAULT 0,
  points_formula VARCHAR(50) DEFAULT 'fixed',

  -- 限制
  max_points_per_day INTEGER,
  max_points_total INTEGER,
  conditions JSONB DEFAULT '[]',

  -- 适用范围
  user_level_min INTEGER DEFAULT 1,
  user_level_max INTEGER DEFAULT 5,
  user_roles JSONB DEFAULT '["user","vip","manufacturer","admin","super_admin"]'::jsonb,

  -- 有效期和调度
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  schedule_cron VARCHAR(100),

  -- 扩展配置 (JSONB)
  rule_config JSONB DEFAULT '{}',
  discount_config JSONB DEFAULT '{}',

  -- 状态
  is_active BOOLEAN DEFAULT true,
  is_system_rule BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,

  -- 审计
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_points_rules_rule_type ON points_rules(rule_type);
CREATE INDEX idx_points_rules_rule_key ON points_rules(rule_key);
CREATE INDEX idx_points_rules_is_active ON points_rules(is_active);
CREATE INDEX idx_points_rules_operation_type ON points_rules(operation_type);
CREATE INDEX idx_points_rules_priority ON points_rules(priority DESC);

-- RLS
ALTER TABLE points_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY points_rules_select_all ON points_rules FOR SELECT USING (true);
CREATE POLICY points_rules_service_all ON points_rules FOR ALL USING (true);

-- 注释
COMMENT ON TABLE points_rules IS '积分规则配置表（支持奖励/消耗/Token三类规则）';
COMMENT ON COLUMN points_rules.rule_type IS '规则类型: reward(奖励), consume(消耗积分), token(Token计费)';
COMMENT ON COLUMN points_rules.rule_key IS '规则标识键，用于业务代码调用';
COMMENT ON COLUMN points_rules.rule_config IS '规则配置(JSONB)，按rule_type存储不同结构';
COMMENT ON COLUMN points_rules.discount_config IS '等级折扣配置(JSONB)';

-- ============================================================
-- 4. 从备份表迁移现有数据（映射列名）
-- ============================================================
INSERT INTO points_rules (
  id,
  rule_key,
  rule_name,
  rule_description,
  rule_type,
  operation_type,
  base_points,
  points_formula,
  max_points_per_day,
  max_points_total,
  conditions,
  user_level_min,
  user_level_max,
  user_roles,
  is_active,
  is_system_rule,
  priority,
  rule_config,
  discount_config,
  created_at,
  updated_at
)
SELECT
  id,
  rule_key,
  rule_name,
  COALESCE(description, ''),
  rule_type,
  -- 根据 rule_type 和 rule_key 推断 operation_type
  CASE
    WHEN rule_key = 'daily_login' THEN 'daily_login'
    WHEN rule_key = 'upload_file' THEN 'upload_file'
    WHEN rule_key = 'share_knowledge' THEN 'task_reward'
    WHEN rule_key = 'invite_friend' THEN 'invite_reward'
    WHEN rule_key = 'register' THEN 'register'
    WHEN rule_type = 'consume' THEN 'generate_proposal'
    WHEN rule_key IN ('quote_generate', 'proposal_generate') THEN 'generate_proposal'
    WHEN rule_key = 'pdf_parse' THEN 'parse_document'
    ELSE 'task_reward'
  END,
  -- base_points: 从 rule_config 中提取
  COALESCE((rule_config->>'points')::INTEGER, 0),
  'fixed',
  -- max_points_per_day: 从 rule_config 中提取
  CASE
    WHEN rule_config->>'daily_limit' IS NOT NULL AND (rule_config->>'daily_limit') != 'null' THEN (rule_config->>'daily_limit')::INTEGER
    ELSE NULL
  END,
  -- max_points_total: 从 rule_config 中提取
  CASE
    WHEN rule_config->>'total_limit' IS NOT NULL AND (rule_config->>'total_limit') != 'null' THEN (rule_config->>'total_limit')::INTEGER
    ELSE NULL
  END,
  '[]'::jsonb,
  1,
  5,
  '["user","vip","manufacturer","admin","super_admin"]'::jsonb,
  -- is_active: 从 is_enabled 映射
  COALESCE(is_enabled, true),
  true,  -- 现有规则视为系统预设
  -- priority: 使用 sort_order，如果不存在则用 50
  COALESCE(sort_order, priority, 50),
  rule_config,
  discount_config,
  created_at,
  updated_at
FROM _points_rules_backup
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. 补充插入缺失的预设规则（数据库中不存在的）
-- ============================================================

-- 注册奖励（现有数据中可能没有）
INSERT INTO points_rules (rule_key, rule_name, rule_description, rule_type, operation_type, base_points, points_formula, max_points_per_day, max_points_total, conditions, user_level_min, user_level_max, user_roles, is_active, is_system_rule, priority, rule_config, discount_config)
VALUES
  (
    'register', '新用户注册', '新用户注册奖励积分',
    'reward', 'register', 100, 'fixed', 1, 1, '[]', 1, 5, '["user","vip","manufacturer"]',
    true, true, 95,
    '{"points":100,"trigger_condition":"register","daily_limit":1,"total_limit":1}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- 消耗类规则（现有数据中没有 consume 类型）
INSERT INTO points_rules (rule_key, rule_name, rule_description, rule_type, operation_type, base_points, points_formula, max_points_per_day, max_points_total, conditions, user_level_min, user_level_max, user_roles, is_active, is_system_rule, priority, rule_config, discount_config)
VALUES
  (
    'quote_generate_consume', '生成报价消耗积分', '用户生成报价单消耗积分',
    'consume', 'generate_proposal', 10, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 90,
    '{"base_cost":10,"unit_cost":2,"unit_type":"product_count","min_balance":0}'::jsonb,
    '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb
  ),
  (
    'export_report', '导出报告消耗积分', '用户导出报告消耗积分',
    'consume', 'export_quote', 5, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 80,
    '{"base_cost":5,"unit_cost":0,"unit_type":"fixed","min_balance":0}'::jsonb,
    '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb
  ),
  (
    'enhance_proposal', '方案增强消耗积分', '用户增强方案消耗积分',
    'consume', 'enhance_proposal', 15, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 85,
    '{"base_cost":15,"unit_cost":0,"unit_type":"fixed","min_balance":0}'::jsonb,
    '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- Token计费类缺失规则
INSERT INTO points_rules (rule_key, rule_name, rule_description, rule_type, operation_type, base_points, points_formula, max_points_per_day, max_points_total, conditions, user_level_min, user_level_max, user_roles, is_active, is_system_rule, priority, rule_config, discount_config)
VALUES
  (
    'quote_generate_token', '生成报价Token计费', '生成报价按产品数量消耗Token',
    'token', 'generate_proposal', 10, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 95,
    '{"base_tokens":10,"unit_tokens":2,"unit_type":"product_count","min_balance":0}'::jsonb,
    '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb
  ),
  (
    'ai_chat_token', 'AI对话Token计费', '每次AI对话消耗Token',
    'token', 'chat', 5, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 90,
    '{"base_tokens":5,"unit_tokens":0,"unit_type":"fixed","min_balance":0}'::jsonb,
    '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb
  ),
  (
    'pdf_parse_token', 'PDF解析Token计费', 'PDF文件解析按页数消耗Token',
    'token', 'parse_document', 3, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 85,
    '{"base_tokens":3,"unit_tokens":1,"unit_type":"page_count","min_balance":0}'::jsonb,
    '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. 创建 updated_at 自动更新触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_points_rules_updated_at ON points_rules;
CREATE TRIGGER update_points_rules_updated_at
  BEFORE UPDATE ON points_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. 清理备份表
-- ============================================================
DROP TABLE IF EXISTS _points_rules_backup;

-- ============================================================
-- 8. 创建缺失的积分相关表
-- ============================================================

-- point_records 积分变动记录表
CREATE TABLE IF NOT EXISTS point_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_id VARCHAR(100),
  description TEXT,
  balance_after INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_point_records_user_id ON point_records(user_id);
CREATE INDEX IF NOT EXISTS idx_point_records_type ON point_records(type);
CREATE INDEX IF NOT EXISTS idx_point_records_created_at ON point_records(created_at);
COMMENT ON TABLE point_records IS '积分变动记录表';

-- user_token_balance 用户余额表
CREATE TABLE IF NOT EXISTS user_token_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  points_balance INTEGER DEFAULT 0,
  token_balance INTEGER DEFAULT 0,
  total_consumed_tokens INTEGER DEFAULT 0,
  total_consumed_points INTEGER DEFAULT 0,
  total_recharged_points INTEGER DEFAULT 0,
  total_recharged_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_token_balance_user_id ON user_token_balance(user_id);
COMMENT ON TABLE user_token_balance IS '用户积分/Token余额汇总表';

-- token_consumption_log Token 消费记录表
CREATE TABLE IF NOT EXISTS token_consumption_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id UUID,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  points_consumed INTEGER DEFAULT 0,
  token_rate DECIMAL(10,4) DEFAULT 1.0,
  user_level INTEGER DEFAULT 1,
  service_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_consumption_user_id ON token_consumption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_token_consumption_created_at ON token_consumption_log(created_at);
COMMENT ON TABLE token_consumption_log IS 'Token消费明细记录表';

-- 为现有用户初始化余额记录
INSERT INTO user_token_balance (user_id, points_balance)
SELECT id, 100
FROM users
WHERE id NOT IN (SELECT user_id FROM user_token_balance)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. 刷新 PostgREST schema 缓存
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 10. 验证结果
-- ============================================================
DO $$
DECLARE
  total_rules INTEGER;
  reward_count INTEGER;
  consume_count INTEGER;
  token_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_rules FROM points_rules;
  SELECT COUNT(*) INTO reward_count FROM points_rules WHERE rule_type = 'reward';
  SELECT COUNT(*) INTO consume_count FROM points_rules WHERE rule_type = 'consume';
  SELECT COUNT(*) INTO token_count FROM points_rules WHERE rule_type = 'token';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'points_rules 表重建完成';
  RAISE NOTICE '总规则数: % (奖励: %, 消耗: %, Token: %)', total_rules, reward_count, consume_count, token_count;
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
