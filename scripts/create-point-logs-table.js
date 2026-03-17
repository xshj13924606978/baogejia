/**
 * 创建 point_logs 表
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

async function checkAndCreateTable() {
  console.log('检查 point_logs 表是否存在...\n');

  try {
    // 尝试查询表
    const { data, error } = await supabase
      .from('point_logs')
      .select('id')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist') || error.code === 'PGRST106') {
        console.log('point_logs 表不存在，需要创建');
        console.log('\n请使用 Supabase 控制台执行以下 SQL 创建表：\n');
        console.log(`
CREATE TABLE IF NOT EXISTS point_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_logs_user_id ON point_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created_at ON point_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_point_logs_type ON point_logs(type);

COMMENT ON TABLE point_logs IS '积分变动流水记录';
COMMENT ON COLUMN point_logs.user_id IS '用户ID';
COMMENT ON COLUMN point_logs.points IS '积分变动数量（正数为获得，负数为消费）';
COMMENT ON COLUMN point_logs.type IS '变动类型：register, login, upload, reward, consume, exchange 等';
COMMENT ON COLUMN point_logs.description IS '变动说明';
COMMENT ON COLUMN point_logs.balance_after IS '变动后的积分余额';
`);
      } else {
        console.error('查询出错:', error);
      }
    } else {
      console.log('point_logs 表已存在，无需创建');
    }
  } catch (err) {
    console.error('执行失败:', err);
  }
}

checkAndCreateTable();
