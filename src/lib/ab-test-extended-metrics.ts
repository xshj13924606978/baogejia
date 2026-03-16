/**
 * A/B 测试扩展指标
 *
 * 扩展的测试指标：
 * 1. 用户留存率（User Retention Rate）
 * 2. 转化率（Conversion Rate）
 * 3. 点击率（Click-Through Rate）
 * 4. 用户满意度（User Satisfaction）
 * 5. 会话时长（Session Duration）
 * 6. 查询深度（Query Depth）
 * 7. 返回率（Return Rate）
 *
 * 使用方式：
 * - 作为 A/B Testing Framework 的扩展
 * - 提供更丰富的业务指标
 * - 支持自定义指标计算
 */

import { StreamingLearningEngine, LearningEvent } from './streaming-learning';

/**
 * 用户行为事件
 */
export interface UserBehaviorEvent {
  userId: string;
  algorithm: string;
  timestamp: number;
  type: 'view' | 'click' | 'purchase' | 'abandon' | 'return' | 'search' | 'filter';
  query?: string;
  productId?: string;
  duration?: number;  // 会话时长（秒）
  queryCount?: number;  // 查询次数
  additionalData?: Record<string, any>;
}

/**
 * 扩展的算法统计
 */
export interface ExtendedAlgorithmStats {
  type: string;
  name: string;

  // 基础指标
  totalTests: number;
  matchedCount: number;
  matchRate: number;
  averageScore: number;
  averageConfidence: number;
  averageDuration: number;

  // 反馈指标
  positiveFeedback: number;
  negativeFeedback: number;
  neutralFeedback: number;
  netPromoterScore: number;

  // 新增业务指标
  retentionRate: number;           // 留存率（7 天）
  retentionRate30: number;         // 留存率（30 天）
  conversionRate: number;          // 转化率
  clickThroughRate: number;        // 点击率
  averageSessionDuration: number;  // 平均会话时长（秒）
  averageQueryDepth: number;       // 平均查询深度
  returnRate: number;              // 返回率
  userSatisfaction: number;        // 用户满意度（0-5）

  // 统计显著性
  statisticalSignificance: number; // 统计显著性（p-value）
  confidenceInterval: {           // 置信区间
    lower: number;
    upper: number;
  };
}

/**
 * 用户会话
 */
export interface UserSession {
  userId: string;
  algorithm: string;
  startTime: number;
  endTime?: number;
  events: UserBehaviorEvent[];
  queryCount: number;
  converted: boolean;
  satisfaction?: number;
}

/**
 * A/B 测试扩展引擎
 */
export class ABTestExtendedMetrics {
  private static instance: ABTestExtendedMetrics;
  private streamingLearning: StreamingLearningEngine;
  private userSessions: Map<string, UserSession>;
  private behaviorEvents: UserBehaviorEvent[];
  private statsCache: Map<string, ExtendedAlgorithmStats>;
  private cacheExpiry: number;

