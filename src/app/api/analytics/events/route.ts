/**
 * 数据分析：事件追踪
 * 修复 #[20260825-0930] - 改为基于 analytics_events 数据库
 *
 * GET    /api/analytics/events?startDate=&endDate=&days=&eventType=&page=&search=&limit=&offset=
 * POST   /api/analytics/events  body: { userId, eventType, ... }
 * DELETE /api/analytics/events  body: { ids: string[] } - 批量删除事件
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { requireReportView } from '@/lib/permission-gate';
import { DbAnalyticsService } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  try {
    // #20260901-0900 P2-2：管理员直通 + report_view 模块权限
    const gate = await requireReportView(request);
    if (gate.errorResponse) return gate.errorResponse;

    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const daysStr = searchParams.get('days');
    const eventType = searchParams.get('eventType') || undefined;
    const page = searchParams.get('page') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10) || 50;
    const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

    let startDate: Date | null = startDateStr ? new Date(startDateStr) : null;
    let endDate: Date | null = endDateStr ? new Date(endDateStr) : null;
    let days: number | null = null;
    if (daysStr !== null && daysStr !== '') {
      const v = parseInt(daysStr, 10);
      if (!Number.isNaN(v)) days = v;
    }

    const svc = new DbAnalyticsService();
    const result = await svc.getEvents({
      range: { startDate, endDate, days },
      eventType,
      page,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      events: result.events,
      total: result.total,
      limit,
      offset,
      period: {
        start: startDate?.toISOString() ?? null,
        end: endDate?.toISOString() ?? null,
        days,
      },
    });
  } catch (e: any) {
    console.error('[API /analytics/events GET] 错误:', e);
    return NextResponse.json(
      {
        events: [],
        total: 0,
        error: e?.message ?? '读取事件失败',
      },
      { status: 200 } // 兜底：前端表格可继续渲染
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;
    if (!user) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!body || !body.eventType) {
      return NextResponse.json(
        { error: 'eventType 必填' },
        { status: 400 }
      );
    }

    const svc = new DbAnalyticsService();
    await svc.trackEvent({
      userId: body.userId ?? user.id ?? null,
      eventType: body.eventType,
      funnelStage: body.funnelStage ?? null,
      sessionId: body.sessionId ?? null,
      page: body.page ?? null,
      durationSeconds: body.durationSeconds ?? null,
      properties: body.properties ?? {},
      userAgent: body.userAgent ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[API /analytics/events POST] 错误:', e);
    return NextResponse.json(
      { error: e?.message ?? '事件写入失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // #20260901-0900 P2-2：管理员直通 + report_view 模块权限
    const gate = await requireReportView(request);
    if (gate.errorResponse) return gate.errorResponse;

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (!ids.length) {
      return NextResponse.json(
        { error: 'ids 必填且为非空数组' },
        { status: 400 }
      );
    }
    if (ids.length > 500) {
      return NextResponse.json(
        { error: '单次最多 500 条' },
        { status: 400 }
      );
    }

    const svc = new DbAnalyticsService();
    const deleted = await svc.deleteEventsByIds(ids);
    return NextResponse.json({ success: true, deleted });
  } catch (e: any) {
    console.error('[API /analytics/events DELETE] 错误:', e);
    return NextResponse.json(
      { error: e?.message ?? '事件删除失败' },
      { status: 500 }
    );
  }
}
