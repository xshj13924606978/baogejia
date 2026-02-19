import { NextRequest, NextResponse } from 'next/server';
import { analytics } from '@/lib/analytics';

/**
 * 获取留存数据API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const limit = parseInt(searchParams.get('limit') || '30');

    const retentionData = analytics.calculateRetention(days).slice(0, limit);

    return NextResponse.json({
      success: true,
      retention: retentionData.map(r => ({
        ...r,
        date: r.date.toISOString().split('T')[0],
      })),
    });
  } catch (error) {
    console.error('[Analytics] 获取留存数据失败:', error);
    return NextResponse.json(
      { error: '获取留存数据失败' },
      { status: 500 }
    );
  }
}
