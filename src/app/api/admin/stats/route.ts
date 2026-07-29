import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 基础统计 API（管理员）
 * 总用户、今日活跃、报价单数、今日报价单、产品数量、总积分
 */
export async function GET(_request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(_request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [usersRes, activeRes, quotesRes, todayQuotesRes, productsRes] = await Promise.all([
      db.from('users').select('*', { count: 'exact', head: true }),
      db.from('users').select('*', { count: 'exact', head: true }).gte('last_login', todayISO),
      db.from('quotes').select('*', { count: 'exact', head: true }),
      db.from('quotes').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
      db.from('products').select('*', { count: 'exact', head: true }),
    ]);

    // 总积分
    const { data: pointsData } = await db.from('users').select('total_points').not('total_points', 'is', null);
    const totalPoints = pointsData?.reduce((sum: number, u: any) => sum + (u.total_points || 0), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: usersRes.count || 0,
        activeUsersToday: activeRes.count || 0,
        totalQuotes: quotesRes.count || 0,
        todayQuotes: todayQuotesRes.count || 0,
        totalProducts: productsRes.count || 0,
        totalPoints,
      },
    });
  } catch (error) {
    console.error('[Stats API] 获取统计数据失败:', error);
    return NextResponse.json({ success: false, error: '获取统计数据失败' }, { status: 500 });
  }
}
