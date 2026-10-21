import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin, requireAuth } from '@/lib/auth-utils';

// 推送通知给指定用户（管理员专用，真实写入 notifications 表）
export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const { userIds, title, content, type = 'system', metadata } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: '缺少用户ID列表' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: '缺少通知标题' }, { status: 400 });
    }

    // 真实写入 notifications 表（禁用模拟数据）
    const db = getSupabaseServiceClient();
    const rows = userIds.map((userId: string) => ({
      user_id: userId,
      type,
      title,
      content: content || '',
      data: metadata || {},
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    const { data, error } = await db.from('notifications').insert(rows).select();

    if (error) {
      console.error('[NotificationsPush] 推送通知失败:', error);
      return NextResponse.json({ error: '推送通知失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      notifications: data || [],
    });
  } catch (error) {
    console.error('[NotificationsPush] 推送通知失败:', error);
    return NextResponse.json({ error: '推送通知失败' }, { status: 500 });
  }
}

// 获取未读通知数量（真实查询，仅本人或管理员可查）
export async function GET(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || user.id;

    // 仅本人或管理员可查
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.id !== userId) {
      return NextResponse.json({ error: '无权查看' }, { status: 403 });
    }

    const db = getSupabaseServiceClient();
    const { count, error } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      // 表不存在时优雅返回 0
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ success: true, unreadCount: 0 });
      }
      console.error('[NotificationsPush] 获取未读通知数量失败:', error);
      return NextResponse.json({ error: '获取未读通知数量失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, unreadCount: count || 0 });
  } catch (error) {
    console.error('[NotificationsPush] 获取未读通知数量失败:', error);
    return NextResponse.json({ error: '获取未读通知数量失败' }, { status: 500 });
  }
}
