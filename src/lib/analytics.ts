/**
 * 数据分析服务端实现（修复 #[20260825-0930]）
 *
 * - 本文件只供 API route 使用（服务端），不导出到客户端 bundle
 * - 客户端 import 枚举类型请使用 @/lib/analytics-types
 * - 历史兼容：本文件依然 re-export 所有枚举与类型，所以 `import { FunnelStep } from '@/lib/analytics'`
 *   与 `import { FunnelStep } from '@/lib/analytics-types'` 等价
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import type {
  AnalyticsEvent,
  AnalyticsStats,
  FunnelDataPoint,
  RetentionDataPoint,
  RevenueDataPoint,
  RevenueSummary,
  AnalyticsQueryRange,
  BehaviorMetrics,
} from './analytics-types';
import { FunnelStep } from './analytics-types';

// === 兼容：枚举 / 类型从 types 重新导出 ===
export {
  EventType,
  FunnelStep,
  type AnalyticsEvent,
  type AnalyticsStats,
  type FunnelDataPoint,
  type RetentionDataPoint,
  type RevenueDataPoint,
  type RevenueSummary,
  type BehaviorMetrics,
  type AnalyticsQueryRange,
  type AnalyticsServiceContract as AnalyticsService,
} from './analytics-types';

// === 工具函数：日期范围 ===
function resolveRange(range?: AnalyticsQueryRange): { start: Date; end: Date } {
  const end = range?.endDate ?? new Date();
  let start: Date;
  if (range?.startDate) {
    start = range.startDate;
  } else if (range?.days !== undefined && range?.days !== null && range.days > 0) {
    start = new Date(end.getTime() - range.days * 24 * 60 * 60 * 1000);
  } else if (range?.days !== undefined && range?.days !== null && range.days < 0) {
    start = new Date('2020-01-01');
  } else {
    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

function dateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// === Supabase Service Role 客户端 ===
function getServiceClient(): SupabaseClient {
  try {
    return getSupabaseServiceClient();
  } catch {
    const url =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.COZE_SUPABASE_URL ||
      '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      throw new Error(
        '[analytics] Supabase service_role 未配置：缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'
      );
    }
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}

// ============================================================
// AnalyticsService 数据库实现
// ============================================================
export class DbAnalyticsService {
  private readonly sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? getServiceClient();
  }

  async trackEvent(event: AnalyticsEvent): Promise<void> {
    const row = {
      user_id: event.userId ?? null,
      event_type: event.eventType,
      funnel_stage: event.funnelStage ?? null,
      session_id: event.sessionId ?? null,
      page: event.page ?? null,
      duration_seconds: event.durationSeconds ?? null,
      properties: event.properties ?? {},
      user_agent: event.userAgent ?? null,
    };
    const { error } = await this.sb.from('analytics_events').insert(row);
    if (error) {
      throw new Error(`[analytics] trackEvent failed: ${error.message}`);
    }
  }

  async getStats(range?: AnalyticsQueryRange): Promise<AnalyticsStats> {
    const { start, end } = resolveRange(range);

    const [
      totalUsersRes,
      activeUsersRes,
      newUsersRes,
      revenueRes,
      visitRes,
      paymentRes,
    ] = await Promise.all([
      this.sb
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      this.sb
        .from('analytics_events')
        .select('user_id')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .not('user_id', 'is', null)
        .limit(20000),
      this.sb
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString()),
      this.sb
        .from('payment_records')
        .select('amount')
        .eq('payment_status', 'success')
        .gte('paid_at', start.toISOString())
        .lte('paid_at', end.toISOString()),
      // 漏斗口径：visit 阶段去重用户（转化率基数，与漏斗图完全一致）
      this.sb
        .from('analytics_events')
        .select('user_id')
        .eq('funnel_stage', 'visit')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .not('user_id', 'is', null)
        .limit(20000),
      // 漏斗口径：payment 阶段去重用户
      this.sb
        .from('analytics_events')
        .select('user_id')
        .eq('funnel_stage', 'payment')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .not('user_id', 'is', null)
        .limit(20000),
    ]);

    const totalUsers = totalUsersRes.count ?? 0;
    const activeSet = new Set<string>();
    for (const row of activeUsersRes.data ?? []) {
      if (row.user_id) activeSet.add(row.user_id);
    }
    const activeUsers = activeSet.size;
    const newUsers = newUsersRes.count ?? 0;

    const totalRevenue = (revenueRes.data ?? []).reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );

    const visitSet = new Set<string>();
    for (const row of visitRes.data ?? []) {
      if (row.user_id) visitSet.add(row.user_id);
    }
    const paymentSet = new Set<string>();
    for (const row of paymentRes.data ?? []) {
      if (row.user_id) paymentSet.add(row.user_id);
    }
    const conversionRate =
      visitSet.size > 0 ? (paymentSet.size / visitSet.size) * 100 : 0;

    return {
      totalUsers,
      activeUsers,
      newUsers,
      totalRevenue,
      conversionRate,
    };
  }

  async getFunnel(range?: AnalyticsQueryRange): Promise<FunnelDataPoint[]> {
    const { start, end } = resolveRange(range);

    // 注：PostgREST 默认最多返回 1000 行，必须显式给大 limit，否则"全部"周期数据会被截断
    const { data, error } = await this.sb
      .from('analytics_events')
      .select('funnel_stage, user_id')
      .not('funnel_stage', 'is', null)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .not('user_id', 'is', null)
      .limit(20000);

    if (error) {
      throw new Error(`[analytics] getFunnel failed: ${error.message}`);
    }

    const stageSet: Record<string, Set<string>> = {};
    for (const row of data ?? []) {
      const stage = row.funnel_stage as string;
      const uid = row.user_id as string;
      if (!stage) continue;
      if (!stageSet[stage]) stageSet[stage] = new Set();
      stageSet[stage].add(uid);
    }

    const order = [
      FunnelStep.VISIT,
      FunnelStep.SIGN_UP,
      FunnelStep.UPLOAD,
      FunnelStep.QUOTE,
      FunnelStep.PAYMENT,
    ];

    const counts = order.map((s) => stageSet[s]?.size ?? 0);
    const baseCount = counts[0] || 0;
    const result: FunnelDataPoint[] = [];
    let prevCount = 0;
    for (let i = 0; i < order.length; i++) {
      const step = order[i];
      const count = counts[i];
      const conversionRate = baseCount > 0 ? (count / baseCount) * 100 : 0;
      const dropOffRate =
        i === 0
          ? 0
          : prevCount > 0
          ? Math.max(0, ((prevCount - count) / prevCount) * 100)
          : 0;
      result.push({ step, count, conversionRate, dropOffRate });
      prevCount = count;
    }
    return result;
  }

  async getRetention(
    days: number = 30,
    limit: number = 30
  ): Promise<RetentionDataPoint[]> {
    const end = new Date();
    const range = Math.min(Math.max(days, 1), 90);
    const start = new Date(end.getTime() - range * 24 * 60 * 60 * 1000);

    // 注：PostgREST 默认最多返回 1000 行，必须显式给大 limit，否则短周期内数据会被截断
    const { data: registrations } = await this.sb
      .from('analytics_events')
      .select('user_id, created_at')
      .eq('event_type', 'page_view')
      .not('user_id', 'is', null)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .limit(20000);

    const bucket: Map<string, { day0: Set<string> }> = new Map();
    for (const row of registrations ?? []) {
      const day = dateKey(row.created_at);
      const uid = row.user_id as string;
      if (!bucket.has(day)) {
        bucket.set(day, { day0: new Set() });
      }
      const b = bucket.get(day)!;
      b.day0.add(uid);
    }

    const { data: allEvents } = await this.sb
      .from('analytics_events')
      .select('user_id, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .not('user_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(20000);

    const userDayMap: Map<string, Set<string>> = new Map();
    for (const row of allEvents ?? []) {
      const uid = row.user_id as string;
      const day = dateKey(row.created_at);
      if (!userDayMap.has(uid)) userDayMap.set(uid, new Set());
      userDayMap.get(uid)!.add(day);
    }

    const result: RetentionDataPoint[] = [];
    const sortedDays = Array.from(bucket.keys()).sort();
    for (const day of sortedDays) {
      const b = bucket.get(day)!;
      const day0Count = b.day0.size;
      let day1Count = 0;
      let day7Count = 0;
      let day30Count = 0;
      const d = new Date(day + 'T00:00:00Z').getTime();
      for (const uid of b.day0) {
        const userDays = userDayMap.get(uid);
        if (!userDays) continue;
        const has1 = Array.from(userDays).some(
          (x) =>
            new Date(x + 'T00:00:00Z').getTime() - d >= 24 * 60 * 60 * 1000 &&
            new Date(x + 'T00:00:00Z').getTime() - d < 2 * 24 * 60 * 60 * 1000
        );
        const has7 = Array.from(userDays).some(
          (x) =>
            new Date(x + 'T00:00:00Z').getTime() - d >= 6 * 24 * 60 * 60 * 1000 &&
            new Date(x + 'T00:00:00Z').getTime() - d < 8 * 24 * 60 * 60 * 1000
        );
        const has30 = Array.from(userDays).some(
          (x) =>
            new Date(x + 'T00:00:00Z').getTime() - d >= 28 * 24 * 60 * 60 * 1000 &&
            new Date(x + 'T00:00:00Z').getTime() - d < 32 * 24 * 60 * 60 * 1000
        );
        if (has1) day1Count++;
        if (has7) day7Count++;
        if (has30) day30Count++;
      }
      result.push({
        date: day,
        day0: day0Count,
        day1: day1Count,
        day7: day7Count,
        day30: day30Count,
        retentionRate1: day0Count > 0 ? (day1Count / day0Count) * 100 : 0,
        retentionRate7: day0Count > 0 ? (day7Count / day0Count) * 100 : 0,
        retentionRate30: day0Count > 0 ? (day30Count / day0Count) * 100 : 0,
      });
    }
    return result;
  }

  async getRevenue(range?: AnalyticsQueryRange): Promise<{
    revenue: RevenueDataPoint[];
    summary: RevenueSummary;
  }> {
    const { start, end } = resolveRange(range);

    const { data, error } = await this.sb
      .from('payment_records')
      .select('amount, paid_at, user_id')
      .eq('payment_status', 'success')
      .gte('paid_at', start.toISOString())
      .lte('paid_at', end.toISOString())
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: true })
      .limit(20000);

    if (error) {
      throw new Error(`[analytics] getRevenue failed: ${error.message}`);
    }

    const userFirstPay = new Map<string, string>();
    for (const row of (data ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()
      )) {
      const uid = (row.user_id ?? '') as string;
      const day = dateKey(row.paid_at);
      if (uid && !userFirstPay.has(uid)) {
        userFirstPay.set(uid, day);
      }
    }

    const dayMap = new Map<
      string,
      {
        revenue: number;
        orderCount: number;
        newCustomerRevenue: number;
        returningCustomerRevenue: number;
      }
    >();

    for (const row of data ?? []) {
      const day = dateKey(row.paid_at);
      const amount = Number(row.amount || 0);
      const uid = (row.user_id ?? '') as string;
      const isNew = uid !== '' && userFirstPay.get(uid) === day;
      if (!dayMap.has(day)) {
        dayMap.set(day, {
          revenue: 0,
          orderCount: 0,
          newCustomerRevenue: 0,
          returningCustomerRevenue: 0,
        });
      }
      const d = dayMap.get(day)!;
      d.revenue += amount;
      d.orderCount += 1;
      if (isNew) {
        d.newCustomerRevenue += amount;
      } else {
        d.returningCustomerRevenue += amount;
      }
    }

    const revenue: RevenueDataPoint[] = Array.from(dayMap.entries())
      .map(([date, d]) => ({
        date,
        revenue: d.revenue,
        orderCount: d.orderCount,
        averageOrderValue: d.orderCount > 0 ? d.revenue / d.orderCount : 0,
        newCustomerRevenue: d.newCustomerRevenue,
        returningCustomerRevenue: d.returningCustomerRevenue,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const totalRevenue = revenue.reduce((s, r) => s + r.revenue, 0);
    const totalOrders = revenue.reduce((s, r) => s + r.orderCount, 0);
    const newCustomerRevenue = revenue.reduce(
      (s, r) => s + r.newCustomerRevenue,
      0
    );
    const returningCustomerRevenue = revenue.reduce(
      (s, r) => s + r.returningCustomerRevenue,
      0
    );

    const summary: RevenueSummary = {
      totalRevenue,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      newCustomerRevenue,
      returningCustomerRevenue,
    };

    return { revenue, summary };
  }

  async getEvents(opts: {
    range?: AnalyticsQueryRange;
    eventType?: string;
    page?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: AnalyticsEvent[]; total: number }> {
    const { start, end } = resolveRange(opts.range);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);

    let q = this.sb
      .from('analytics_events')
      .select('*', { count: 'exact' })
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (opts.eventType) q = q.eq('event_type', opts.eventType);
    if (opts.page) q = q.eq('page', opts.page);

    const { data, count, error } = await q.range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`[analytics] getEvents failed: ${error.message}`);
    }

    let events: AnalyticsEvent[] = (data ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      funnelStage: row.funnel_stage,
      sessionId: row.session_id,
      page: row.page,
      durationSeconds: row.duration_seconds,
      properties: row.properties ?? {},
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));

    if (opts.search) {
      const needle = opts.search.toLowerCase();
      events = events.filter(
        (e) =>
          (e.eventType || '').toLowerCase().includes(needle) ||
          (e.page || '').toLowerCase().includes(needle) ||
          (e.userId || '').toLowerCase().includes(needle) ||
          (e.sessionId || '').toLowerCase().includes(needle)
      );
    }

    return { events, total: count ?? events.length };
  }

  async getBehaviorMetrics(
    range?: AnalyticsQueryRange
  ): Promise<BehaviorMetrics> {
    const { start, end } = resolveRange(range);

    // 注：PostgREST 默认最多返回 1000 行，必须显式给大 limit，否则数据会被截断
    const { data: typeRows } = await this.sb
      .from('analytics_events')
      .select('event_type, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .limit(20000);

    const { data: pageRows } = await this.sb
      .from('analytics_events')
      .select('page')
      .not('page', 'is', null)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .limit(20000);

    const { data: durRows } = await this.sb
      .from('analytics_events')
      .select('duration_seconds, user_id, session_id')
      .not('duration_seconds', 'is', null)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .limit(20000);

    const typeCount: Record<string, number> = {};
    for (const r of typeRows ?? []) {
      typeCount[r.event_type] = (typeCount[r.event_type] ?? 0) + 1;
    }

    const pageCount: Record<string, number> = {};
    for (const r of pageRows ?? []) {
      pageCount[r.page] = (pageCount[r.page] ?? 0) + 1;
    }

    let sessionDurationSum = 0;
    let sessionCount = 0;
    const sessionDurations = new Map<string, number[]>();
    for (const r of durRows ?? []) {
      const sid =
        (r.session_id ?? `single-${r.user_id}-${Math.random()}`) as string;
      if (!sessionDurations.has(sid)) sessionDurations.set(sid, []);
      sessionDurations.get(sid)!.push(r.duration_seconds ?? 0);
    }
    for (const arr of sessionDurations.values()) {
      if (arr.length === 0) continue;
      const sum = arr.reduce((a, b) => a + b, 0);
      sessionDurationSum += sum;
      sessionCount += 1;
    }
    const averageSessionSeconds =
      sessionCount > 0 ? sessionDurationSum / sessionCount : 0;

    const singleEventSessions = Array.from(sessionDurations.values()).filter(
      (v) => v.length === 1
    ).length;
    const bounceRate =
      sessionCount > 0
        ? Math.min(100, (singleEventSessions / sessionCount) * 100)
        : 0;

    const dayCountMap = new Set<string>();
    for (const r of typeRows ?? []) {
      if (r.event_type === 'page_view') {
        if (r.created_at) dayCountMap.add(dateKey(r.created_at));
      }
    }
    const days = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    );
    const dailyActiveRate = Math.min(100, (dayCountMap.size / days) * 100);

    const eventTypeDistribution = Object.entries(typeCount)
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const pageDistribution = Object.entries(pageCount)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      pageViews: typeCount['page_view'] ?? 0,
      buttonClicks: typeCount['button_click'] ?? 0,
      fileUploads: typeCount['file_upload'] ?? 0,
      quoteGenerated: typeCount['quote_generated'] ?? 0,
      paymentCompleted: typeCount['payment_completed'] ?? 0,
      averageSessionSeconds,
      bounceRate,
      dailyActiveRate,
      pageDistribution,
      eventTypeDistribution,
    };
  }

  async getEventsByIds(ids: string[]): Promise<AnalyticsEvent[]> {
    if (!ids.length) return [];
    const { data, error } = await this.sb
      .from('analytics_events')
      .select('*')
      .in('id', ids);
    if (error) {
      throw new Error(`[analytics] getEventsByIds failed: ${error.message}`);
    }
    return (data ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      funnelStage: row.funnel_stage,
      sessionId: row.session_id,
      page: row.page,
      durationSeconds: row.duration_seconds,
      properties: row.properties ?? {},
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));
  }

  async deleteEventsByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const { data, error } = await this.sb
      .from('analytics_events')
      .delete()
      .in('id', ids)
      .select('id');
    if (error) {
      throw new Error(
        `[analytics] deleteEventsByIds failed: ${error.message}`
      );
    }
    return data?.length ?? 0;
  }
}

// ============================================================
// 工厂方法（兼容旧名 analyticsService）
// ============================================================
export function createAnalyticsService(): DbAnalyticsService {
  return new DbAnalyticsService();
}

/**
 * 向后兼容：旧模块 export 的 `analyticsService` 单例。
 * 老代码如有 `analyticsService.trackEvent(...)` 仍可工作，但实际走数据库。
 */
export const analyticsService = new DbAnalyticsService();
