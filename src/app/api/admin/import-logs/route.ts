import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 获取导入日志列表（管理员）
 * 修复：count 查询也应用 status 筛选
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') || 'all';

    const db = getSupabaseServiceClient();

    // 构建 count 查询（应用筛选条件）
    let countQuery = db
      .from('import_logs')
      .select('*', { count: 'exact', head: true });

    if (status !== 'all') {
      countQuery = countQuery.eq('status', status);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.log('[Import Logs API] 表不存在，返回空列表');
      return NextResponse.json({ success: true, data: [], count: 0, total: 0 });
    }

    // 构建 data 查询
    let query = db
      .from('import_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: logs, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('[Import Logs API] 查询失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: logs || [],
      count: logs?.length || 0,
      total: totalCount || 0,
    });
  } catch (error) {
    console.error('[Import Logs API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取导入日志失败' }, { status: 500 });
  }
}
