import { NextRequest, NextResponse } from 'next/server';
import { analytics, EventType } from '@/lib/analytics';

/**
 * 记录事件API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, eventType, page, properties } = body;

    if (!userId || !eventType) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 记录事件
    analytics.trackEvent({
      userId,
      eventType: eventType as EventType,
      page,
      properties,
      timestamp: new Date(),
      userAgent: request.headers.get('user-agent') || undefined,
      referrer: request.headers.get('referer') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: '事件记录成功',
    });
  } catch (error) {
    console.error('[Analytics] 记录事件失败:', error);
    return NextResponse.json({ error: '记录事件失败' }, { status: 500 });
  }
}

/**
 * 获取事件列表API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate) {
      start = new Date(startDate);
    }

    if (endDate) {
      end = new Date(endDate);
    }

    const events = analytics.getEvents(start, end, userId ? parseInt(userId) : undefined);

    return NextResponse.json({
      success: true,
      events: events.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
      count: events.length,
    });
  } catch (error) {
    console.error('[Analytics] 获取事件列表失败:', error);
    return NextResponse.json({ error: '获取事件列表失败' }, { status: 500 });
  }
}