  private constructor() {
    this.streamingLearning = StreamingLearningEngine.getInstance();
    this.userSessions = new Map();
    this.behaviorEvents = [];
    this.statsCache = new Map();
    this.cacheExpiry = 300000;  // 5 分钟缓存

    console.log('[ABTestExtendedMetrics] A/B 测试扩展指标引擎初始化完成');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ABTestExtendedMetrics {
    if (!ABTestExtendedMetrics.instance) {
      ABTestExtendedMetrics.instance = new ABTestExtendedMetrics();
    }
    return ABTestExtendedMetrics.instance;
  }

  /**
   * 记录用户行为事件
   */
  public recordEvent(event: UserBehaviorEvent): void {
    this.behaviorEvents.push(event);

    // 更新用户会话
    this.updateUserSession(event);

    // 记录到流式学习引擎
    this.streamingLearning.recordEvent({
      type: event.type as any,
      userId: event.userId,
      query: event.query || '',
      productId: event.productId || '',
      productName: event.productId || '',
      score: 0.5,  // 默认分数
      confidence: 0.5,
      algorithm: event.algorithm,
      additionalData: event.additionalData
    });

    // 清除缓存
    this.clearCache();

    console.log(`[ABTestExtendedMetrics] 记录事件: ${event.type} - ${event.userId} - ${event.algorithm}`);
  }

  /**
   * 更新用户会话
   */
  private updateUserSession(event: UserBehaviorEvent): void {
    const sessionKey = `${event.userId}_${event.algorithm}`;

    if (!this.userSessions.has(sessionKey)) {
      // 创建新会话
      const session: UserSession = {
        userId: event.userId,
        algorithm: event.algorithm,
        startTime: event.timestamp,
        events: [],
        queryCount: 0,
        converted: false
      };

      this.userSessions.set(sessionKey, session);
    }

    const session = this.userSessions.get(sessionKey)!;
    session.events.push(event);

    // 更新查询次数
    if (event.type === 'search') {
      session.queryCount++;
    }

    // 更新转化状态
    if (event.type === 'purchase') {
      session.converted = true;
    }

    // 更新满意度
    if (event.additionalData?.satisfaction) {
      session.satisfaction = event.additionalData.satisfaction;
    }

    // 更新结束时间
    session.endTime = event.timestamp;
  }

  /**
   * 计算扩展的算法统计
   */
  public calculateExtendedStats(
    algorithm: string,
    baseStats: {
      totalTests: number;
      matchedCount: number;
      averageScore: number;
      averageConfidence: number;
      averageDuration: number;
      positiveFeedback: number;
      negativeFeedback: number;
    }
  ): ExtendedAlgorithmStats {
    // 检查缓存
    const cacheKey = `${algorithm}_${Date.now()}`;
    if (this.statsCache.has(algorithm)) {
      return this.statsCache.get(algorithm)!;
    }

    // 过滤该算法的事件
    const algorithmEvents = this.behaviorEvents.filter(e => e.algorithm === algorithm);

    // 计算留存率
    const retentionRate = this.calculateRetentionRate(algorithm, 7);
    const retentionRate30 = this.calculateRetentionRate(algorithm, 30);

    // 计算转化率
    const conversionRate = this.calculateConversionRate(algorithm);

    // 计算点击率
    const clickThroughRate = this.calculateClickThroughRate(algorithm);

    // 计算平均会话时长
    const averageSessionDuration = this.calculateAverageSessionDuration(algorithm);

    // 计算平均查询深度
    const averageQueryDepth = this.calculateAverageQueryDepth(algorithm);

    // 计算返回率
    const returnRate = this.calculateReturnRate(algorithm);

    // 计算用户满意度
    const userSatisfaction = this.calculateUserSatisfaction(algorithm);

    // 计算统计显著性
    const statisticalSignificance = this.calculateStatisticalSignificance(algorithm);

    // 计算置信区间
    const confidenceInterval = this.calculateConfidenceInterval(
      conversionRate,
      algorithmEvents.length
    );

    const stats: ExtendedAlgorithmStats = {
      type: algorithm,
      name: this.getAlgorithmName(algorithm),
      ...baseStats,
      matchRate: baseStats.totalTests > 0 ? baseStats.matchedCount / baseStats.totalTests : 0,
      neutralFeedback: baseStats.totalTests - baseStats.positiveFeedback - baseStats.negativeFeedback,
      netPromoterScore: this.calculateNPS(baseStats.positiveFeedback, baseStats.negativeFeedback),
      retentionRate,
      retentionRate30,
      conversionRate,
      clickThroughRate,
      averageSessionDuration,
      averageQueryDepth,
      returnRate,
      userSatisfaction,
      statisticalSignificance,
      confidenceInterval
    };

    // 缓存结果
    this.statsCache.set(algorithm, stats);

    return stats;
  }

  /**
   * 计算留存率
   */
  private calculateRetentionRate(algorithm: string, days: number): number {
    const now = Date.now();
    const cutoffTime = now - days * 24 * 60 * 60 * 1000;

    // 获取在 cutoffTime 之前的所有用户
    const earlyUsers = new Set<string>();
    const returningUsers = new Set<string>();

    this.behaviorEvents.forEach(event => {
      if (event.algorithm !== algorithm) return;

      if (event.timestamp < cutoffTime) {
        earlyUsers.add(event.userId);
      } else {
        if (earlyUsers.has(event.userId)) {
          returningUsers.add(event.userId);
        }
      }
    });

    return earlyUsers.size > 0 ? returningUsers.size / earlyUsers.size : 0;
  }

  /**
   * 计算转化率
   */
  private calculateConversionRate(algorithm: string): number {
    const algorithmSessions = Array.from(this.userSessions.values())
      .filter(s => s.algorithm === algorithm);

    if (algorithmSessions.length === 0) return 0;

    const convertedSessions = algorithmSessions.filter(s => s.converted).length;
    return convertedSessions / algorithmSessions.length;
  }

  /**
   * 计算点击率
   */
  private calculateClickThroughRate(algorithm: string): number {
    const algorithmEvents = this.behaviorEvents.filter(e => e.algorithm === algorithm);

    const views = algorithmEvents.filter(e => e.type === 'view').length;
    const clicks = algorithmEvents.filter(e => e.type === 'click').length;

    return views > 0 ? clicks / views : 0;
  }

  /**
   * 计算平均会话时长
   */
  private calculateAverageSessionDuration(algorithm: string): number {
    const algorithmSessions = Array.from(this.userSessions.values())
      .filter(s => s.algorithm === algorithm && s.endTime !== undefined);

    if (algorithmSessions.length === 0) return 0;

    const totalDuration = algorithmSessions.reduce((sum, session) => {
      return sum + (session.endTime! - session.startTime) / 1000;  // 转换为秒
    }, 0);

    return totalDuration / algorithmSessions.length;
  }

  /**
   * 计算平均查询深度
   */
  private calculateAverageQueryDepth(algorithm: string): number {
    const algorithmSessions = Array.from(this.userSessions.values())
      .filter(s => s.algorithm === algorithm);

    if (algorithmSessions.length === 0) return 0;

    const totalQueries = algorithmSessions.reduce((sum, session) => sum + session.queryCount, 0);
    return totalQueries / algorithmSessions.length;
  }

  /**
   * 计算返回率
   */
  private calculateReturnRate(algorithm: string): number {
    const algorithmSessions = Array.from(this.userSessions.values())
      .filter(s => s.algorithm === algorithm);

    if (algorithmSessions.length === 0) return 0;

    const returnedSessions = algorithmSessions.filter(s => s.queryCount > 1).length;
    return returnedSessions / algorithmSessions.length;
  }

  /**
   * 计算用户满意度
   */
  private calculateUserSatisfaction(algorithm: string): number {
    const algorithmSessions = Array.from(this.userSessions.values())
      .filter(s => s.algorithm === algorithm && s.satisfaction !== undefined);

    if (algorithmSessions.length === 0) return 0;

    const totalSatisfaction = algorithmSessions.reduce((sum, session) => sum + session.satisfaction!, 0);
    return totalSatisfaction / algorithmSessions.length;
  }

  /**
   * 计算 NPS（净推荐值）
   */
  private calculateNPS(positive: number, negative: number): number {
    const total = positive + negative;
    return total > 0 ? (positive - negative) / total : 0;
  }

  /**
   * 计算统计显著性（p-value）
   */
  private calculateStatisticalSignificance(algorithm: string): number {
    // 简化实现：基于样本量和转化率计算 p-value
    const algorithmSessions = Array.from(this.userSessions.values())
      .filter(s => s.algorithm === algorithm);

    const n = algorithmSessions.length;
    const conversionRate = this.calculateConversionRate(algorithm);

    // 使用正态近似计算 p-value
    if (n < 30) return 1.0;  // 样本量太小，无统计意义

    const standardError = Math.sqrt(conversionRate * (1 - conversionRate) / n);
    const zScore = (conversionRate - 0.5) / standardError;  // 假设基准转化率为 0.5

    // 计算 p-value（双尾检验）
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    return pValue;
  }

  /**
   * 正态分布累积分布函数
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 计算置信区间
   */
  private calculateConfidenceInterval(rate: number, n: number): { lower: number; upper: number } {
    const z = 1.96;  // 95% 置信水平
    const margin = z * Math.sqrt(rate * (1 - rate) / n);

    return {
      lower: Math.max(0, rate - margin),
      upper: Math.min(1, rate + margin)
    };
  }

  /**
   * 获取算法名称
   */
  private getAlgorithmName(algorithm: string): string {
    const names: Record<string, string> = {
      'baseline': '传统规则匹配',
      'vector': '向量相似度匹配',
      'ml': '机器学习匹配',
      'embedding': '高级嵌入匹配',
      'hybrid': '混合算法',
      'transformer': 'Transformer 匹配'
    };

    return names[algorithm] || algorithm;
  }

  /**
   * 清除缓存
   */
  private clearCache(): void {
    this.statsCache.clear();
  }

  /**
   * 获取统计摘要
   */
  public getSummary(): {
    totalSessions: number;
    totalEvents: number;
    uniqueUsers: number;
    averageEventsPerSession: number;
  } {
    const sessions = Array.from(this.userSessions.values());
    const uniqueUsers = new Set(sessions.map(s => s.userId)).size;

    return {
      totalSessions: sessions.length,
      totalEvents: this.behaviorEvents.length,
      uniqueUsers,
      averageEventsPerSession: sessions.length > 0
        ? this.behaviorEvents.length / sessions.length
        : 0
    };
  }

  /**
   * 清空历史数据
   */
  public clearHistory(): void {
    this.userSessions.clear();
    this.behaviorEvents = [];
    this.statsCache.clear();
    console.log('[ABTestExtendedMetrics] 历史数据已清空');
  }
}

/**
 * 导出单例
 */
export const abTestExtendedMetrics = ABTestExtendedMetrics.getInstance();
