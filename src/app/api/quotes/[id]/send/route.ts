import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * POST - 发送报价单（更新状态为 sent 并记录签发时间）
 * 管理员可发送所有；普通用户仅可发送自己的
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  const { id } = await params;

  try {
    const db = getSupabaseServiceClient();
    let ownerQuery = db
      .from('quotes')
      .select('id, user_id, status, issued_at')
      .eq('id', id)
      .is('deleted_at', null);

    if (!isAdminRole(user.role)) {
      ownerQuery = ownerQuery.eq('user_id', user.id);
    }

    const { data: existing, error: ownerError } = await ownerQuery.single();
    if (ownerError || !existing) {
      return NextResponse.json({ success: false, error: '报价单不存在' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: 'sent',
      updated_at: now,
    };
    // 首次发送记录签发时间
    if (!existing.issued_at) {
      updatePayload.issued_at = now;
    }

    const { data, error } = await db
      .from('quotes')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Quotes API] 发送失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单已发送', data });
  } catch (error: any) {
    console.error('[Quotes API] 发送异常:', error);
    return NextResponse.json({ success: false, error: '发送报价单失败' }, { status: 500 });
  }
}
