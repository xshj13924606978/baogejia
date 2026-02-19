import { NextRequest, NextResponse } from 'next/server';
import { analytics } from '@/lib/analytics';

/**
 * 获取转化漏斗数据API
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

    const funnelData = analytics.calculateFunnel(start, end);

    return NextResponse.json({
      success: true,
      funnel: funnelData,
    });
  } catch (error) {
    console.error('[Analytics] 获取转化漏斗失败:', error);
    return NextResponse.json(
      { error: '获取转化漏斗失败' },
      { status: 500 }
    );
  }
}
