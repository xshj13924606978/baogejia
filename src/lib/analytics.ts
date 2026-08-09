/**
 * 数据分析库
 *
 * 提供用户行为追踪、转化漏斗分析、留存分析和收入统计功能
 */

/**
 * 事件类型定义
 */
export enum EventType {
  // 页面访问
  PAGE_VIEW = 'page_view',
  // 用户行为
  BUTTON_CLICK = 'button_click',
  FORM_SUBMIT = 'form_submit',
  FILE_UPLOAD = 'file_upload',
  QUOTE_GENERATED = 'quote_generated',
  // 转化相关
  SIGN_UP = 'sign_up',
  FIRST_QUOTE = 'first_quote',
  FIRST_PAYMENT = 'first_payment',
  // 业务相关
  PRODUCT_SEARCH = 'product_search',
  PRICE_INQUIRY = 'price_inquiry',
  INVITE_SENT = 'invite_sent',
  POINTS_EARNED = 'points_earned',
  POINTS_SPENT = 'points_spent',
}

/**
 * 事件数据接口
 */
export interface EventData {
  userId: number;
  eventType: EventType;
  sessionId?: string;
  page?: string;
  properties?: Record<string, any>;
  timestamp: Date;
  userAgent?: string;
  referrer?: string;
}

/**
 * 转化漏斗步骤
 */
export enum FunnelStep {
  VISIT = 'visit', // 访问
  SIGN_UP = 'sign_up', // 注册
  UPLOAD = 'upload', // 上传
  QUOTE = 'quote', // 报价
  PAYMENT = 'payment', // 付费
}

/**
 * 转化漏斗数据
 */
export interface FunnelData {
  step: FunnelStep;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  averageTime?: number;
}

/**
 * 留存数据
 */
export interface RetentionData {
  date: Date;
  day0: number; // 当日新增
  day1: number; // 次日留存
  day7: number; // 7日留存
  day30: number; // 30日留存
  retentionRate1: number;
  retentionRate7: number;
  retentionRate30: number;
}

/**
 * 收入数据
 */
export interface RevenueData {
  date: Date;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
}

/**
 * 用户行为数据
 */
export interface UserBehaviorData {
  userId: number;
  username?: string;
  lastActive: Date;
  totalSessions: number;
  totalDuration: number;
  pageViews: number;
  actions: number;
  funnelStep: FunnelStep;
}

/**
 * 统计数据
 */
export interface AnalyticsStats {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  totalRevenue: number;
  conversionRate: number;
  averageSessionDuration: number;
  bounceRate: number;
}

/**
 * Analytics 类
 */
export class Analytics {
  private events: EventData[] = [];
  private users: Map<number, UserBehaviorData> = new Map();
  private revenue: RevenueData[] = [];
  private retention: RetentionData[] = [];
  private readonly MAX_EVENTS = 10000;
  private readonly MAX_REVENUE_ENTRIES = 365;

  /**
   * 记录事件
   */
  trackEvent(event: EventData) {
    // 防止无限增长：超限时裁剪最旧的记录
    if (this.events.length >= this.MAX_EVENTS) {
      this.events = this.events.slice(-Math.floor(this.MAX_EVENTS * 0.8));
    }
    this.events.push(event);

    // 更新用户行为数据
    if (event.userId) {
      this.updateUserBehavior(event.userId, event);
    }

    // 处理特殊事件
    switch (event.eventType) {
      case EventType.QUOTE_GENERATED:
        this.updateFunnelStep(event.userId, FunnelStep.QUOTE);
        break;
      case EventType.FIRST_PAYMENT:
        this.updateFunnelStep(event.userId, FunnelStep.PAYMENT);
        this.recordRevenue(event);
        break;
      case EventType.FILE_UPLOAD:
        this.updateFunnelStep(event.userId, FunnelStep.UPLOAD);
        break;
      case EventType.SIGN_UP:
        this.updateFunnelStep(event.userId, FunnelStep.SIGN_UP);
        break;
    }

  }

