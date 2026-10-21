/**
 * 数据分析：留存分析
 * 修复 #[20260825-0930] - 改为从数据库读真实数据
 *
 * GET /api/analytics/retention?days=30&limit=30
 *
 * 计算每日的 D1/D7/D30 留存率（基于 analytics_events）。
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
    const days = Math.max(
      1,
      Math.min(parseInt(searchParams.get('days') ?? '30', 10) || 30, 90)
    );
    const limit = Math.max(
      1,
      Math.min(parseInt(searchParams.get('limit') ?? '30', 10) || 30, 60)
    );

    const svc = new DbAnalyticsService();
    const retention = await svc.getRetention(days, limit);

    return NextResponse.json({
      retention,
      period: { days, limit },
    });
  } catch (e: any) {
    console.error('[API /analytics/retention] 错误:', e);
    return NextResponse.json(
      { error: e?.message ?? '读取留存数据失败' },
      { status: 500 }
    );
  }
}
