import { useEffect, useCallback, useRef } from 'react';
import { EventType } from '@/lib/analytics';

/**
 * useAnalytics Hook
 *
 * 用于在 React 组件中追踪用户行为
 */

export interface UseAnalyticsOptions {
  userId?: number;
  autoTrackPageView?: boolean;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const { userId, autoTrackPageView = true } = options;
  const currentPathRef = useRef<string>('');
  const sessionStartTimeRef = useRef<Date>(new Date());

  /**
   * 发送事件到服务器
   */
  const trackEvent = useCallback(
    async (eventType: EventType, properties?: Record<string, any>, page?: string) => {
      if (!userId) {
        console.warn('[Analytics] 未提供用户ID，跳过事件追踪');
        return;
      }

      try {
        await fetch('/api/analytics/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            eventType,
            page: page || window.location.pathname,
            properties,
          }),
        });
      } catch (error) {
        console.error('[Analytics] 发送事件失败:', error);
      }
    },
    [userId]
  );

  /**
   * 追踪页面访问
   */
  const trackPageView = useCallback(
    (page?: string) => {
      const currentPage = page || window.location.pathname;

      // 避免重复追踪同一页面
      if (currentPage === currentPathRef.current) {
        return;
      }

      currentPathRef.current = currentPage;
      trackEvent(EventType.PAGE_VIEW, { path: currentPage }, currentPage);
    },
    [trackEvent]
  );

  /**
   * 追踪按钮点击
   */
  const trackButtonClick = useCallback(
    (buttonName: string, properties?: Record<string, any>) => {
      trackEvent(EventType.BUTTON_CLICK, {
        buttonName,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪表单提交
   */
  const trackFormSubmit = useCallback(
    (formName: string, properties?: Record<string, any>) => {
      trackEvent(EventType.FORM_SUBMIT, {
        formName,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪文件上传
   */
  const trackFileUpload = useCallback(
    (fileName: string, fileSize: number, properties?: Record<string, any>) => {
      trackEvent(EventType.FILE_UPLOAD, {
        fileName,
        fileSize,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪报价生成
   */
  const trackQuoteGenerated = useCallback(
    (quoteId: string, productCount: number, properties?: Record<string, any>) => {
      trackEvent(EventType.QUOTE_GENERATED, {
        quoteId,
        productCount,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪产品搜索
   */
  const trackProductSearch = useCallback(
    (query: string, resultsCount: number, properties?: Record<string, any>) => {
      trackEvent(EventType.PRODUCT_SEARCH, {
        query,
        resultsCount,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪价格咨询
   */
  const trackPriceInquiry = useCallback(
    (productName: string, properties?: Record<string, any>) => {
      trackEvent(EventType.PRICE_INQUIRY, {
        productName,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪邀请发送
   */
  const trackInviteSent = useCallback(
    (inviteeEmail: string, properties?: Record<string, any>) => {
      trackEvent(EventType.INVITE_SENT, {
        inviteeEmail,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪积分赚取
   */
  const trackPointsEarned = useCallback(
    (points: number, reason: string, properties?: Record<string, any>) => {
      trackEvent(EventType.POINTS_EARNED, {
        points,
        reason,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 追踪积分消费
   */
  const trackPointsSpent = useCallback(
    (points: number, reason: string, properties?: Record<string, any>) => {
      trackEvent(EventType.POINTS_SPENT, {
        points,
        reason,
        ...properties,
      });
    },
    [trackEvent]
  );

  /**
   * 自动追踪页面访问
   */
  useEffect(() => {
    if (autoTrackPageView && userId) {
      // 初始页面访问
      trackPageView();

      // 监听路由变化
      const handleRouteChange = () => {
        trackPageView();
      };

      // 使用 history API 监听路由变化
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function (...args) {
        originalPushState.apply(history, args);
        handleRouteChange();
      };

      history.replaceState = function (...args) {
        originalReplaceState.apply(history, args);
        handleRouteChange();
      };

      window.addEventListener('popstate', handleRouteChange);

      return () => {
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', handleRouteChange);
      };
    }
  }, [autoTrackPageView, userId, trackPageView]);

  /**
   * 页面卸载时追踪会话时长
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionDuration = Date.now() - sessionStartTimeRef.current.getTime();
      // 这里可以发送会话时长事件
      console.log('[Analytics] 会话时长:', sessionDuration, 'ms');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return {
    trackEvent,
    trackPageView,
    trackButtonClick,
    trackFormSubmit,
    trackFileUpload,
    trackQuoteGenerated,
    trackProductSearch,
    trackPriceInquiry,
    trackInviteSent,
    trackPointsEarned,
    trackPointsSpent,
  };
}

export default useAnalytics;
