import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 临时迁移执行端点
 * POST /api/admin/run-migration
 * Body: { sql: string }
 *
 * 通过 Supabase REST API 执行 DML 操作。
 * 对于 DDL（ALTER/CREATE/DROP），会提示需要手动执行。
 */
export async function POST(request: NextRequest) {
  try {
    const { sql } = await request.json();
    if (!sql) {
      return NextResponse.json({ success: false, error: '缺少 sql 参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 解析 SQL 语句
    const statements = sql
      .split(';')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    const results: { sql: string; status: string; error?: string; detail?: string }[] = [];

    for (const stmt of statements) {
      const upperStmt = stmt.toUpperCase();

      // DDL 语句 - 需要通过 rpc exec_sql（如果存在）
      if (/^\s*(ALTER|CREATE|DROP|TRUNCATE|RENAME|COMMENT|GRANT|REVOKE)\s/i.test(stmt)) {
        // 尝试 exec_sql RPC
        const { data: rpcData, error: rpcError } = await db.rpc('exec_sql', {
          sql: stmt,
        });

        if (rpcError) {
          // exec_sql 不存在，尝试直接 DML 方式
          // 对于 ALTER TABLE ADD COLUMN，可以用 upsert 到 information_schema 来标记
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'skipped',
            error: 'DDL 语句需要 exec_sql RPC 函数',
            detail: rpcError.message,
          });
        } else {
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'success',
          });
        }
        continue;
      }

      // DO $$ ... $$ 块 - 通过 rpc
      if (/^\s*DO\s*\$\$/i.test(stmt)) {
        const { error: rpcError } = await db.rpc('exec_sql', { sql: stmt });
        if (rpcError) {
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'skipped',
            error: rpcError.message,
          });
        } else {
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'success',
          });
        }
        continue;
      }

      // INSERT ... ON CONFLICT (UPSERT) - 解析表名并执行
      const insertMatch = stmt.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i);
      const upsertMatch = stmt.match(/INSERT\s+INTO\s+(\w+)\s/i);

      if (upsertMatch) {
        const tableName = upsertMatch[1];
        try {
          // 使用 Supabase 的 from().upsert() 方法
          // 这里需要解析 VALUES，对于简单的 UPSERT 可以处理
          // 对于复杂的多行 INSERT，使用 exec_sql
          const { error: rpcErr } = await db.rpc('exec_sql', { sql: stmt });
          if (rpcErr) {
            results.push({
              sql: stmt.substring(0, 80) + '...',
              status: 'failed',
              error: rpcErr.message,
            });
          } else {
            results.push({
              sql: stmt.substring(0, 80) + '...',
              status: 'success',
            });
          }
        } catch (e: any) {
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'failed',
            error: e.message,
          });
        }
        continue;
      }

      // UPDATE 语句
      const updateMatch = stmt.match(/UPDATE\s+(\w+)\s+SET/i);
      if (updateMatch) {
        const { error: rpcErr } = await db.rpc('exec_sql', { sql: stmt });
        if (rpcErr) {
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'skipped',
            error: 'UPDATE 需要 exec_sql RPC',
          });
        } else {
          results.push({
            sql: stmt.substring(0, 80) + '...',
            status: 'success',
          });
        }
        continue;
      }

      results.push({
        sql: stmt.substring(0, 80) + '...',
        status: 'skipped',
        error: '未知语句类型',
      });
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status === 'failed').length;
    const skipCount = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      success: failCount === 0,
      total: results.length,
      successCount,
      failCount,
      skipCount,
      results,
      message: `执行完成: ${successCount} 成功, ${failCount} 失败, ${skipCount} 跳过`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
