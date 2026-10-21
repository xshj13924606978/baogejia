/**
 * Analytics 枚举与类型（客户端兼容）
 *
 * 修复 #[20260825-0930] - 服务端实现已迁移到 analytics-server.ts
 * 本文件只导出 enum / type / interface，纯客户端可安全 import，
 * 不会导致客户端 bundle 拉入 @supabase/supabase-js / service_role 密钥。
 */

export enum EventType {
  PAGE_VIEW = 'page_view',
  BUTTON_CLICK = 'button_click',
  FORM_SUBMIT = 'form_submit',
  FILE_UPLOAD = 'file_upload',
  QUOTE_GENERATED = 'quote_generated',
  PRODUCT_SEARCH = 'product_search',
  PRICE_INQUIRY = 'price_inquiry',
  INVITE_SENT = 'invite_sent',
  POINTS_EARNED = 'points_earned',
  POINTS_SPENT = 'points_spent',
  PAYMENT_COMPLETED = 'payment_completed',
}

export enum FunnelStep {
  VISIT = 'visit',
  SIGN_UP = 'register',
  UPLOAD = 'upload',
  QUOTE = 'quote',
  PAYMENT = 'payment',
}

export interface AnalyticsEvent {
  id?: string;
  userId?: string | null;
  eventType: string;
  funnelStage?: string | null;
  sessionId?: string | null;
  page?: string | null;
  durationSeconds?: number | null;
  properties?: Record<string, any>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string;
}

export interface AnalyticsStats {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  totalRevenue: number;
  conversionRate: number;
}

export interface FunnelDataPoint {
  step: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
}

export interface RetentionDataPoint {
  date: string;
  day0: number;
  day1: number;
  day7: number;
  day30: number;
  retentionRate1: number;
  retentionRate7: number;
  retentionRate30: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
}

export interface RevenueSummary {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
}

export interface BehaviorMetrics {
  pageViews: number;
  buttonClicks: number;
  fileUploads: number;
  quoteGenerated: number;
  paymentCompleted: number;
  averageSessionSeconds: number;
  bounceRate: number;
  dailyActiveRate: number;
  pageDistribution: Array<{ page: string; count: number }>;
  eventTypeDistribution: Array<{ eventType: string; count: number }>;
}

export interface AnalyticsQueryRange {
  startDate?: Date | null;
  endDate?: Date | null;
  days?: number | null;
}

/** 抽象接口（无服务端依赖） */
export interface AnalyticsServiceContract {
  trackEvent(event: AnalyticsEvent): Promise<void>;
  getStats(range?: AnalyticsQueryRange): Promise<AnalyticsStats>;
  getFunnel(range?: AnalyticsQueryRange): Promise<FunnelDataPoint[]>;
  getRetention(days?: number, limit?: number): Promise<RetentionDataPoint[]>;
  getRevenue(range?: AnalyticsQueryRange): Promise<{
    revenue: RevenueDataPoint[];
    summary: RevenueSummary;
  }>;
  getEvents(opts: {
    range?: AnalyticsQueryRange;
    eventType?: string;
    page?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: AnalyticsEvent[]; total: number }>;
  getBehaviorMetrics(range?: AnalyticsQueryRange): Promise<BehaviorMetrics>;
  getEventsByIds(ids: string[]): Promise<AnalyticsEvent[]>;
  deleteEventsByIds(ids: string[]): Promise<number>;
}
