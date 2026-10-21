import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 审核拒绝 API
 * POST /api/admin/audit/[id]/reject
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const { reason } = await request.json();

    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: '请提供拒绝原因' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('knowledge_entries')
      .update({
        status: 'rejected',
        description: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      console.error('[Audit Reject] 失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: '条目不存在或状态不是待审核' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: '已拒绝' });
  } catch (error: any) {
    console.error('[Audit Reject] 异常:', error);
    return NextResponse.json({ success: false, error: '审核拒绝失败' }, { status: 500 });
  }
}
