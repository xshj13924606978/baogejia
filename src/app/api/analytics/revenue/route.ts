import { NextRequest, NextResponse } from 'next/server';
import { analytics } from '@/lib/analytics';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 获取收入数据API
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

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

    const revenueData = analytics.getRevenueData(start, end);

    // 计算汇总数据
    const totalRevenue = revenueData.reduce((sum, r) => sum + r.revenue, 0);
    const totalOrders = revenueData.reduce((sum, r) => sum + r.orderCount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return NextResponse.json({
      success: true,
      revenue: revenueData.map((r) => ({
        ...r,
        date: r.date.toISOString().split('T')[0],
      })),
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue,
      },
    });
  } catch (error) {
    console.error('[Analytics] 获取收入数据失败:', error);
    return NextResponse.json({ error: '获取收入数据失败' }, { status: 500 });
  }
}
