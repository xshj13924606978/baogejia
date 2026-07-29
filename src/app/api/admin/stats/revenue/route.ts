import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 收入统计API
 *
 * GET: 获取收入统计数据
 */

export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    const supabase = getSupabaseServiceClient();

    // 获取支付记录
    let query = supabase
      .from('payment_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: payments, error: paymentsError } = await query;

    if (paymentsError) {
      // 表不存在时返回空统计
      return NextResponse.json(emptyStats());
    }

      // 统计数据
      const stats = {
        totalRevenue: 0,
        totalOrders: payments?.length || 0,
        averageOrderValue: 0,
        byPaymentMethod: {} as Record<string, { count: number; amount: number }>,
        byPlan: {} as Record<string, { count: number; amount: number }>,
        byStatus: {} as Record<string, { count: number; amount: number }>,
        dailyRevenue: [] as Array<{ date: string; amount: number; count: number }>,
        monthlyRevenue: [] as Array<{ month: string; amount: number; count: number }>,
        topUsers: [] as Array<{ userId: number; amount: number; orderCount: number }>,
        summary: {
          successRate: 0,
          refundRate: 0,
          highestDay: { date: '', amount: 0 },
          lowestDay: { date: '', amount: Infinity },
          growthRate: 0}};

      const validPayments = payments || [];
      stats.totalOrders = validPayments.length;

      // 计算总收入
      const totalAmount = validPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      stats.totalRevenue = totalAmount;
      stats.averageOrderValue =
        stats.totalOrders > 0 ? Number((totalAmount / stats.totalOrders).toFixed(2)) : 0;

      // 按支付方式统计
      const methodMap = new Map<string, { count: number; amount: number }>();
      validPayments.forEach((p) => {
        const method = p.payment_method || 'unknown';
        if (!methodMap.has(method)) {
          methodMap.set(method, { count: 0, amount: 0 });
        }
        const methodData = methodMap.get(method)!;
        methodData.count += 1;
        methodData.amount += p.amount || 0;
      });

      stats.byPaymentMethod = Object.fromEntries(methodMap);

      // 按套餐统计
      const planMap = new Map<string, { count: number; amount: number }>();
      validPayments.forEach((p) => {
        if (p.plan_id) {
          if (!planMap.has(p.plan_id)) {
            planMap.set(p.plan_id, { count: 0, amount: 0 });
          }
          const planData = planMap.get(p.plan_id)!;
          planData.count += 1;
          planData.amount += p.amount || 0;
        }
      });

      stats.byPlan = Object.fromEntries(planMap);

      // 按状态统计
      const statusMap = new Map<string, { count: number; amount: number }>();
      validPayments.forEach((p) => {
        const status = p.status || 'unknown';
        if (!statusMap.has(status)) {
          statusMap.set(status, { count: 0, amount: 0 });
        }
        const statusData = statusMap.get(status)!;
        statusData.count += 1;
        statusData.amount += p.amount || 0;
      });

      stats.byStatus = Object.fromEntries(statusMap);

      // 计算成功率
      const successCount = statusMap.get('success')?.count || 0;
      const refundCount = statusMap.get('refunded')?.count || 0;
      stats.summary.successRate =
        stats.totalOrders > 0 ? Number(((successCount / stats.totalOrders) * 100).toFixed(2)) : 0;
      stats.summary.refundRate =
        stats.totalOrders > 0 ? Number(((refundCount / stats.totalOrders) * 100).toFixed(2)) : 0;

      // 每日收入
      const dailyMap = new Map<string, { amount: number; count: number }>();
      validPayments.forEach((p) => {
        const date = new Date(p.created_at).toISOString().split('T')[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { amount: 0, count: 0 });
        }
        const dayData = dailyMap.get(date)!;
        dayData.amount += p.amount || 0;
        dayData.count += 1;
      });

      stats.dailyRevenue = Array.from(dailyMap.entries())
        .map(([date, data]) => ({
          date,
          amount: data.amount,
          count: data.count}))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 找出最高和最低收入日
      if (stats.dailyRevenue.length > 0) {
        stats.summary.highestDay = stats.dailyRevenue.reduce((max, day) =>
          day.amount > max.amount ? day : max
        );
        stats.summary.lowestDay = stats.dailyRevenue.reduce((min, day) =>
          day.amount < min.amount ? day : min
        );
      }

      // 每月收入
      const monthlyMap = new Map<string, { amount: number; count: number }>();
      validPayments.forEach((p) => {
        const date = new Date(p.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { amount: 0, count: 0 });
        }
        const monthData = monthlyMap.get(monthKey)!;
        monthData.amount += p.amount || 0;
        monthData.count += 1;
      });

      stats.monthlyRevenue = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
          month,
          amount: data.amount,
          count: data.count}))
        .sort((a, b) => a.month.localeCompare(b.month));

      // 计算增长率（对比最近两个月）
      if (stats.monthlyRevenue.length >= 2) {
        const lastMonth = stats.monthlyRevenue[stats.monthlyRevenue.length - 1];
        const prevMonth = stats.monthlyRevenue[stats.monthlyRevenue.length - 2];
        if (prevMonth.amount > 0) {
          stats.summary.growthRate = Number(
            (((lastMonth.amount - prevMonth.amount) / prevMonth.amount) * 100).toFixed(2)
          );
        }
      }

      // 顶级用户统计
      const userMap = new Map<number, { amount: number; orderCount: number }>();
      validPayments.forEach((p) => {
        if (p.user_id) {
          if (!userMap.has(p.user_id)) {
            userMap.set(p.user_id, { amount: 0, orderCount: 0 });
          }
          const userData = userMap.get(p.user_id)!;
          userData.amount += p.amount || 0;
          userData.orderCount += 1;
        }
      });

      stats.topUsers = Array.from(userMap.entries())
        .map(([userId, data]) => ({
          userId,
          amount: data.amount,
          orderCount: data.orderCount}))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10); // 取前10名


      return NextResponse.json(stats);
    } catch (error) {
      console.error('[Revenue API] 获取收入统计失败:', error);
      return NextResponse.json({ error: '获取失败' }, { status: 500 });
    }
}

function emptyStats() {
  return {
    totalRevenue: 0, totalOrders: 0, averageOrderValue: 0,
    byPaymentMethod: {}, byPlan: {}, byStatus: {},
    dailyRevenue: [], monthlyRevenue: [], topUsers: [],
    summary: { successRate: 0, refundRate: 0, highestDay: { date: '', amount: 0 }, lowestDay: { date: '', amount: 0 }, growthRate: 0 },
  };
}
