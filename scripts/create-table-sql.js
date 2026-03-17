/**
 * 创建 point_logs 表
 * 使用 Supabase 的 RPC 方式
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('错误: 缺少必要的环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTable() {
  console.log('使用 Supabase REST API 创建表结构...\n');

  try {
    // 首先检查 users 表是否存在并获取其结构
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (usersError) {
      console.log('users 表不存在或无法访问:', usersError.message);
      console.log('\n请手动在 Supabase 控制台执行以下 SQL 创建 point_logs 表：');
      printCreateSQL();
      return;
    }

    // 尝试插入一条测试记录来创建表结构
    // 由于 Supabase REST API 不支持 DDL 操作，我们需要使用其他方式
    console.log('Supabase REST API 不支持直接创建表。');
    console.log('\n请在 Supabase 控制台的 SQL 编辑器中执行以下 SQL：\n');
    printCreateSQL();

  } catch (err) {
    console.error('执行失败:', err);
  }
}

function printCreateSQL() {
  console.log(`
-- ============================================================================
-- 创建 point_logs 表（积分流水记录）
-- ============================================================================

CREATE TABLE IF NOT EXISTS point_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_point_logs_user_id ON point_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created_at ON point_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_point_logs_type ON point_logs(type);

-- 添加外键约束（如果 users 表存在）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_point_logs_user_id'
        ) THEN
            ALTER TABLE point_logs
            ADD CONSTRAINT fk_point_logs_user_id
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 添加注释
COMMENT ON TABLE point_logs IS '积分变动流水记录';
COMMENT ON COLUMN point_logs.user_id IS '用户ID';
COMMENT ON COLUMN point_logs.points IS '积分变动数量（正数为获得，负数为消费）';
COMMENT ON COLUMN point_logs.type IS '变动类型';
COMMENT ON COLUMN point_logs.description IS '变动说明';
COMMENT ON COLUMN point_logs.balance_after IS '变动后的积分余额';

-- ============================================================================
-- 完成
-- ============================================================================
`);
}

createTable();
