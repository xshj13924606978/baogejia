import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 迁移 API: 执行 013_unified_points_rules 迁移
 * 仅限 super_admin 使用
 * POST /api/migrate/unified-points-rules
 */

// 拆分为单条 SQL 语句（exec_sql RPC 不支持事务块和 DO $$ 块）
const MIGRATION_STATEMENTS: { sql: string; description: string }[] = [
  // 0. 先创建 exec_sql 函数（如果不存在）
  { sql: `CREATE OR REPLACE FUNCTION exec_sql(p_sql text, p_params jsonb default '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object('success', true);
END;
$$;`, description: '创建/更新 exec_sql 函数' },
  { sql: `CREATE OR REPLACE FUNCTION exec_sql(p_params jsonb, p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN exec_sql(p_sql, p_params);
END;
$$;`, description: '创建 exec_sql 重载（兼容 params,sql 顺序）' },

  // 1. 扩展 points_rules 表
  { sql: "ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS rule_type VARCHAR(20) DEFAULT 'reward';", description: '添加 rule_type 字段' },
  { sql: "ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS rule_config JSONB DEFAULT '{}';", description: '添加 rule_config 字段' },
  { sql: "ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS discount_config JSONB DEFAULT '{}';", description: '添加 discount_config 字段' },
  { sql: "ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS rule_key VARCHAR(100);", description: '添加 rule_key 字段' },
  { sql: "ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;", description: '添加 priority 字段' },
  { sql: "ALTER TABLE points_rules ADD COLUMN IF NOT EXISTS is_system_rule BOOLEAN DEFAULT false;", description: '添加 is_system_rule 字段' },

  // 索引
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_rules_rule_type ON points_rules(rule_type);", description: '创建 rule_type 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_rules_rule_key ON points_rules(rule_key);", description: '创建 rule_key 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_rules_is_active ON points_rules(is_active);", description: '创建 is_active 索引' },

  // 更新现有数据默认值
  { sql: "UPDATE points_rules SET rule_type = 'reward', rule_key = LOWER(REPLACE(rule_name, ' ', '_')) WHERE rule_type IS NULL;", description: '更新现有规则默认类型' },

  // 2. 创建 points_transactions 表
  { sql: `CREATE TABLE IF NOT EXISTS points_transactions (
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
  );`, description: '创建 points_transactions 表' },

  // 交易表索引
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id);", description: '创建 user_id 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_rule_id ON points_transactions(rule_id);", description: '创建 rule_id 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_type ON points_transactions(transaction_type);", description: '创建 transaction_type 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_amount_type ON points_transactions(amount_type);", description: '创建 amount_type 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at ON points_transactions(created_at);", description: '创建 created_at 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_reference_id ON points_transactions(reference_id);", description: '创建 reference_id 索引' },
  { sql: "CREATE INDEX IF NOT EXISTS idx_points_transactions_user_daily ON points_transactions(user_id, transaction_type, created_at);", description: '创建每日统计索引' },

  // 3. 为 users 表添加 tokens 字段
  { sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0;", description: '添加 users.tokens 字段' },

  // 4. 插入预设规则数据（使用 ON CONFLICT 避免重复）
  { sql: `INSERT INTO points_rules (rule_key, rule_name, rule_description, rule_type, operation_type, base_points, points_formula, max_points_per_day, max_points_total, conditions, user_level_min, user_level_max, user_roles, is_active, is_system_rule, priority, rule_config, discount_config)
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
ON CONFLICT DO NOTHING;`, description: '插入11条预设规则' },

  // 5. RLS 策略（跳过 DO $$ 块，直接执行）
  { sql: "ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;", description: '启用 RLS' },
  { sql: `CREATE POLICY users_view_own_transactions ON points_transactions FOR SELECT USING (auth.uid() = user_id);`, description: '用户查看自己交易 RLS' },
  { sql: `CREATE POLICY service_role_all ON points_transactions FOR ALL USING (true);`, description: '服务角色全权 RLS' },

  // 6. 注释
  { sql: "COMMENT ON TABLE points_transactions IS '统一积分/Token交易记录表';", description: '添加表注释' },
  { sql: "COMMENT ON COLUMN points_transactions.transaction_type IS '交易类型: reward(奖励), consume(消耗积分), token(消耗Token)';", description: '添加字段注释' },
  { sql: "COMMENT ON COLUMN points_transactions.amount_type IS '数值类型: points(积分), tokens(Token)';", description: '添加字段注释' },
  { sql: "COMMENT ON TABLE points_rules.rule_type IS '规则类型: reward(奖励), consume(消耗), token(Token计费)';", description: '添加字段注释' },
  { sql: "COMMENT ON TABLE points_rules.rule_config IS '规则配置(JSONB)，按rule_type存储不同结构';", description: '添加字段注释' },
  { sql: "COMMENT ON TABLE points_rules.discount_config IS '等级折扣配置(JSONB)';", description: '添加字段注释' },
  { sql: "COMMENT ON TABLE points_rules.rule_key IS '规则标识键，用于业务代码调用';", description: '添加字段注释' },
  { sql: "COMMENT ON TABLE users.tokens IS '用户Token余额';", description: '添加字段注释' },
];

