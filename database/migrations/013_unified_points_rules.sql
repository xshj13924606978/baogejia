-- ============================================================
-- 迁移脚本: 统一积分规则系统扩展
-- 版本: 013
-- 说明: 扩展 points_rules 表支持奖励/消耗/Token 三类规则，
--       新建 points_transactions 统一交易记录表，
--       为 users 表添加 tokens 字段
-- 核心原则: 只增不减，不删除/不修改任何现有代码和数据库字段
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 扩展 points_rules 表（新增字段，不修改现有字段）
-- ============================================================

-- 规则类型: reward(奖励类), consume(消耗类), token(Token计费类)
ALTER TABLE points_rules
ADD COLUMN IF NOT EXISTS rule_type VARCHAR(20) DEFAULT 'reward';

-- 规则配置 (JSONB，按 rule_type 存储不同结构)
-- reward: {"points":10,"trigger_condition":"upload_file","daily_limit":5,"total_limit":null}
-- consume: {"base_cost":10,"unit_cost":2,"unit_type":"product_count","min_balance":0}
-- token: {"base_tokens":10,"unit_tokens":2,"unit_type":"product_count","min_balance":0}
ALTER TABLE points_rules
ADD COLUMN IF NOT EXISTS rule_config JSONB DEFAULT '{}';

-- 等级折扣配置 (JSONB，消耗类和Token类适用)
-- {"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},...]}
ALTER TABLE points_rules
ADD COLUMN IF NOT EXISTS discount_config JSONB DEFAULT '{}';

-- 规则标识键（用于业务代码调用，如 'upload_file', 'quote_generate'）
ALTER TABLE points_rules
ADD COLUMN IF NOT EXISTS rule_key VARCHAR(100);

-- 排序权重（数值越大越靠前）
ALTER TABLE points_rules
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- 规则来源标记
ALTER TABLE points_rules
ADD COLUMN IF NOT EXISTS is_system_rule BOOLEAN DEFAULT false;

-- 添加规则类型索引
CREATE INDEX IF NOT EXISTS idx_points_rules_rule_type ON points_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_points_rules_rule_key ON points_rules(rule_key);
CREATE INDEX IF NOT EXISTS idx_points_rules_is_active ON points_rules(is_active);

-- 为现有数据设置默认 rule_type 和 rule_key
UPDATE points_rules
SET rule_type = 'reward',
    rule_key = LOWER(REPLACE(rule_name, ' ', '_'))
WHERE rule_type IS NULL OR rule_type = 'reward';

-- ============================================================
-- 2. 创建 points_transactions 统一交易记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES points_rules(id) ON DELETE SET NULL,

  -- 交易类型: reward(奖励), consume(消耗积分), token(消耗Token)
  transaction_type VARCHAR(20) NOT NULL,

  -- 变化数量（正为增加，负为扣除）
  amount INTEGER NOT NULL,

  -- 数值类型: points(积分), tokens(Token)
  amount_type VARCHAR(10) DEFAULT 'points',

  -- 余额快照
  balance_before INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,

  -- 计量单位数（如产品数量、页数）
  unit_count INTEGER DEFAULT 1,

  -- 实际折扣（1.0=无折扣，0.5=五折）
  discount_applied NUMERIC(3,2) DEFAULT 1.0,

  -- 关联业务ID（如 quoteId, fileId）
  reference_id VARCHAR(100),

  -- 扩展元数据
  metadata JSONB DEFAULT '{}',

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 交易表索引
CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_rule_id ON points_transactions(rule_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_type ON points_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_points_transactions_amount_type ON points_transactions(amount_type);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at ON points_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_points_transactions_reference_id ON points_transactions(reference_id);

-- 用户每日统计索引（用于每日上限检查）
CREATE INDEX IF NOT EXISTS idx_points_transactions_user_daily
  ON points_transactions(user_id, transaction_type, created_at);

-- ============================================================
-- 3. 为 users 表添加 tokens 字段
-- ============================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0;

-- ============================================================
-- 4. 插入预设规则数据（仅当表为空时）
-- ============================================================
INSERT INTO points_rules (rule_key, rule_name, rule_description, rule_type, operation_type, base_points, points_formula, max_points_per_day, max_points_total, conditions, user_level_min, user_level_max, user_roles, is_active, is_system_rule, priority, rule_config, discount_config)
VALUES
  -- ===== 奖励类规则 =====
  (
    'daily_login', '每日登录', '用户每日登录奖励积分',
    'reward', 'daily_login', 2, 'fixed', 1, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 100,
    '{"points":2,"trigger_condition":"daily_login","daily_limit":1,"total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'upload_file', '上传文件', '用户上传文件获得积分奖励',
    'reward', 'upload_file', 10, 'fixed', 50, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 90,
    '{"points":10,"trigger_condition":"upload_file","daily_limit":5,"total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'share_knowledge', '分享知识', '用户分享知识库内容获得积分',
    'reward', 'task_reward', 20, 'fixed', 100, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 80,
    '{"points":20,"trigger_condition":"share_knowledge","daily_limit":5,"total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'invite_friend', '邀请好友', '成功邀请好友注册获得积分',
    'reward', 'invite_reward', 50, 'fixed', NULL, 500, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]',
    true, true, 70,
    '{"points":50,"trigger_condition":"invite_friend","daily_limit":null,"total_limit":500}'::jsonb,
    '{}'::jsonb
  ),
  (
    'register', '新用户注册', '新用户注册奖励积分',
    'reward', 'register', 100, 'fixed', 1, 1, '[]', 1, 5, '["user","vip","manufacturer"]',
    true, true, 95,
    '{"points":100,"trigger_condition":"register","daily_limit":1,"total_limit":1}'::jsonb,
    '{}'::jsonb
  ),

  -- ===== 消耗类规则 =====
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
  ),

  -- ===== Token计费类规则 =====
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
-- 5. 创建 RLS 策略（如果启用了 RLS）
-- ============================================================
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;

