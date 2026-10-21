import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireReportView } from '@/lib/permission-gate';

/**
 * 基础统计 API（管理员 / 持有 report_view 权限的用户，#20260901-0900 P2-2）
 * 总用户、今日活跃、报价单数、今日报价单、产品数量、总积分（余额/累计）、今日收入、近30天趋势
 */
export async function GET(_request: NextRequest) {
  const gate = await requireReportView(_request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const db = getSupabaseServiceClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // 近30天起始时间
    const since = new Date(today);
    since.setDate(since.getDate() - 29);
    const sinceISO = since.toISOString();

    const [usersRes, activeRes, quotesRes, todayQuotesRes, productsRes] = await Promise.all([
      db.from('users').select('*', { count: 'exact', head: true }),
      db.from('users').select('*', { count: 'exact', head: true }).gte('last_login', todayISO),
      db.from('quotes').select('*', { count: 'exact', head: true }),
      db.from('quotes').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
      db.from('products').select('*', { count: 'exact', head: true }),
    ]);

    // 总积分（#20260901-0900 P2-1：口径统一为权威当前余额
    // COALESCE(users.points, metadata.points)，与迁移 118/120 check_points_consistency()
    // 完全一致；累计获得积分单独聚合返回，前端明确标注两种口径）
    const { data: pointsData } = await db.from('users').select('points, total_points, metadata');
    let totalPoints = 0;
    let totalPointsCumulative = 0;
    pointsData?.forEach((u: any) => {
      const metaPoints = typeof u.metadata?.points === 'number'
        ? u.metadata.points
        : (parseInt(u.metadata?.points || '0', 10) || 0);
      totalPoints += u.points ?? metaPoints;
      const col = u.total_points || 0;
      const metaTotal = typeof u.metadata?.total_points === 'number'
        ? u.metadata.total_points
        : (parseInt(u.metadata?.total_points || '0', 10) || 0);
      totalPointsCumulative += Math.max(col, metaTotal);
    });

    // 今日收入（payment_records 中今日成功支付金额）
    const { data: todayPayments } = await db
      .from('payment_records')
      .select('amount, payment_status, created_at')
      .gte('created_at', todayISO);
    const todayRevenue = todayPayments
      ?.filter((p) => p.payment_status === 'success')
      .reduce((sum: number, p) => sum + (p.amount || 0), 0) || 0;

    // 近30天趋势：每日新注册用户数 + 每日新增报价数（真实数据，无 0 值日自动补齐）
    const [users30dRes, quotes30dRes] = await Promise.all([
      db.from('users').select('created_at').gte('created_at', sinceISO),
      db.from('quotes').select('created_at').gte('created_at', sinceISO),
    ]);

    const usersByDay = new Map<string, number>();
    users30dRes.data?.forEach((u) => {
      const d = (u.created_at || '').slice(0, 10);
      if (d) usersByDay.set(d, (usersByDay.get(d) || 0) + 1);
    });
    const quotesByDay = new Map<string, number>();
    quotes30dRes.data?.forEach((q) => {
      const d = (q.created_at || '').slice(0, 10);
      if (d) quotesByDay.set(d, (quotesByDay.get(d) || 0) + 1);
    });

    // 生成连续 30 天日期序列，无数据的天补 0
    const trends30d: Array<{ date: string; users: number; quotes: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trends30d.push({
        date: key,
        users: usersByDay.get(key) || 0,
        quotes: quotesByDay.get(key) || 0,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: usersRes.count || 0,
        activeUsersToday: activeRes.count || 0,
        totalQuotes: quotesRes.count || 0,
        todayQuotes: todayQuotesRes.count || 0,
        totalProducts: productsRes.count || 0,
        totalPoints,
        totalPointsCumulative,
        todayRevenue,
        trends30d,
      },
    });
  } catch (error) {
    console.error('[Stats API] 获取统计数据失败:', error);
    return NextResponse.json({ success: false, error: '获取统计数据失败' }, { status: 500 });
  }
}