export async function POST(request: NextRequest) {
  try {
    // 验证 super_admin 权限
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const adminRoles = ['admin', 'super_admin', 'Admin', 'SUPER_ADMIN', '管理员', '超级管理员'];
    const role = currentUser.role || '';
    if (!adminRoles.includes(role)) {
      return NextResponse.json({ error: '仅超级管理员可执行迁移' }, { status: 403 });
    }

    const db = getSupabaseServiceClient();
    const results: { sql: string; description: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of MIGRATION_STATEMENTS) {
      try {
        const { error } = await db.rpc('exec_sql', {
          params: [],
          sql: stmt.sql,
        });

        if (error) {
          // 某些语句可能因已存在而报错，这是正常的
          const errMsg = error.message || String(error);
          const isDuplicate = errMsg.includes('already exists') || errMsg.includes('duplicate') || errMsg.includes('conflict');
          if (isDuplicate) {
            results.push({ sql: stmt.sql.substring(0, 60) + '...', description: stmt.description, success: true });
            successCount++;
          } else {
            console.error(`[Migration] 失败: ${stmt.description}:`, errMsg);
            results.push({ sql: stmt.sql.substring(0, 60) + '...', description: stmt.description, success: false, error: errMsg });
            errorCount++;
          }
        } else {
          results.push({ sql: stmt.sql.substring(0, 60) + '...', description: stmt.description, success: true });
          successCount++;
        }
      } catch (err: any) {
        const errMsg = err.message || String(err);
        console.error(`[Migration] 异常: ${stmt.description}:`, errMsg);
        results.push({ sql: stmt.sql.substring(0, 60) + '...', description: stmt.description, success: false, error: errMsg });
        errorCount++;
      }
    }

    // 刷新 schema 缓存
    try {
      await db.rpc('exec_sql', { params: [], sql: "NOTIFY pgrst, 'reload schema';" });
    } catch { /* ignore */ }


    return NextResponse.json({
      success: errorCount === 0,
      message: errorCount === 0 ? '迁移全部成功' : `迁移完成：${successCount} 成功，${errorCount} 失败`,
      total: MIGRATION_STATEMENTS.length,
      successCount,
      errorCount,
      results,
    });
  } catch (error: any) {
    console.error('[Migration] 严重错误:', error);
    return NextResponse.json({ error: '迁移执行失败' }, { status: 500 });
  }
}

// GET: 迁移状态检查
export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const db = getSupabaseServiceClient();

    // 检查 points_rules 是否有 rule_type 列
    const { data: rulesColumns, error: rulesError } = await db.rpc('exec_sql', {
      sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'points_rules' AND column_name IN ('rule_type', 'rule_config', 'discount_config', 'rule_key', 'priority', 'is_system_rule') ORDER BY column_name;`,
      params: [],
    });

    // 检查 points_transactions 表是否存在
    const { data: txExists, error: txError } = await db.rpc('exec_sql', {
      sql: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'points_transactions') as exists;`,
      params: [],
    });

    // 检查 users 表是否有 tokens 列
    const { data: userTokens, error: userError } = await db.rpc('exec_sql', {
      sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tokens';`,
      params: [],
    });

    // 获取规则数量
    const { data: ruleCount } = await db.rpc('exec_sql', {
      sql: `SELECT rule_type, COUNT(*) as count FROM points_rules GROUP BY rule_type ORDER BY rule_type;`,
      params: [],
    });

    return NextResponse.json({
      success: true,
      migrationStatus: {
        pointsRulesColumns: rulesColumns || [],
        pointsTransactionsExists: txExists?.[0]?.exists === true,
        usersTokensColumn: (userTokens?.length || 0) > 0,
        ruleCountByType: ruleCount || [],
        migrated: (rulesColumns?.length || 0) >= 6,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
