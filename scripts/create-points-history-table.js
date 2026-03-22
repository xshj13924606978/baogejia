#!/usr/bin/env node
/**
 * 一次性迁移脚本: 创建 points_rule_history 表
 *
 * 使用方法:
 *   node scripts/create-points-history-table.js
 *
 * 工作原理:
 * 1. 通过 Supabase REST API (IPv4 CDN) 连接
 * 2. 先尝试通过 rpc('exec_sql') 执行建表 SQL
 * 3. 如果 exec_sql 函数不存在，输出需要在 Supabase Dashboard SQL Editor 中手动执行的 SQL
 */

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('错误: 缺少 COZE_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量');
  process.exit(1);
}

const CREATE_TABLE_SQL = `
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
`;

const INDEX_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_points_rule_history_rule_id ON points_rule_history(rule_id);',
  'CREATE INDEX IF NOT EXISTS idx_points_rule_history_user_id ON points_rule_history(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_points_rule_history_execution_status ON points_rule_history(execution_status);',
  'CREATE INDEX IF NOT EXISTS idx_points_rule_history_executed_at ON points_rule_history(executed_at);',
];

const COMMENTS_SQL = [
  "COMMENT ON TABLE points_rule_history IS '积分规则执行历史记录表';",
  "COMMENT ON COLUMN points_rule_history.rule_id IS '关联的积分规则 ID';",
  "COMMENT ON COLUMN points_rule_history.user_id IS '执行操作的用户 ID';",
  "COMMENT ON COLUMN points_rule_history.points_awarded IS '实际发放的积分';",
  "COMMENT ON COLUMN points_rule_history.points_expected IS '预期应发放的积分';",
  "COMMENT ON COLUMN points_rule_history.operation_type IS '操作类型: sign_in, purchase, share 等';",
  "COMMENT ON COLUMN points_rule_history.context_data IS '执行上下文数据 (JSON)';",
  "COMMENT ON COLUMN points_rule_history.conditions_matched IS '匹配到的条件详情 (JSON)';",
  "COMMENT ON COLUMN points_rule_history.conditions_evaluated IS '评估的条件总数';",
  "COMMENT ON COLUMN points_rule_history.conditions_passed IS '通过的条件数';",
  "COMMENT ON COLUMN points_rule_history.execution_status IS '执行状态: success, failed, skipped, limited';",
  "COMMENT ON COLUMN points_rule_history.failure_reason IS '失败原因';",
];

const ALL_STATEMENTS = [CREATE_TABLE_SQL, ...INDEX_SQL, ...COMMENTS_SQL];

async function rpcExec(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ params: [], sql }),
  });
  return res.json();
}

async function main() {
  console.log('=== 创建 points_rule_history 表 ===\n');
  console.log('Supabase URL:', SUPABASE_URL);

  // Step 1: 检查 exec_sql 函数是否存在
  console.log('\n[1/3] 检查 exec_sql 函数...');
  const testResult = await rpcExec('SELECT 1');
  if (testResult.code === 'PGRST202' || testResult.error?.code === 'PGRST202') {
    console.log('  exec_sql 函数不存在，尝试通过 REST API 创建...');

    // 尝试通过 pg_catalog 创建函数 (需要 service role)
    const createFuncResult = await rpcExec(`CREATE OR REPLACE FUNCTION exec_sql(p_sql text, p_params jsonb default '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _result jsonb;
BEGIN
  RETURN jsonb_build_object('success', true);
END;
$$;`);

    if (createFuncResult.code === 'PGRST202') {
      console.log('  无法通过 REST API 创建 exec_sql 函数');
      console.log('\n  请在 Supabase Dashboard > SQL Editor 中执行以下 SQL:\n');
      console.log('  ─────────────────────────────────────────');
      console.log(ALL_STATEMENTS.map(s => '  ' + s.trim()).join('\n\n'));
      console.log('  ─────────────────────────────────────────\n');
      console.log('  执行完成后，points_rule_history 表即可正常使用。');
      console.log('  /api/admin/points/history API 将不再返回 500 错误。\n');
      process.exit(0);
    }

    console.log('  exec_sql 函数创建成功');
  } else {
    console.log('  exec_sql 函数已存在');
  }

  // Step 2: 执行建表 SQL
  console.log('\n[2/3] 执行建表 SQL...');
  let successCount = 0;
  let failCount = 0;

  for (const sql of ALL_STATEMENTS) {
    const result = await rpcExec(sql);
    if (result.error && !result.error.message?.includes('already exists')) {
      console.log('  失败:', sql.substring(0, 60).replace(/\n/g, ' '), '-', result.error.message);
      failCount++;
    } else {
      successCount++;
    }
  }

  // Step 3: 验证
  console.log('\n[3/3] 验证表是否创建成功...');
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/points_rule_history?select=id&limit=0`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'count=exact',
      },
    }
  );
  const status = verifyRes.status;
  const count = verifyRes.headers.get('content-range');

  if (status === 200) {
    console.log('  表创建成功! points_rule_history 表已就绪。');
    console.log('  /api/admin/points/history API 现在可以正常工作了。');
  } else {
    console.log('  验证失败，HTTP status:', status);
    console.log('  请手动在 Supabase Dashboard SQL Editor 中执行建表 SQL。');
  }

  console.log(`\n=== 迁移完成: ${successCount} 成功, ${failCount} 失败 ===`);
}

main().catch(e => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
