import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * GET - 获取单条导入日志详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const db = getSupabaseClient();

    const { data: log, error } = await db
      .from('import_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Import Log Detail API] 获取日志详情失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
        },
        { status: 500 }
      );
    }

    if (!log) {
      return NextResponse.json(
        {
          success: false,
          error: '日志不存在',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error('[Import Log Detail API] 获取日志详情异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取日志详情失败',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 删除导入日志
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const db = getSupabaseClient();

    const { error } = await db
      .from('import_logs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Import Log Detail API] 删除日志失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '日志删除成功',
    });
  } catch (error) {
    console.error('[Import Log Detail API] 删除日志异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: '删除日志失败',
      },
      { status: 500 }
    );
  }
}