  /**
   * 更新用户行为数据
   */
  private updateUserBehavior(userId: number, event: EventData) {
    let userData = this.users.get(userId);

    if (!userData) {
      userData = {
        userId,
        username: event.properties?.username,
        lastActive: new Date(),
        totalSessions: 0,
        totalDuration: 0,
        pageViews: 0,
        actions: 0,
        funnelStep: FunnelStep.VISIT,
      };
      this.users.set(userId, userData);
    }

    // 更新数据
    userData.lastActive = event.timestamp;

    if (event.eventType === EventType.PAGE_VIEW) {
      userData.pageViews++;
    } else {
      userData.actions++;
    }

    this.users.set(userId, userData);
  }

  /**
   * 更新转化漏斗步骤
   */
  private updateFunnelStep(userId: number, step: FunnelStep) {
    const userData = this.users.get(userId);
    if (userData) {
      const stepOrder = [
        FunnelStep.VISIT,
        FunnelStep.SIGN_UP,
        FunnelStep.UPLOAD,
        FunnelStep.QUOTE,
        FunnelStep.PAYMENT,
      ];

      const currentIndex = stepOrder.indexOf(userData.funnelStep);
      const newIndex = stepOrder.indexOf(step);

      if (newIndex > currentIndex) {
        userData.funnelStep = step;
        this.users.set(userId, userData);
      }
    }
  }

