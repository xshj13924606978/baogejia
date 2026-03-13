import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取通知列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { data: notifications, error } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', parseInt(user_id))
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Notifications] 查询失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      notifications: notifications || [],
    });
  } catch (error) {
    console.error('[Notifications] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 标记为已读
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notification_id } = body;

    if (!notification_id) {
      return NextResponse.json({ error: '缺少通知ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { error } = await db
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification_id);

    if (error) {
      console.error('[Notifications] 标记失败:', error);
      return NextResponse.json({ error: '标记失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '已标记为已读',
    });
  } catch (error) {
    console.error('[Notifications] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
