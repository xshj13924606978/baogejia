import { NextRequest, NextResponse } from 'next/server';

// 推送通知给指定用户
export async function POST(request: NextRequest) {
  try {
    const { userIds, title, content, type = 'info', action_url, metadata } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: '缺少用户ID列表' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: '缺少通知标题' },
        { status: 400 }
      );
    }

    // 模拟批量创建通知
    const notifications = userIds.map((userId: number) => ({
      id: Date.now() + userId,
      user_id: userId,
      title,
      content: content || '',
      type,
      action_url,
      metadata: metadata || {},
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    // TODO: 通过 WebSocket 推送通知
    // 这里需要调用 WebSocket 服务器的推送函数
    // 由于 Next.js API 路由与 WebSocket 服务器是独立的，
    // 可以使用 Redis 或其他消息队列来协调

    console.log('[API] 推送通知给用户:', userIds);

    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications: notifications,
    });
  } catch (error) {
    console.error('推送通知失败:', error);
    return NextResponse.json(
      { error: '推送通知失败' },
      { status: 500 }
    );
  }
}

// 获取未读通知数量
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: '缺少用户ID' },
        { status: 400 }
      );
    }

    // 模拟未读通知数量
    const unreadCount = Math.floor(Math.random() * 10);

    return NextResponse.json({
      success: true,
      unreadCount: unreadCount,
    });
  } catch (error) {
    console.error('获取未读通知数量失败:', error);
    return NextResponse.json(
      { error: '获取未读通知数量失败' },
      { status: 500 }
    );
  }
}
