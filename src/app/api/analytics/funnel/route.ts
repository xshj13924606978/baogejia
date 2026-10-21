/**
 * 数据分析：转化漏斗
 * 修复 #[20260825-0930] - 改为从数据库读真实数据
 *
 * GET /api/analytics/funnel?startDate=&endDate=&days=
 *   - 不传参：默认最近 7 天
 *   - days=0/-1：全部
 *   - 有 startDate/endDate：精确区间
 *
 * Response:
 *   { stats: {...}, funnel: FunnelDataPoint[], period: {start, end} }
 */

import { NextRequest, NextResponse } from 'next/server';
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

    let startDate: Date | null = null;
    let endDate: Date | null = null;
    let days: number | null = null;

    if (startDateStr) startDate = new Date(startDateStr);
    if (endDateStr) endDate = new Date(endDateStr);
    if (daysStr !== null && daysStr !== '') {
      const v = parseInt(daysStr, 10);
      if (!Number.isNaN(v)) days = v;
    }

    const svc = new DbAnalyticsService();
    const [funnel, stats] = await Promise.all([
      svc.getFunnel({ startDate, endDate, days }),
      svc.getStats({ startDate, endDate, days }),
    ]);

    return NextResponse.json({
      stats,
      funnel,
      period: {
        start: startDate?.toISOString() ?? null,
        end: endDate?.toISOString() ?? null,
        days,
      },
    });
  } catch (e: any) {
    console.error('[API /analytics/funnel] 错误:', e);
    return NextResponse.json(
      { error: e?.message ?? '读取漏斗数据失败' },
      { status: 500 }
    );
  }
}
