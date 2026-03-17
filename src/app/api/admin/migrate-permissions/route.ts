import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';
import fs from 'fs';
import path from 'path';

/**
 * 执行权限系统迁移 API
 * 需要 admin.migrate 权限（仅限超级管理员）
 */

export const POST = withPermissionCheck(
  { permissions: 'admin.migrate' },
  async (request: NextRequest, _context: any) => {
    try {
      console.log('[Migration] 开始执行权限系统迁移');

      const supabase = getSupabaseClient();

      // 读取迁移文件
      const migrationFilePath = path.join(
        process.cwd(),
        'scripts/migrations/04_permission_system.sql'
      );

      if (!fs.existsSync(migrationFilePath)) {
        return NextResponse.json({ error: '迁移文件不存在' }, { status: 404 });
      }

      const sql = fs.readFileSync(migrationFilePath, 'utf8');

      // 分割 SQL 语句
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

      console.log(`[Migration] 共 ${statements.length} 条 SQL 语句`);

      const results: Array<{ index: number; success: boolean; error?: string }> = [];
      let successCount = 0;
      let errorCount = 0;

      // 逐条执行
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        const _statementPreview = statement.substring(0, 100);

        try {
          // 使用 Supabase 的 raw 执行
          const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: statement});

          if (error) {
            // 尝试直接使用 PostgreSQL 客户端
            console.error(`[Migration] 语句 ${i + 1} 失败 (尝试备用方法):`, error.message);
            results.push({
              index: i + 1,
              success: false,
              error: error.message});
            errorCount++;
          } else {
            console.log(`[Migration] ✅ 语句 ${i + 1}/${statements.length}`);
            results.push({ index: i + 1, success: true });
            successCount++;
          }
        } catch (err: any) {
          console.error(`[Migration] 语句 ${i + 1} 异常:`, err.message);
          results.push({
            index: i + 1,
            success: false,
            error: err.message});
          errorCount++;
        }

        // 避免过快的请求
        if (i < statements.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`[Migration] 完成: ${successCount} 成功, ${errorCount} 失败`);

      return NextResponse.json({
        success: errorCount === 0,
        message: `迁移完成: ${successCount} 成功, ${errorCount} 失败`,
        totalStatements: statements.length,
        successCount,
        errorCount,
        results: results.filter((r) => !r.success), // 只返回失败的结果
      });
    } catch (error: any) {
      console.error('[Migration] 执行失败:', error);
      return NextResponse.json({ error: '服务器错误', details: error.message }, { status: 500 });
    }
  }
);
