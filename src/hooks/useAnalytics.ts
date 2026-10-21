/**
 * 前端 Analytics Hook（修复 #[20260825-0930]）
 *
 * - 自动追踪页面 page_view（变化时上报）
 * - 暴露 trackEvent / trackButtonClick / trackFileUpload / trackQuoteGenerated / trackPaymentCompleted
 * - 通过 POST /api/analytics/events 写到数据库（service_role 写入，无 RLS 风险）
 * - 失败静默吞掉，不阻塞业务
 * - 仅依赖 @/lib/analytics-types 中的枚举（客户端安全，不含 supabase-js）
 */

import { useEffect, useCallback, useRef } from 'react';

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

interface TrackEventOpts {
  eventType: string | EventType;
  funnelStage?: string | null;
  page?: string | null;
  durationSeconds?: number;
  properties?: Record<string, any>;
  userId?: string | null;
}

interface UseAnalyticsOpts {
  userId?: string | null;
  sessionId?: string | null;
  autoTrackPageView?: boolean;
}

export function useAnalytics(opts?: UseAnalyticsOpts) {
  const sessionRef = useRef<string>(
    opts?.sessionId ||
      (typeof window !== 'undefined'
        ? `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        : '')
  );

  const lastPathRef = useRef<string>('');

  // 自动追踪 page_view（pathname 变化触发）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (opts?.autoTrackPageView === false) return;

    const path = window.location.pathname;
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    trackEvent({
      eventType: EventType.PAGE_VIEW,
      page: path,
      durationSeconds: 0,
      userId: opts?.userId ?? null,
      properties: {
        referrer:
          typeof document !== 'undefined' ? document.referrer || '' : '',
      },
    });
  }, [typeof window !== 'undefined' ? window.location.pathname : '']);

  const trackEvent = useCallback(
    async (payload: TrackEventOpts): Promise<void> => {
      try {
        if (!payload?.eventType) return;
        await fetch('/api/analytics/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: payload.userId ?? opts?.userId ?? null,
            eventType: payload.eventType,
            funnelStage: payload.funnelStage ?? null,
            sessionId: sessionRef.current || null,
            page:
              payload.page ??
              (typeof window !== 'undefined'
                ? window.location.pathname
                : null),
            durationSeconds: payload.durationSeconds ?? null,
            properties: payload.properties ?? {},
            userAgent:
              typeof navigator !== 'undefined' ? navigator.userAgent : null,
          }),
          keepalive: true,
        });
      } catch {
        // 静默吞掉：客户端监控不应影响业务
      }
    },
    [opts?.userId]
  );

  const trackPageView = useCallback(
    (page?: string) =>
      trackEvent({ eventType: EventType.PAGE_VIEW, page }),
    [trackEvent]
  );

  const trackButtonClick = useCallback(
    (buttonName?: string, extra?: Record<string, any>) =>
      trackEvent({
        eventType: EventType.BUTTON_CLICK,
        properties: { buttonName, ...(extra ?? {}) },
      }),
    [trackEvent]
  );

  const trackFileUpload = useCallback(
    (fileName?: string, extra?: Record<string, any>) =>
      trackEvent({
        eventType: EventType.FILE_UPLOAD,
        page: '/upload',
        properties: { fileName, ...(extra ?? {}) },
      }),
    [trackEvent]
  );

  const trackQuoteGenerated = useCallback(
    (productName?: string, extra?: Record<string, any>) =>
      trackEvent({
        eventType: EventType.QUOTE_GENERATED,
        funnelStage: 'quote',
        properties: { productName, ...(extra ?? {}) },
      }),
    [trackEvent]
  );

  const trackPaymentCompleted = useCallback(
    (amount?: number, extra?: Record<string, any>) =>
      trackEvent({
        eventType: EventType.PAYMENT_COMPLETED,
        funnelStage: 'payment',
        properties: { amount, ...(extra ?? {}) },
      }),
    [trackEvent]
  );

  return {
    sessionId: sessionRef.current,
    trackEvent,
    trackPageView,
    trackButtonClick,
    trackFileUpload,
    trackQuoteGenerated,
    trackPaymentCompleted,
    EventType,
  };
}
