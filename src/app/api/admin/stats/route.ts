import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';


export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.stats.view'] },
  async (request: NextRequest, user: any) => {

  try {
    // 模拟统计数据
    const mockStats = {
      todayUsers: 12,
      totalUsers: 156,
      todayQuotes: 45,
      totalQuotes: 1234,
      todayPoints: 230,
      totalPoints: 5678,
      todayIncome: 1200,
      totalIncome: 15600
    };

    return NextResponse.json(mockStats);
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return NextResponse.json(
      { error: '获取统计数据失败' }, { status: 500 }
      );
    );
  }
});