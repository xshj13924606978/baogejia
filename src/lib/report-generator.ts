/**
 * 业务周报/月报生成服务
 * 对话窗: #[20260901-0900] P3-1
 *
 * 数据源（全部真实库表，无 mock）：
 *   users / quotes / payment_records / point_logs /
 *   token_consumption_log / analytics_events
 * 持久化：business_reports 表（迁移 125），按 (report_type, period_start) 幂等 upsert，
 *   同一周期重复执行覆盖更新，不会产生重复报表。
 * 调度：scheduler.ts 注册 cron，开关与计划由 trade_config `scheduler.business_report` 控制。
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export type BusinessReportType = 'weekly' | 'monthly';

export interface BusinessReportResult {
  success: boolean;
  reportType: BusinessReportType;
  periodStart: string;
  periodEnd: string;
  payload?: Record<string, any>;
  error?: string;
  durationMs: number;
}

/** 重入保护（同一进程内同类型任务不并发） */
const runningTypes = new Set<BusinessReportType>();

/**
 * 计算报表统计周期 [start, end)
 *  - weekly:  上周一 00:00 ~ 本周一 00:00
 *  - monthly: 上月 1 日 00:00 ~ 本月 1 日 00:00
 */
export function getReportPeriod(type: BusinessReportType, now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (type === 'weekly') {
    // 周一 = 0（getDay: 周日=0 … 周六=6 → 转换为周一=0）
    const dayIndex = (today.getDay() + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(thisMonday.getDate() - dayIndex);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    return { start: lastMonday, end: thisMonday };
  }

  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start, end };
}

/**
 * 聚合一个周期的业务数据（全部来自数据库真实数据）
 */
async function aggregatePeriod(
  supabase: any,
  startISO: string,
  endISO: string
): Promise<Record<string, any>> {
  const [
    newUsersRes,
    activeUsersRes,
    newQuotesRes,
    paymentsRes,
    pointLogsRes,
    tokenLogsRes,
    analyticsRes,
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true })
      .gte('created_at', startISO).lt('created_at', endISO),
    supabase.from('users').select('*', { count: 'exact', head: true })
      .gte('last_login', startISO).lt('last_login', endISO),
    supabase.from('quotes').select('*', { count: 'exact', head: true })
      .gte('created_at', startISO).lt('created_at', endISO),
    supabase.from('payment_records').select('amount, payment_status')
      .gte('created_at', startISO).lt('created_at', endISO),
    supabase.from('point_logs').select('points')
      .gte('created_at', startISO).lt('created_at', endISO),
    // token_consumption_log 存在 014/039 两套列结构（tokens_used / total_tokens），select('*') 容错
    supabase.from('token_consumption_log').select('*')
      .gte('created_at', startISO).lt('created_at', endISO),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true })
      .gte('created_at', startISO).lt('created_at', endISO),
  ]);

  const payments = paymentsRes.data || [];
  const successPayments = payments.filter((p: any) => (p.payment_status || p.status) === 'success');
  const revenue = successPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const points = pointLogsRes.data || [];
  const pointsIssued = points.filter((l: any) => (l.points || 0) > 0)
    .reduce((sum: number, l: any) => sum + l.points, 0);
  const pointsConsumed = Math.abs(
    points.filter((l: any) => (l.points || 0) < 0)
      .reduce((sum: number, l: any) => sum + l.points, 0)
  );

  const tokenLogs = tokenLogsRes.data || [];
  const tokensUsed = tokenLogs.reduce(
    (sum: number, l: any) => sum + (l.tokens_used ?? l.total_tokens ?? 0),
    0
  );

  return {
    newUsers: newUsersRes.count || 0,
    activeUsers: activeUsersRes.count || 0,
    newQuotes: newQuotesRes.count || 0,
    revenue: Number(revenue.toFixed(2)),
    paidOrders: successPayments.length,
    totalOrders: payments.length,
    averageOrderValue:
      successPayments.length > 0 ? Number((revenue / successPayments.length).toFixed(2)) : 0,
    pointsIssued,
    pointsConsumed,
    aiCalls: tokenLogs.length,
    tokensUsed,
    analyticsEvents: analyticsRes.count || 0,
  };
}

/**
 * 生成并持久化一份业务报表（幂等：同 report_type + period_start 覆盖更新）
 */
export async function generateBusinessReport(
  type: BusinessReportType
): Promise<BusinessReportResult> {
  const startTime = Date.now();
  const { start, end } = getReportPeriod(type);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const supabase = getSupabaseServiceClient();

  try {
    const current = await aggregatePeriod(supabase, startISO, endISO);

    // 上一周期收入（用于环比）
    const prevSpan = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - prevSpan).toISOString();
    const { data: prevPayments } = await supabase
      .from('payment_records')
      .select('amount, payment_status')
      .gte('created_at', prevStart)
      .lt('created_at', startISO);
    const prevRevenue = (prevPayments || [])
      .filter((p: any) => (p.payment_status || p.status) === 'success')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const revenueGrowthRate =
      prevRevenue > 0 ? Number((((current.revenue - prevRevenue) / prevRevenue) * 100).toFixed(2)) : 0;

    const payload: Record<string, any> = {
      ...current,
      prevRevenue: Number(prevRevenue.toFixed(2)),
      revenueGrowthRate,
    };

    const durationMs = Date.now() - startTime;

    const { error: upsertError } = await supabase.from('business_reports').upsert(
      {
        report_type: type,
        period_start: startISO,
        period_end: endISO,
        payload,
        status: 'success',
        error_message: null,
        duration_ms: durationMs,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'report_type,period_start' }
    );

    if (upsertError) {
      throw new Error(`写入 business_reports 失败: ${upsertError.message}`);
    }

    console.log(
      `[ReportGenerator] ${type} 报表生成完成: 区间 ${startISO.slice(0, 10)} ~ ${endISO.slice(0, 10)}, ` +
        `收入 ¥${payload.revenue}, 新增用户 ${payload.newUsers}, 报价 ${payload.newQuotes}, 耗时 ${durationMs}ms`
    );

    return {
      success: true,
      reportType: type,
      periodStart: startISO,
      periodEnd: endISO,
      payload,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;
    console.error(`[ReportGenerator] ${type} 报表生成失败:`, error);

    // 失败也落台账（business_reports 存在时），便于排查
    try {
      await supabase.from('business_reports').upsert(
        {
          report_type: type,
          period_start: startISO,
          period_end: endISO,
          payload: {},
          status: 'failed',
          error_message: message,
          duration_ms: durationMs,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'report_type,period_start' }
      );
    } catch {
      // 台账写入失败不阻断（如迁移 125 未应用）
    }

    return {
      success: false,
      reportType: type,
      periodStart: startISO,
      periodEnd: endISO,
      error: message,
      durationMs,
    };
  }
}

/**
 * 调度入口：带重入保护的业务报表生成
 */
export async function runBusinessReportGeneration(
  type: BusinessReportType
): Promise<BusinessReportResult> {
  if (runningTypes.has(type)) {
    console.log(`[ReportGenerator] ${type} 报表任务正在运行中，跳过本次触发`);
    return {
      success: false,
      reportType: type,
      periodStart: '',
      periodEnd: '',
      error: '任务已在运行',
      durationMs: 0,
    };
  }

  runningTypes.add(type);
  try {
    return await generateBusinessReport(type);
  } finally {
    runningTypes.delete(type);
  }
}
