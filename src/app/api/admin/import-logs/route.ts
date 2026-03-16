import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取导入日志列表
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') || 'all';

    console.log('[Import Logs API] ========== 获取导入日志列表 ==========');
    console.log('[Import Logs API] 参数:', { limit, offset, status });

    const db = getSupabaseClient();

    // 检查 import_logs 表是否存在
    const { count: totalCount, error: countError } = await db
      .from('import_logs')
      .select('*', { count: 'exact', head: true })
      .limit(1);

    if (countError) {
      console.log('[Import Logs API] import_logs 表不存在，返回空列表');
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
        total: 0,
      });
    }

    // 构建查询
    let query = db
      .from('import_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 状态筛选
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('[Import Logs API] 查询失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    console.log(`[Import Logs API] 查询成功，找到 ${logs?.length || 0} 条记录，总计 ${totalCount || 0} 条`);

    return NextResponse.json({
      success: true,
      data: logs || [],
      count: logs?.length || 0,
      total: totalCount || 0,
    });
  } catch (error) {
    console.error('[Import Logs API] 获取导入日志失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取导入日志失败',
      },
      { status: 500 }
    );
  }
}
