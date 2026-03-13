import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 标记全部为已读
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { error } = await db
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', parseInt(user_id))
      .eq('is_read', false);

    if (error) {
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
