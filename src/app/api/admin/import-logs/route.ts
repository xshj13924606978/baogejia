import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET - 获取导入日志列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    const db = getSupabaseClient();

    // 构建查询
    let query = db
      .from('import_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 如果指定了状态，过滤
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('[Import Logs API] 获取日志失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    // 获取总数
    const { count: totalCount } = await db
      .from('import_logs')
      .select('*', { count: 'exact', head: true })
      .eq(status && status !== 'all' ? 'status' : '', status || '');

    return NextResponse.json({
      success: true,
      data: logs || [],
      pagination: {
        total: totalCount || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (totalCount || 0),
      },
    });
  } catch (error) {
    console.error('[Import Logs API] 获取日志异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取日志失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST - 创建导入日志记录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      file_name,
      file_type,
      total_count,
      imported_count = 0,
      skipped_count = 0,
      failed_count = 0,
      duplicate_config,
      details,
      duration_ms,
      status = 'completed',
      started_at,
      completed_at,
    } = body;

    const db = getSupabaseClient();

    const { data, error } = await db
      .from('import_logs')
      .insert({
        file_name,
        file_type,
        total_count,
        imported_count,
        skipped_count,
        failed_count,
        duplicate_config,
        details,
        duration_ms,
        status,
        started_at,
        completed_at,
      })
      .select()
      .single();

    if (error) {
      console.error('[Import Logs API] 创建日志失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: '导入日志创建成功',
    });
  } catch (error) {
    console.error('[Import Logs API] 创建日志异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: '创建日志失败',
      },
      { status: 500 }
    );
  }
}
