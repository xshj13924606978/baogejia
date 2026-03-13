import { NextRequest, NextResponse } from 'next/server';
import { analytics } from '@/lib/analytics';

/**
 * 导出分析数据API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
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

    const funnel = analytics.calculateFunnel(start, end);
    const retention = analytics.calculateRetention(7);
    const revenue = analytics.getRevenueData(start, end);
    const stats = analytics.getStats(start, end);

    // 生成CSV内容
    const csv = [
      '数据分析报告',
      '',
      '统计概览',
      `总用户数,${stats.totalUsers}`,
      `活跃用户,${stats.activeUsers}`,
      `新增用户,${stats.newUsers}`,
      `总收入,${stats.totalRevenue}`,
      `转化率,${stats.conversionRate.toFixed(2)}%`,
      '',
      '转化漏斗',
      '步骤,数量,转化率,流失率',
      ...funnel.map(
        (f) => `${f.step},${f.count},${f.conversionRate.toFixed(2)}%,${f.dropOffRate.toFixed(2)}%`
      ),
      '',
      '收入数据',
      '日期,收入,订单数,平均客单价',
      ...revenue.map(
        (r) =>
          `${r.date.toISOString().split('T')[0]},${r.revenue},${r.orderCount},${r.averageOrderValue.toFixed(2)}`
      ),
      '',
      '留存数据',
      '日期,新增用户,次日留存,7日留存,30日留存',
      ...retention.map(
        (r) =>
          `${r.date.toISOString().split('T')[0]},${r.day0},${r.retentionRate1.toFixed(2)}%,${r.retentionRate7.toFixed(2)}%,${r.retentionRate30.toFixed(2)}%`
      ),
    ].join('\n');

    // 返回CSV文件
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('[Analytics] 导出数据失败:', error);
    return NextResponse.json({ error: '导出数据失败' }, { status: 500 });
  }
}
