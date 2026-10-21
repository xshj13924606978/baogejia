import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST - 启用/禁用用户
 * body: { action: 'disable' | 'enable' }
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const { action } = await request.json();

    if (!action || !['disable', 'enable'].includes(action)) {
      return NextResponse.json(
        { success: false, error: '请指定有效操作: disable 或 enable' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();
    const newStatus = action === 'disable' ? 'disabled' : 'active';

    const { data, error } = await db
      .from('users')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[User Disable API] 操作失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: action === 'disable' ? '用户已禁用' : '用户已启用',
      data: { id: data.id, status: data.status },
    });
  } catch (error: any) {
    console.error('[User Disable API] 异常:', error);
    return NextResponse.json({ success: false, error: '操作失败' }, { status: 500 });
  }
}