-- 允许用户查看自己的交易记录
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'points_transactions' AND policyname = 'users_view_own_transactions'
  ) THEN
    CREATE POLICY users_view_own_transactions ON points_transactions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 允许服务角色（super_admin）执行所有操作
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'points_transactions' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON points_transactions
      FOR ALL USING (true);
  END IF;
END $$;

-- ============================================================
-- 6. 添加注释
-- ============================================================
COMMENT ON TABLE points_transactions IS '统一积分/Token交易记录表';
COMMENT ON COLUMN points_transactions.transaction_type IS '交易类型: reward(奖励), consume(消耗积分), token(消耗Token)';
COMMENT ON COLUMN points_transactions.amount IS '变化数量，正为增加，负为扣除';
COMMENT ON COLUMN points_transactions.amount_type IS '数值类型: points(积分), tokens(Token)';
COMMENT ON COLUMN points_transactions.balance_before IS '交易前余额';
COMMENT ON COLUMN points_transactions.balance_after IS '交易后余额';
COMMENT ON COLUMN points_transactions.unit_count IS '计量单位数（产品数量、页数等）';
COMMENT ON COLUMN points_transactions.discount_applied IS '实际折扣率，1.0=无折扣';
COMMENT ON COLUMN points_transactions.reference_id IS '关联业务ID';
COMMENT ON COLUMN points_transactions.metadata IS '扩展元数据';
COMMENT ON TABLE points_rules.rule_type IS '规则类型: reward(奖励), consume(消耗), token(Token计费)';
COMMENT ON TABLE points_rules.rule_config IS '规则配置(JSONB)，按rule_type存储不同结构';
COMMENT ON TABLE points_rules.discount_config IS '等级折扣配置(JSONB)';
COMMENT ON TABLE points_rules.rule_key IS '规则标识键，用于业务代码调用';
COMMENT ON TABLE users.tokens IS '用户Token余额';

COMMIT;
