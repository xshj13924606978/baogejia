import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

// 标记全部为已读（仅本人或管理员可操作）
export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    // 仅本人或管理员可操作
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.id !== user_id) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 });
    }

    const db = getSupabaseServiceClient();

    // user_id 为 UUID，不能 parseInt
    const { error } = await db
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user_id)
      .eq('is_read', false);

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ success: true, message: '全部已标记为已读' });
      }
      console.error('[NotificationsReadAll] 标记失败:', error);
      return NextResponse.json({ error: '标记失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '全部已标记为已读',
    });
  } catch (error) {
    console.error('[NotificationsReadAll] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
