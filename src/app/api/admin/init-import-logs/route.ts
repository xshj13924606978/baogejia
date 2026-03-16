import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 初始化导入日志表
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Init Import Logs] ========== 开始初始化导入日志表 ==========');

    const db = getSupabaseClient();

    // 读取SQL文件
    const sqlPath = join(process.cwd(), 'scripts', 'create-import-logs-table.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // 执行SQL（使用rpc调用sql函数）
    const { data, error } = await db.rpc('exec_sql', { sql });

    if (error) {
      console.error('[Init Import Logs] 执行SQL失败:', error);

      // 如果没有exec_sql函数，尝试直接使用sql命令
      try {
        const sqlCommands = sql.split(';').filter(cmd => cmd.trim().length > 0);

        for (const cmd of sqlCommands) {
          const trimmedCmd = cmd.trim();
          if (trimmedCmd) {
            console.log('[Init Import Logs] 执行命令:', trimmedCmd.substring(0, 100) + '...');
            // 注意：这里需要使用实际的SQL执行方式
            // 由于Supabase客户端不支持直接执行DDL，这里返回SQL供用户手动执行
          }
        }

        return NextResponse.json({
          success: false,
          requiresManualSetup: true,
          sqlStatements: sql,
          message: '请手动在Supabase SQL Editor中执行以下SQL',
        });
      } catch (execError) {
        return NextResponse.json(
          {
            success: false,
            requiresManualSetup: true,
            sqlStatements: sql,
            message: '请手动在Supabase SQL Editor中执行以下SQL',
          },
          { status: 200 }
        );
      }
    }

    console.log('[Init Import Logs] 初始化成功');

    return NextResponse.json({
      success: true,
      message: '导入日志表初始化成功',
    });
  } catch (error) {
    console.error('[Init Import Logs] 初始化失败:', error);

    // 读取SQL文件返回
    try {
      const sqlPath = join(process.cwd(), 'scripts', 'create-import-logs-table.sql');
      const sql = readFileSync(sqlPath, 'utf-8');

      return NextResponse.json(
        {
          success: false,
          requiresManualSetup: true,
          sqlStatements: sql,
          message: '请手动在Supabase SQL Editor中执行以下SQL',
        },
        { status: 200 }
      );
    } catch (readError) {
      return NextResponse.json(
        {
          success: false,
          error: '初始化失败',
        },
        { status: 500 }
      );
    }
  }
}
