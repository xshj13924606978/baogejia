-- ============================================================
-- 039_init_user_points_data.sql
-- 创建所有缺失的积分相关表 + 补全所有用户的积分数据
-- 修复积分显示为 0 和 500 错误的问题
-- ============================================================

-- ============================================================
-- 0. 创建缺失的表（014 迁移未执行导致缺失）
-- ============================================================

-- 0a. level_definitions 等级定义表
CREATE TABLE IF NOT EXISTS level_definitions (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  required_points INTEGER NOT NULL DEFAULT 0,
  role VARCHAR(20) NOT NULL DEFAULT 'free',
  permissions TEXT[] DEFAULT '{}',
  daily_quota INTEGER DEFAULT 10,
  max_files INTEGER DEFAULT 5,
  max_chat_messages INTEGER DEFAULT 50,
  can_view_cost_price BOOLEAN DEFAULT false,
  can_view_min_price BOOLEAN DEFAULT false,
  can_view_manufacturer BOOLEAN DEFAULT false,
  can_view_contact BOOLEAN DEFAULT false,
  can_view_phone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初始化默认等级定义
INSERT INTO level_definitions (level, name, required_points, role, daily_quota, max_files, max_chat_messages)
VALUES
  (1, '等级1', 0, 'free', 10, 5, 50),
  (2, '等级2', 500, 'basic', 20, 10, 100),
  (3, '等级3', 2000, 'standard', 50, 20, 200),
  (4, '等级4', 5000, 'premium', 100, 50, 500),
  (5, '等级5', 10000, 'vip', 200, 100, 1000)
ON CONFLICT (level) DO NOTHING;

-- 0b. user_levels 用户等级表
CREATE TABLE IF NOT EXISTS user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  level INTEGER DEFAULT 1,
  current_points INTEGER DEFAULT 0,
  next_level_points INTEGER DEFAULT 0,
  level_name VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_levels_user_id ON user_levels(user_id);

-- 0c. user_token_balance 用户余额表
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

-- 0d. token_consumption_log Token消费记录表
CREATE TABLE IF NOT EXISTS token_consumption_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  points_cost INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_consumption_user_id ON token_consumption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_token_consumption_created_at ON token_consumption_log(created_at);

-- 0e. point_records 积分流水表（points-service 使用）
CREATE TABLE IF NOT EXISTS point_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  type VARCHAR(50),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_point_records_user_id ON point_records(user_id);

-- ============================================================
-- 1. 为所有用户补充 user_levels 记录
--    读取 users.metadata.points 作为初始积分
-- ============================================================
INSERT INTO user_levels (user_id, level, current_points, next_level_points, updated_at)
SELECT
  u.id,
  COALESCE((u.metadata->>'level')::integer, 1),
  COALESCE((u.metadata->>'points')::integer, 100),
  0,
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_levels ul WHERE ul.user_id = u.id
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. 为所有用户补充 user_token_balance 记录
-- ============================================================
INSERT INTO user_token_balance (user_id, points_balance, token_balance, updated_at)
SELECT
  u.id,
  COALESCE((u.metadata->>'points')::integer, 100),
  0,
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_token_balance utb WHERE utb.user_id = u.id
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. 同步 users.metadata.points → user_levels.current_points
-- ============================================================
UPDATE user_levels ul
SET current_points = COALESCE((u.metadata->>'points')::integer, ul.current_points, 100),
    updated_at = NOW()
FROM users u
WHERE ul.user_id = u.id;

-- ============================================================
-- 4. 同步 users.metadata.points → user_token_balance.points_balance
-- ============================================================
UPDATE user_token_balance utb
SET points_balance = COALESCE((u.metadata->>'points')::integer, utb.points_balance, 100),
    updated_at = NOW()
FROM users u
WHERE utb.user_id = u.id;

-- 5. 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
