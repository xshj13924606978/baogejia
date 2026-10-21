/**
 * 数据分析：收入统计
 * 修复 #[20260825-0930] - 改为从数据库读真实数据（payment_records）
 *
 * GET /api/analytics/revenue?startDate=&endDate=&days=
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
    const result = await svc.getRevenue({ startDate, endDate, days });

    return NextResponse.json({
      ...result,
      period: {
        start: startDate?.toISOString() ?? null,
        end: endDate?.toISOString() ?? null,
        days,
      },
    });
  } catch (e: any) {
    console.error('[API /analytics/revenue] 错误:', e);
    // 兜底空数据，避免页面崩溃
    return NextResponse.json({
      revenue: [],
      summary: {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        newCustomerRevenue: 0,
        returningCustomerRevenue: 0,
      },
      error: e?.message ?? '读取收入失败',
    });
  }
}
