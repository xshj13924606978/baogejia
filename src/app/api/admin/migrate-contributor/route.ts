export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// 确保 exec_sql 函数存在（单参数 p_sql text）
const CREATE_EXEC_SQL = `CREATE OR REPLACE FUNCTION exec_sql(p_sql text)
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
$$;`;

// 拆分为单条 SQL 语句（exec_sql RPC 单条执行）
const MIGRATION_STATEMENTS: { sql: string; description: string }[] = [
  {
    sql: `CREATE TABLE IF NOT EXISTS public.contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
);`,
    description: '创建贡献者表 contributors',
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS public.contributor_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID REFERENCES public.contributors(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  files TEXT[],
  status VARCHAR(20) DEFAULT 'pending',
  reviewer_id UUID,
  review_comment TEXT,
  reviewed_at TIMESTAMP,
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);`,
    description: '创建上传资料表 contributor_uploads',
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS public.upload_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID REFERENCES public.contributors(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.contributor_uploads(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);`,
    description: '创建上传积分记录表 upload_points_log',
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_contributor_uploads_contributor_id ON public.contributor_uploads(contributor_id);`, description: 'contributor_uploads 贡献者索引' },
  { sql: `CREATE INDEX IF NOT EXISTS idx_contributor_uploads_status ON public.contributor_uploads(status);`, description: 'contributor_uploads 状态索引' },
  { sql: `CREATE INDEX IF NOT EXISTS idx_contributor_uploads_type ON public.contributor_uploads(type);`, description: 'contributor_uploads 类型索引' },
  { sql: `CREATE INDEX IF NOT EXISTS idx_upload_points_log_contributor_id ON public.upload_points_log(contributor_id);`, description: 'upload_points_log 贡献者索引' },
  { sql: `CREATE INDEX IF NOT EXISTS idx_upload_points_log_upload_id ON public.upload_points_log(upload_id);`, description: 'upload_points_log 上传索引' },
];

// 校验是否管理员
async function isAdmin(request: NextRequest): Promise<boolean> {
  try {
    const { requireAdmin } = await import('@/lib/auth-utils');
    const { errorResponse } = await requireAdmin(request);
    return !errorResponse;
  } catch {
    return false;
  }
}

/**
 * 一次性迁移：创建资料贡献者功能所需的数据库表
 * 通过 exec_sql RPC 执行 DDL
 * 需要管理员权限
 */
export async function POST(request: NextRequest) {
  const admin = await isAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: '仅管理员可执行迁移' }, { status: 403 });
  }

  try {
    const db = getSupabaseServiceClient();

    // 0. 确保 exec_sql 函数存在
    const { error: execSqlError } = await db.rpc('exec_sql', { sql: CREATE_EXEC_SQL });
    if (execSqlError) {
      // 函数不存在时无法通过自身创建，尝试直接建（部分环境支持）
      console.warn('[Contributor Migration] 创建 exec_sql 函数提示:', execSqlError.message);
    }

    const results: { description: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of MIGRATION_STATEMENTS) {
      try {
        const { error } = await db.rpc('exec_sql', { sql: stmt.sql });
        if (error) {
          const errMsg = error.message || String(error);
          const isDuplicate = errMsg.includes('already exists') || errMsg.includes('duplicate') || errMsg.includes('conflict');
          if (isDuplicate) {
            results.push({ description: stmt.description, success: true });
            successCount++;
          } else {
            console.error(`[Contributor Migration] 失败: ${stmt.description}:`, errMsg);
            results.push({ description: stmt.description, success: false, error: errMsg });
            errorCount++;
          }
        } else {
          results.push({ description: stmt.description, success: true });
          successCount++;
        }
      } catch (err: any) {
        const errMsg = err.message || String(err);
        console.error(`[Contributor Migration] 异常: ${stmt.description}:`, errMsg);
        results.push({ description: stmt.description, success: false, error: errMsg });
        errorCount++;
      }
    }

    // 刷新 schema 缓存
    try {
      await db.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      success: errorCount === 0,
      message: errorCount === 0 ? '迁移全部成功' : `迁移完成：${successCount} 成功，${errorCount} 失败`,
      total: MIGRATION_STATEMENTS.length,
      successCount,
      errorCount,
      results,
    });
  } catch (error) {
    console.error('[Contributor Migration] 严重错误:', error);
    return NextResponse.json({ error: '迁移执行失败' }, { status: 500 });
  }
}
