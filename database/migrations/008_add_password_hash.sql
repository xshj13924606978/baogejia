-- 密码哈希字段迁移
-- 为 users 表添加 password_hash 字段，用于存储 bcrypt 加密密码

-- 添加 password_hash 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 添加注释
COMMENT ON COLUMN users.password_hash IS 'bcrypt 加密后的密码哈希值';

-- 查看表结构确认
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('password', 'password_hash');
