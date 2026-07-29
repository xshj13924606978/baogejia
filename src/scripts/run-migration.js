/**
 * 迁移脚本执行器
 * 使用 Supabase service role client 通过 pg 直连执行 SQL
 * 
 * 使用方式: npx ts-node src/scripts/run-migration.ts
 * 或: node -e "require('./src/scripts/run-migration.js')"
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('缺少环境变量: COZE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function runMigration() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { timeout: 60000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const statements = [
    // 创建 exec_sql 函数
    `CREATE OR REPLACE FUNCTION exec_sql(p_sql text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      _result jsonb;
    BEGIN
      EXECUTE p_sql;
      RETURN jsonb_build_object('success', true);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
    END;
    $$;`,

    // 1. 扩展 points_rules 表
    `ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS rule_type VARCHAR(20) DEFAULT 'reward';`,
    `ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS rule_config JSONB DEFAULT '{}';`,
    `ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS discount_config JSONB DEFAULT '{}';`,
    `ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS rule_key VARCHAR(100);`,
    `ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;`,
    `ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS is_system_rule BOOLEAN DEFAULT false;`,

    // 索引
    `CREATE INDEX IF NOT EXISTS idx_points_rules_rule_type ON points_rules(rule_type);`,
    `CREATE INDEX IF NOT EXISTS idx_points_rules_rule_key ON points_rules(rule_key);`,
    `CREATE INDEX IF NOT EXISTS idx_points_rules_is_active ON points_rules(is_active);`,

    // 更新现有数据
    `UPDATE points_rules SET rule_type = 'reward', rule_key = LOWER(REPLACE(rule_name, ' ', '_')) WHERE rule_type IS NULL;`,

    // 2. 创建 points_transactions 表
    `CREATE TABLE IF NOT EXISTS points_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rule_id UUID REFERENCES points_rules(id) ON DELETE SET NULL,
      transaction_type VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      amount_type VARCHAR(10) DEFAULT 'points',
      balance_before INTEGER NOT NULL DEFAULT 0,
      balance_after INTEGER NOT NULL DEFAULT 0,
      unit_count INTEGER DEFAULT 1,
      discount_applied NUMERIC(3,2) DEFAULT 1.0,
      reference_id VARCHAR(100),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 交易表索引
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_rule_id ON points_transactions(rule_id);`,
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_type ON points_transactions(transaction_type);`,
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_amount_type ON points_transactions(amount_type);`,
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at ON points_transactions(created_at);`,
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_reference_id ON points_transactions(reference_id);`,
    `CREATE INDEX IF NOT EXISTS idx_points_transactions_user_daily ON points_transactions(user_id, transaction_type, created_at);`,

    // 3. users 表添加 tokens 字段
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0;`,

    // 4. 预设规则数据
    `INSERT INTO points_rules (rule_key, rule_name, rule_description, rule_type, operation_type, base_points, points_formula, max_points_per_day, max_points_total, conditions, user_level_min, user_level_max, user_roles, is_active, is_system_rule, priority, rule_config, discount_config)
    VALUES
      ('daily_login', '每日登录', '用户每日登录奖励积分', 'reward', 'daily_login', 2, 'fixed', 1, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 100,
       '{"points":2,"trigger_condition":"daily_login","daily_limit":1,"total_limit":null}'::jsonb, '{}'::jsonb),
      ('upload_file', '上传文件', '用户上传文件获得积分奖励', 'reward', 'upload_file', 10, 'fixed', 50, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 90,
       '{"points":10,"trigger_condition":"upload_file","daily_limit":5,"total_limit":null}'::jsonb, '{}'::jsonb),
      ('share_knowledge', '分享知识', '用户分享知识库内容获得积分', 'reward', 'task_reward', 20, 'fixed', 100, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 80,
       '{"points":20,"trigger_condition":"share_knowledge","daily_limit":5,"total_limit":null}'::jsonb, '{}'::jsonb),
      ('invite_friend', '邀请好友', '成功邀请好友注册获得积分', 'reward', 'invite_reward', 50, 'fixed', NULL, 500, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 70,
       '{"points":50,"trigger_condition":"invite_friend","daily_limit":null,"total_limit":500}'::jsonb, '{}'::jsonb),
      ('register', '新用户注册', '新用户注册奖励积分', 'reward', 'register', 100, 'fixed', 1, 1, '[]', 1, 5, '["user","vip","manufacturer"]', true, true, 95,
       '{"points":100,"trigger_condition":"register","daily_limit":1,"total_limit":1}'::jsonb, '{}'::jsonb),
      ('quote_generate_consume', '生成报价消耗积分', '用户生成报价单消耗积分', 'consume', 'generate_proposal', 10, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 90,
       '{"base_cost":10,"unit_cost":2,"unit_type":"product_count","min_balance":0}'::jsonb, '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb),
      ('export_report', '导出报告消耗积分', '用户导出报告消耗积分', 'consume', 'export_quote', 5, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 80,
       '{"base_cost":5,"unit_cost":0,"unit_type":"fixed","min_balance":0}'::jsonb, '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb),
      ('enhance_proposal', '方案增强消耗积分', '用户增强方案消耗积分', 'consume', 'enhance_proposal', 15, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 85,
       '{"base_cost":15,"unit_cost":0,"unit_type":"fixed","min_balance":0}'::jsonb, '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb),
      ('quote_generate_token', '生成报价Token计费', '生成报价按产品数量消耗Token', 'token', 'generate_proposal', 10, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 95,
       '{"base_tokens":10,"unit_tokens":2,"unit_type":"product_count","min_balance":0}'::jsonb, '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb),
      ('ai_chat_token', 'AI对话Token计费', '每次AI对话消耗Token', 'token', 'chat', 5, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 90,
       '{"base_tokens":5,"unit_tokens":0,"unit_type":"fixed","min_balance":0}'::jsonb, '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb),
      ('pdf_parse_token', 'PDF解析Token计费', 'PDF文件解析按页数消耗Token', 'token', 'parse_document', 3, 'fixed', NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","admin","super_admin"]', true, true, 85,
       '{"base_tokens":3,"unit_tokens":1,"unit_type":"page_count","min_balance":0}'::jsonb, '{"enabled":true,"levels":[{"level":5,"discount":0.5},{"level":4,"discount":0.6},{"level":3,"discount":0.7},{"level":2,"discount":0.8},{"level":1,"discount":1.0}]}'::jsonb)
    ON CONFLICT DO NOTHING;`,

    // 5. RLS
    `ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;`,
    `CREATE POLICY users_view_own_transactions ON points_transactions FOR SELECT USING (auth.uid() = user_id);`,
    `CREATE POLICY service_role_all ON points_transactions FOR ALL USING (true);`,

    // 6. 注释
    `COMMENT ON TABLE points_transactions IS '统一积分/Token交易记录表';`,
    `COMMENT ON COLUMN points_transactions.transaction_type IS '交易类型: reward(奖励), consume(消耗积分), token(消耗Token)';`,
    `COMMENT ON COLUMN points_transactions.amount IS '变化数量，正为增加，负为扣除';`,
    `COMMENT ON COLUMN points_transactions.amount_type IS '数值类型: points(积分), tokens(Token)';`,
    `COMMENT ON TABLE points_rules.rule_type IS '规则类型: reward(奖励), consume(消耗), token(Token计费)';`,
    `COMMENT ON TABLE points_rules.rule_config IS '规则配置(JSONB)';`,
    `COMMENT ON TABLE points_rules.discount_config IS '等级折扣配置(JSONB)';`,
    `COMMENT ON TABLE points_rules.rule_key IS '规则标识键';`,
    `COMMENT ON TABLE users.tokens IS '用户Token余额';`,
  ];


  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const preview = sql.substring(0, 60).replace(/\n/g, ' ') + (sql.length > 60 ? '...' : '');
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview} ... `);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql });

      if (error) {
        const msg = error.message || String(error);
        const isDuplicate = msg.includes('already exists') || msg.includes('duplicate') || msg.includes('conflict');
        if (isDuplicate) {
          success++;
        } else {
          failed++;
        }
      } else {
        success++;
      }
    } catch (err) {
      failed++;
    }
  }

  // 刷新 schema
  try {
    await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
  } catch { /* ignore */ }

  process.exit(failed > 0 ? 1 : 0);
}

runMigration().catch(err => {
  console.error('迁移严重失败:', err);
  process.exit(1);
});
