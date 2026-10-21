import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireReportView } from '@/lib/permission-gate';

const METHOD_LABELS: Record<string, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  bank: '银行卡',
  unknown: '其他',
};

/**
 * 收入统计API（管理员 / 持有 report_view 权限的用户，#20260901-0900 P2-2）
 *
 * GET: 获取收入统计数据
 *   start/end    日期过滤（可选）
 *   page/pageSize 明细分页（#20260901-0900 P3-3；pageSize 缺省/0 = 全量，兼容旧前端）
 */

export async function GET(request: NextRequest) {
  try {
    const gate = await requireReportView(request);
    if (gate.errorResponse) return gate.errorResponse;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(500, Math.max(0, parseInt(searchParams.get('pageSize') || '0', 10) || 0));

    const supabase = getSupabaseServiceClient();

    // 获取支付记录（兼容 payment_status 字段名）
    let query = supabase
      .from('payment_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: payments, error: paymentsError } = await query;

    if (paymentsError) {
      console.error('[Revenue API] 查询失败:', paymentsError);
      return NextResponse.json(emptyStats());
    }

    const stats = {
      totalRevenue: 0,
      totalOrders: payments?.length || 0,
      averageOrderValue: 0,
      byPaymentMethod: {} as Record<string, { count: number; amount: number }>,
      byPlan: {} as Record<string, { count: number; amount: number }>,
      byStatus: {} as Record<string, { count: number; amount: number }>,
      records: [] as Array<{
        date: string;
        amount: number;
        type: 'upgrade' | 'points' | 'subscription';
        description: string;
      }>,
      dailyRevenue: [] as Array<{ date: string; amount: number; count: number }>,
      monthlyRevenue: [] as Array<{ month: string; amount: number; count: number }>,
      topUsers: [] as Array<{ userId: string; amount: number; orderCount: number }>,
      summary: {
        successRate: 0,
        refundRate: 0,
        highestDay: { date: '', amount: 0 },
        lowestDay: { date: '', amount: Infinity },
        growthRate: 0,
      },
    };

    const validPayments = payments || [];
    const successPayments = validPayments.filter(
      (p) => (p.payment_status || p.status) === 'success'
    );

    // 核心指标：只统计成功支付
    stats.totalOrders = successPayments.length;
    const totalAmount = successPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    stats.totalRevenue = totalAmount;
    stats.averageOrderValue =
      stats.totalOrders > 0 ? Number((totalAmount / stats.totalOrders).toFixed(2)) : 0;

    // 按支付方式统计（成功支付）
    const methodMap = new Map<string, { count: number; amount: number }>();
    successPayments.forEach((p) => {
      const method = p.payment_method || 'unknown';
      if (!methodMap.has(method)) {
        methodMap.set(method, { count: 0, amount: 0 });
      }
      const methodData = methodMap.get(method)!;
      methodData.count += 1;
      methodData.amount += p.amount || 0;
    });
    stats.byPaymentMethod = Object.fromEntries(methodMap);

    // 按套餐统计（兼容 level_upgraded_to / plan_days 字段）
    const planMap = new Map<string, { count: number; amount: number }>();
    validPayments.forEach((p) => {
      const planKey = p.plan_id
        ? String(p.plan_id)
        : p.level_upgraded_to
          ? `L${p.level_upgraded_to}`
          : null;
      if (planKey) {
        if (!planMap.has(planKey)) {
          planMap.set(planKey, { count: 0, amount: 0 });
        }
        const planData = planMap.get(planKey)!;
        planData.count += 1;
        planData.amount += p.amount || 0;
      }
    });
    stats.byPlan = Object.fromEntries(planMap);

    // 按状态统计（字段名：payment_status）
    const statusMap = new Map<string, { count: number; amount: number }>();
    validPayments.forEach((p) => {
      const status = p.payment_status || p.status || 'unknown';
      if (!statusMap.has(status)) {
        statusMap.set(status, { count: 0, amount: 0 });
      }
      const statusData = statusMap.get(status)!;
      statusData.count += 1;
      statusData.amount += p.amount || 0;
    });
    stats.byStatus = Object.fromEntries(statusMap);

    // 计算成功率和退款率（分母为全部订单数）
    const successCount = statusMap.get('success')?.count || 0;
    const refundCount = statusMap.get('refunded')?.count || 0;
    const allOrderCount = validPayments.length;
    stats.summary.successRate =
      allOrderCount > 0 ? Number(((successCount / allOrderCount) * 100).toFixed(2)) : 0;
    stats.summary.refundRate =
      allOrderCount > 0 ? Number(((refundCount / allOrderCount) * 100).toFixed(2)) : 0;

    // 每日收入：只统计成功支付（趋势图展示真实收入）
    const dailyMap = new Map<string, { amount: number; count: number }>();
    successPayments.forEach((p) => {
      const rawDate = p.paid_at || p.created_at;
      if (!rawDate) return;
      const date = new Date(rawDate).toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { amount: 0, count: 0 });
      }
      const dayData = dailyMap.get(date)!;
      dayData.amount += p.amount || 0;
      dayData.count += 1;
    });
    stats.dailyRevenue = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, amount: data.amount, count: data.count }))
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

    // 每月收入：只统计成功支付
    const monthlyMap = new Map<string, { amount: number; count: number }>();
    successPayments.forEach((p) => {
      const rawDate = p.paid_at || p.created_at;
      if (!rawDate) return;
      const date = new Date(rawDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { amount: 0, count: 0 });
      }
      const monthData = monthlyMap.get(monthKey)!;
      monthData.amount += p.amount || 0;
      monthData.count += 1;
    });
    stats.monthlyRevenue = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, amount: data.amount, count: data.count }))
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

    // 顶级用户统计：只统计成功支付
    const userMap = new Map<string, { amount: number; orderCount: number }>();
    successPayments.forEach((p) => {
      if (p.user_id) {
        const uid = String(p.user_id);
        if (!userMap.has(uid)) {
          userMap.set(uid, { amount: 0, orderCount: 0 });
        }
        const userData = userMap.get(uid)!;
        userData.amount += p.amount || 0;
        userData.orderCount += 1;
      }
    });
    stats.topUsers = Array.from(userMap.entries())
      .map(([userId, data]) => ({ userId, amount: data.amount, orderCount: data.orderCount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // 支付记录明细（最新在前，供收入记录表格展示）
    stats.records = validPayments.map((p) => {
      const method = p.payment_method || 'unknown';
      const methodLabel = METHOD_LABELS[method] || method;
      const type = p.level_upgraded_to
        ? 'upgrade'
        : p.plan_days
          ? 'subscription'
          : 'points';
      return {
        date: (p.paid_at || p.created_at || '').slice(0, 10),
        amount: Number(p.amount || 0),
        type,
        description: `${p.order_no ? `订单 ${p.order_no}` : '支付订单'} · ${methodLabel}`,
      };
    });

    // 明细分页（P3-3）：汇总指标始终基于全量数据计算，仅 records 列表按页返回
    const totalRecords = stats.records.length;
    if (pageSize > 0) {
      const offset = (page - 1) * pageSize;
      stats.records = stats.records.slice(offset, offset + pageSize);
    }

    return NextResponse.json({
      ...stats,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1,
      },
    });
  } catch (error) {
    console.error('[Revenue API] 获取收入统计失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

function emptyStats() {
  return {
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    byPaymentMethod: {},
    byPlan: {},
    byStatus: {},
    records: [],
    dailyRevenue: [],
    monthlyRevenue: [],
    topUsers: [],
    summary: {
      successRate: 0,
      refundRate: 0,
      highestDay: { date: '', amount: 0 },
      lowestDay: { date: '', amount: Infinity },
      growthRate: 0,
    },
  };
}
