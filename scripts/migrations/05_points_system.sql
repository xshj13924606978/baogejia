-- ============================================================================
-- 积分系统数据库表结构
-- 创建时间: 2026-03-17
-- ============================================================================

-- 1. 为 users 表添加积分字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;

-- 2. 创建用户余额表
CREATE TABLE IF NOT EXISTS user_token_balance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    points_balance INTEGER DEFAULT 0,
    token_balance INTEGER DEFAULT 0,
    total_consumed_tokens INTEGER DEFAULT 0,
    total_consumed_points INTEGER DEFAULT 0,
    total_recharged_points INTEGER DEFAULT 0,
    total_recharged_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建积分记录表
CREATE TABLE IF NOT EXISTS point_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(100),
    description TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 创建 Token 消费记录表
CREATE TABLE IF NOT EXISTS token_consumption_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID,
    message_id UUID,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    points_consumed INTEGER DEFAULT 0,
    token_rate DECIMAL(10,4) DEFAULT 1.0,
    user_level INTEGER DEFAULT 1,
    service_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_token_balance_user_id ON user_token_balance(user_id);
CREATE INDEX IF NOT EXISTS idx_point_records_user_id ON point_records(user_id);
CREATE INDEX IF NOT EXISTS idx_point_records_type ON point_records(type);
CREATE INDEX IF NOT EXISTS idx_point_records_created_at ON point_records(created_at);
CREATE INDEX IF NOT EXISTS idx_token_consumption_user_id ON token_consumption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_token_consumption_created_at ON token_consumption_log(created_at);

-- 6. 为现有用户初始化余额记录
INSERT INTO user_token_balance (user_id, points_balance)
SELECT id, 100
FROM users
WHERE id NOT IN (SELECT user_id FROM user_token_balance)
ON CONFLICT DO NOTHING;

-- 7. 为现有用户初始化积分
UPDATE users SET points = 100, total_points = 100
WHERE points IS NULL OR points = 0;