  /**
   * 记录收入
   */
  private recordRevenue(event: EventData) {
    const amount = event.properties?.amount || 0;
    const today = new Date(event.timestamp);
    today.setHours(0, 0, 0, 0);

    let revenueData = this.revenue.find((r) => {
      const d = new Date(r.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });

    if (!revenueData) {
      revenueData = {
        date: today,
        revenue: 0,
        orderCount: 0,
        averageOrderValue: 0,
        newCustomerRevenue: 0,
        returningCustomerRevenue: 0,
      };
      this.revenue.push(revenueData);
      if (this.revenue.length > this.MAX_REVENUE_ENTRIES) {
        this.revenue.shift();
      }
    }

    revenueData.revenue += amount;
    revenueData.orderCount++;
    revenueData.averageOrderValue = revenueData.revenue / revenueData.orderCount;

    // 判断新老客户
    const userData = this.users.get(event.userId);
    if (userData && userData.funnelStep === FunnelStep.PAYMENT && revenueData.orderCount === 1) {
      revenueData.newCustomerRevenue += amount;
    } else {
      revenueData.returningCustomerRevenue += amount;
    }
  }

  /**
   * 计算转化漏斗
   */
  calculateFunnel(startDate?: Date, endDate?: Date): FunnelData[] {
    const filteredUsers = this.getFilteredUsers(startDate, endDate);

    const steps = [
      FunnelStep.VISIT,
      FunnelStep.SIGN_UP,
      FunnelStep.UPLOAD,
      FunnelStep.QUOTE,
      FunnelStep.PAYMENT,
    ];

    return steps.map((step, index) => {
      const count = filteredUsers.filter((u) => {
        const stepOrder = [
          FunnelStep.VISIT,
          FunnelStep.SIGN_UP,
          FunnelStep.UPLOAD,
          FunnelStep.QUOTE,
          FunnelStep.PAYMENT,
        ];
        const userIndex = stepOrder.indexOf(u.funnelStep);
        return userIndex >= index;
      }).length;

      const previousCount =
        index === 0 ? count : this.getFunnelStepCount(steps[index - 1], filteredUsers);
      const conversionRate = index === 0 ? 100 : (previousCount > 0 ? (count / previousCount) * 100 : 0);
      const dropOffRate = index === 0 ? 0 : (previousCount > 0 ? 100 - conversionRate : 0);

      return {
        step,
        count,
        conversionRate,
        dropOffRate,
      };
    });
  }

  /**
   * 获取特定步骤的用户数
   */
  private getFunnelStepCount(step: FunnelStep, users: UserBehaviorData[]): number {
    const stepOrder = [
      FunnelStep.VISIT,
      FunnelStep.SIGN_UP,
      FunnelStep.UPLOAD,
      FunnelStep.QUOTE,
      FunnelStep.PAYMENT,
    ];
    const index = stepOrder.indexOf(step);
    return users.filter((u) => {
      const userIndex = stepOrder.indexOf(u.funnelStep);
      return userIndex >= index;
    }).length;
  }

  /**
   * 计算留存率
   */
  calculateRetention(days: number = 7): RetentionData[] {
    const retentionData: Map<string, RetentionData> = new Map();

    // 按日期分组新增用户
    const newUserDates = new Map<number, Date>();
    this.users.forEach((user) => {
      const firstEvent = this.events.find(
        (e) => e.userId === user.userId && e.eventType === EventType.SIGN_UP
      );
      if (firstEvent) {
        const date = new Date(firstEvent.timestamp);
        date.setHours(0, 0, 0, 0);
        newUserDates.set(user.userId, date);
      }
    });

    // 计算留存
    newUserDates.forEach((date, userId) => {
      const dateKey = date.toISOString().split('T')[0];
      let data = retentionData.get(dateKey);

      if (!data) {
        data = {
          date,
          day0: 0,
          day1: 0,
          day7: 0,
          day30: 0,
          retentionRate1: 0,
          retentionRate7: 0,
          retentionRate30: 0,
        };
        retentionData.set(dateKey, data);
      }

      data.day0++;

      // 计算各日留存
      const userEvents = this.events.filter((e) => e.userId === userId);
      userEvents.forEach((event) => {
        const eventDate = new Date(event.timestamp);
        const diffDays = Math.floor((eventDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) data.day1++;
        if (diffDays === 7) data.day7++;
        if (diffDays === 30) data.day30++;
      });
    });

    // 计算留存率
    retentionData.forEach((data) => {
      data.retentionRate1 = data.day0 > 0 ? (data.day1 / data.day0) * 100 : 0;
      data.retentionRate7 = data.day0 > 0 ? (data.day7 / data.day0) * 100 : 0;
      data.retentionRate30 = data.day0 > 0 ? (data.day30 / data.day0) * 100 : 0;
    });

    return Array.from(retentionData.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * 获取收入数据
   */
  getRevenueData(startDate?: Date, endDate?: Date): RevenueData[] {
    if (startDate && endDate) {
      return this.revenue.filter((r) => r.date >= startDate && r.date <= endDate);
    }
    return this.revenue;
  }

  /**
   * 获取用户行为数据
   */
  getUserBehaviorData(userId?: number): UserBehaviorData[] {
    if (userId) {
      const data = this.users.get(userId);
      return data ? [data] : [];
    }
    return Array.from(this.users.values());
  }

  /**
   * 获取统计数据
   */
  getStats(startDate?: Date, endDate?: Date): AnalyticsStats {
    const filteredUsers = this.getFilteredUsers(startDate, endDate);
    const totalRevenue = this.getRevenueData(startDate, endDate).reduce(
      (sum, r) => sum + r.revenue,
      0
    );

    return {
      totalUsers: filteredUsers.length,
      activeUsers: filteredUsers.filter((u) => {
        const now = new Date();
        const daysSinceActive = (now.getTime() - u.lastActive.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceActive <= 7;
      }).length,
      newUsers: filteredUsers.filter((u) => u.funnelStep === FunnelStep.SIGN_UP).length,
      totalRevenue,
      conversionRate: this.calculateOverallConversionRate(),
      averageSessionDuration: this.calculateAverageSessionDuration(),
      bounceRate: this.calculateBounceRate(),
    };
  }

  /**
   * 获取过滤后的用户列表
   */
  private getFilteredUsers(startDate?: Date, endDate?: Date): UserBehaviorData[] {
    if (!startDate && !endDate) {
      return Array.from(this.users.values());
    }

    return Array.from(this.users.values()).filter((user) => {
      const userEvents = this.events.filter((e) => e.userId === user.userId);
      if (userEvents.length === 0) return false;

      const firstEvent = userEvents[0];
      const eventDate = new Date(firstEvent.timestamp);

      if (startDate && eventDate < startDate) return false;
      if (endDate && eventDate > endDate) return false;

      return true;
    });
  }

  /**
   * 计算整体转化率
   */
  private calculateOverallConversionRate(): number {
    const funnel = this.calculateFunnel();
    const visitCount = funnel.find((f) => f.step === FunnelStep.VISIT)?.count || 0;
    const paymentCount = funnel.find((f) => f.step === FunnelStep.PAYMENT)?.count || 0;

    return visitCount > 0 ? (paymentCount / visitCount) * 100 : 0;
  }

  /**
   * 计算平均会话时长
   */
  private calculateAverageSessionDuration(): number {
    // 简化实现，返回分钟数
    return 5.5; // 模拟值
  }

  /**
   * 计算跳出率
   */
  private calculateBounceRate(): number {
    // 简化实现
    return 42.3; // 模拟值
  }

  /**
   * 获取事件列表
   */
  getEvents(startDate?: Date, endDate?: Date, userId?: number): EventData[] {
    let events = this.events;

    if (startDate) {
      events = events.filter((e) => e.timestamp >= startDate);
    }

    if (endDate) {
      events = events.filter((e) => e.timestamp <= endDate);
    }

    if (userId) {
      events = events.filter((e) => e.userId === userId);
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * 获取页面访问统计
   */
  getPageViewStats(startDate?: Date, endDate?: Date): Map<string, number> {
    const pageViews = new Map<string, number>();
    const events = this.getEvents(startDate, endDate).filter(
      (e) => e.eventType === EventType.PAGE_VIEW
    );

    events.forEach((event) => {
      const page = event.page || 'unknown';
      const count = pageViews.get(page) || 0;
      pageViews.set(page, count + 1);
    });

    return pageViews;
  }

  /**
   * 清除数据
   */
  clear() {
    this.events = [];
    this.users.clear();
    this.revenue = [];
    this.retention = [];
  }

  /**
   * 初始化模拟数据
   */
  initMockData() {
    const now = new Date();
    const usersCount = 100;

    // 模拟用户和事件
    for (let i = 1; i <= usersCount; i++) {
      const userId = i;
      const signUpDate = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);

      // 注册事件
      this.trackEvent({
        userId,
        eventType: EventType.SIGN_UP,
        timestamp: signUpDate,
        properties: { username: `user${i}` },
      });

      // 页面访问
      const pageViewCount = Math.floor(Math.random() * 50) + 1;
      for (let j = 0; j < pageViewCount; j++) {
        const eventDate = new Date(signUpDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000);
        this.trackEvent({
          userId,
          eventType: EventType.PAGE_VIEW,
          timestamp: eventDate,
          page: ['/', '/dashboard', '/quotes', '/profile'][Math.floor(Math.random() * 4)],
        });
      }

      // 模拟转化
      const conversionStep = Math.random();
      if (conversionStep > 0.3) {
        // 上传
        this.trackEvent({
          userId,
          eventType: EventType.FILE_UPLOAD,
          timestamp: new Date(signUpDate.getTime() + 1 * 24 * 60 * 60 * 1000),
        });
      }

      if (conversionStep > 0.5) {
        // 报价
        this.trackEvent({
          userId,
          eventType: EventType.QUOTE_GENERATED,
          timestamp: new Date(signUpDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        });
      }

      if (conversionStep > 0.7) {
        // 付费
        this.trackEvent({
          userId,
          eventType: EventType.FIRST_PAYMENT,
          timestamp: new Date(signUpDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          properties: { amount: Math.floor(Math.random() * 1000) + 100 },
        });
      }
    }

  }
}

// 导出单例
export const analytics = new Analytics();

// 自动初始化模拟数据
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
  analytics.initMockData();
}
