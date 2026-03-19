import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.stats.view'] },
  async (_request: NextRequest, _context: any) => {
    try {
      const db = getSupabaseClient();

      // 获取用户统计
      const { count: totalUsers } = await db
        .from('users')
        .select('*', { count: 'exact', head: true });

      // 获取今日活跃用户（今天有登录的用户）
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: activeUsersToday } = await db
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login', today.toISOString());

      // 获取报价单统计
      const { count: totalQuotes } = await db
        .from('quotes')
        .select('*', { count: 'exact', head: true });

      // 获取产品统计
      const { count: totalProducts } = await db
        .from('products')
        .select('*', { count: 'exact', head: true });

      // 获取今日报价单数
      const { count: todayQuotes } = await db
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // 获取总积分
      const { data: pointsData } = await db
        .from('users')
        .select('total_points')
        .not('total_points', 'is', null);

      const totalPoints = pointsData?.reduce((sum, user) => sum + (user.total_points || 0), 0) || 0;

      return NextResponse.json({
        totalUsers: totalUsers || 0,
        activeUsersToday: activeUsersToday || 0,
        totalQuotes: totalQuotes || 0,
        todayQuotes: todayQuotes || 0,
        totalProducts: totalProducts || 0,
        totalPoints: totalPoints,
      });
    } catch (error) {
      console.error('获取统计数据失败:', error);
      return NextResponse.json({ error: '获取统计数据失败' }, { status: 500 });
    }
  }
);
