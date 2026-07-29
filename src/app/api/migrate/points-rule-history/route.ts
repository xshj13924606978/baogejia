import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 迁移 API: 创建 points_rule_history 表
 * POST /api/migrate/points-rule-history
 *
 * 前提: exec_sql 函数已存在于数据库中
 * 如果 exec_sql 不存在，请先在 Supabase SQL Editor 中执行下方 SQL 创建它，
 * 然后或直接在 SQL Editor 中执行本文件中的所有迁移 SQL。
 */

const MIGRATION_STATEMENTS: { sql: string; description: string }[] = [
  {
    description: '创建 points_rule_history 表',
    sql: `CREATE TABLE IF NOT EXISTS points_rule_history (
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
  );`,
  },
  {
    description: '创建 rule_id 索引',
    sql: 'CREATE INDEX IF NOT EXISTS idx_points_rule_history_rule_id ON points_rule_history(rule_id);',
  },
  {
    description: '创建 user_id 索引',
    sql: 'CREATE INDEX IF NOT EXISTS idx_points_rule_history_user_id ON points_rule_history(user_id);',
  },
  {
    description: '创建 execution_status 索引',
    sql: 'CREATE INDEX IF NOT EXISTS idx_points_rule_history_execution_status ON points_rule_history(execution_status);',
  },
  {
    description: '创建 executed_at 索引',
    sql: 'CREATE INDEX IF NOT EXISTS idx_points_rule_history_executed_at ON points_rule_history(executed_at);',
  },
  {
    description: '添加表注释',
    sql: "COMMENT ON TABLE points_rule_history IS '积分规则执行历史记录表';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.rule_id IS '关联的积分规则 ID';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.user_id IS '执行操作的用户 ID';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.points_awarded IS '实际发放的积分';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.points_expected IS '预期应发放的积分';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.operation_type IS '操作类型: sign_in, purchase, share 等';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.context_data IS '执行上下文数据 (JSON)';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.conditions_matched IS '匹配到的条件详情 (JSON)';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.conditions_evaluated IS '评估的条件总数';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.conditions_passed IS '通过的条件数';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.execution_status IS '执行状态: success, failed, skipped, limited';",
  },
  {
    description: '添加字段注释',
    sql: "COMMENT ON COLUMN points_rule_history.failure_reason IS '失败原因（仅 execution_status=failed 时有值）';",
  },
];

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const adminRoles = ['admin', 'super_admin', 'Admin', 'SUPER_ADMIN', '管理员', '超级管理员'];
    const role = currentUser.role || '';
    if (!adminRoles.includes(role)) {
      return NextResponse.json({ error: '仅超级管理员可执行迁移' }, { status: 403 });
    }

    const db = getSupabaseServiceClient();
    const results: { description: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of MIGRATION_STATEMENTS) {
      try {
        const { error } = await db.rpc('exec_sql', {
          params: [],
          sql: stmt.sql,
        });

        if (error) {
          const errMsg = error.message || String(error);
          const isDuplicate = errMsg.includes('already exists') || errMsg.includes('duplicate') || errMsg.includes('conflict');
          if (isDuplicate) {
            results.push({ description: stmt.description, success: true });
            successCount++;
          } else {
            console.error(`[Migration] 失败: ${stmt.description}:`, errMsg);
            results.push({ description: stmt.description, success: false, error: errMsg });
            errorCount++;
          }
        } else {
          results.push({ description: stmt.description, success: true });
          successCount++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Migration] 异常: ${stmt.description}:`, msg);
        results.push({ description: stmt.description, success: false, error: msg });
        errorCount++;
      }
    }

    // 刷新 schema 缓存
    try {
      await db.rpc('exec_sql', {
        params: [],
        sql: "NOTIFY pgrst, 'reload schema';",
      });
    } catch {
      // 忽略刷新失败
    }

    return NextResponse.json({
      success: errorCount === 0,
      message: `迁移完成: ${successCount} 成功, ${errorCount} 失败`,
      results,
    });
  } catch (error: any) {
    console.error('[Migration] 异常:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
