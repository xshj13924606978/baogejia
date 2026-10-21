/**
 * 数据分析：导出（CSV）
 * 修复 #[20260825-0930] - 改为从数据库读真实数据
 *
 * GET /api/analytics/export?type=events|funnel|retention|revenue&days=7&startDate=&endDate=
 *   type 默认 events
 *   下载为 application/octet-stream（CSV）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireReportView } from '@/lib/permission-gate';
import { DbAnalyticsService } from '@/lib/analytics';

function escapeCsv(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers: string[], rows: any[][]): string {
  const head = headers.map(escapeCsv).join(',');
  const body = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

export async function GET(request: NextRequest) {
  try {
    // #20260901-0900 P2-2：管理员直通 + report_view 模块权限
    const gate = await requireReportView(request);
    if (gate.errorResponse) return gate.errorResponse;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'events';
    const daysStr = searchParams.get('days');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    let startDate: Date | null = startDateStr ? new Date(startDateStr) : null;
    let endDate: Date | null = endDateStr ? new Date(endDateStr) : null;
    let days: number | null = null;
    if (daysStr !== null && daysStr !== '') {
      const v = parseInt(daysStr, 10);
      if (!Number.isNaN(v)) days = v;
    }

    const svc = new DbAnalyticsService();
    const range = { startDate, endDate, days };
    let csv = '';
    let filename = `analytics-${type}-${Date.now()}.csv`;

    if (type === 'funnel') {
      const funnel = await svc.getFunnel(range);
      csv = rowsToCsv(
        ['步骤', '用户数', '转化率(%)', '流失率(%)'],
        funnel.map((f) => [
          f.step,
          f.count,
          f.conversionRate.toFixed(2),
          f.dropOffRate.toFixed(2),
        ])
      );
      filename = `funnel-${days ?? 7}d-${Date.now()}.csv`;
    } else if (type === 'retention') {
      const retention = await svc.getRetention(
        days ?? 30,
        parseInt(searchParams.get('limit') ?? '30', 10) || 30
      );
      csv = rowsToCsv(
        ['日期', '新增', 'D1', 'D7', 'D30', '留存率1(%)', '留存率7(%)', '留存率30(%)'],
        retention.map((r) => [
          r.date,
          r.day0,
          r.day1,
          r.day7,
          r.day30,
          r.retentionRate1.toFixed(2),
          r.retentionRate7.toFixed(2),
          r.retentionRate30.toFixed(2),
        ])
      );
      filename = `retention-${days ?? 30}d-${Date.now()}.csv`;
    } else if (type === 'revenue') {
      const { revenue, summary } = await svc.getRevenue(range);
      csv =
        rowsToCsv(
          ['日期', '收入', '订单数', '客单价', '新客户收入', '老客户收入'],
          revenue.map((r) => [
            r.date,
            r.revenue.toFixed(2),
            r.orderCount,
            r.averageOrderValue.toFixed(2),
            r.newCustomerRevenue.toFixed(2),
            r.returningCustomerRevenue.toFixed(2),
          ])
        ) +
        '\n' +
        rowsToCsv(
          ['汇总', '总收入', '订单数', '客单价', '新客户收入', '老客户收入'],
          [
            [
              '合计',
              summary.totalRevenue.toFixed(2),
              summary.totalOrders,
              summary.averageOrderValue.toFixed(2),
              summary.newCustomerRevenue.toFixed(2),
              summary.returningCustomerRevenue.toFixed(2),
            ],
          ]
        );
      filename = `revenue-${days ?? 7}d-${Date.now()}.csv`;
    } else {
      // events
      const { events } = await svc.getEvents({
        range,
        limit: 1000,
        offset: 0,
      });
      csv = rowsToCsv(
        [
          'ID',
          '时间',
          '用户ID',
          '事件类型',
          '漏斗阶段',
          '会话ID',
          '页面',
          '停留(秒)',
        ],
        events.map((e) => [
          e.id,
          e.createdAt,
          e.userId,
          e.eventType,
          e.funnelStage,
          e.sessionId,
          e.page,
          e.durationSeconds,
        ])
      );
      filename = `events-${days ?? 7}d-${Date.now()}.csv`;
    }

    const filenameEncoded = encodeURIComponent(filename);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameEncoded}"; filename*=UTF-8''${filenameEncoded}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e: any) {
    console.error('[API /analytics/export] 错误:', e);
    // 导出兜底：返回只含 header 的 CSV 而不是 500，避免前端文件下载失败
    const csv = '错误\n' + rowsToCsv(['message'], [[e?.message ?? '导出失败']]);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="error-${Date.now()}.csv"`,
      },
    });
  }
}
