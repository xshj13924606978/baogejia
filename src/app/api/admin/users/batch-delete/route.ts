import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST - 批量删除用户
 * body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: '请至少选择一个用户' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // #20260827-0826-2 修复：原直接 DELETE 因外键约束导致 500，改为级联删除函数
    const { error } = await db.rpc('delete_user_cascade', { user_ids: ids });

    if (error) {
      console.error('[User BatchDelete API] 删除失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `成功删除 ${ids.length} 个用户`,
      deletedCount: ids.length,
    });
  } catch (error: any) {
    console.error('[User BatchDelete API] 异常:', error);
    return NextResponse.json({ success: false, error: '批量删除用户失败' }, { status: 500 });
  }
}
