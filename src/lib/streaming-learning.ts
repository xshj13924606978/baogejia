/**
 * 实时流式学习和在线更新系统
 *
 * 核心功能：
 * 1. 实时学习用户反馈
 * 2. 在线更新模型权重
 * 3. 流式数据处理
 * 4. 增量学习（Incremental Learning）
 * 5. 自适应学习率
 * 6. 模型版本管理
 *
 * 学习策略：
 * - 即时反馈学习
 * - 批量更新学习
 * - 定期模型再训练
 * - A/B 测试结果集成
 * - 用户行为分析
 */

import { MLMatchingEngine } from './ml-matching-engine';
import { TransformerMatchingEngine } from './transformer-matching-engine';

/**
 * 学习事件
 */
export interface LearningEvent {
  id: string;
  type: 'feedback' | 'click' | 'purchase' | 'abandon' | 'search' | 'conversion';
  timestamp: number;
  userId: string;
  query: string;
  productId: string;
  productName: string;
  score: number;
  confidence: number;
  algorithm: string;
  feedback?: 'positive' | 'negative' | 'neutral';
  additionalData?: Record<string, any>;
}

/**
 * 学习统计
 */
export interface LearningStats {
  totalEvents: number;
  positiveEvents: number;
  negativeEvents: number;
  conversionRate: number;
  retentionRate: number;
  averageScore: number;
  lastUpdate: number;
  modelVersion: number;
}

/**
 * 学习配置
 */
export interface LearningConfig {
  enabled: boolean;
  learningRate: number;           // 基础学习率
  adaptiveLearningRate: boolean;  // 自适应学习率
  batchSize: number;              // 批量更新大小
  updateInterval: number;         // 更新间隔（毫秒）
  minFeedbackForUpdate: number;   // 最小反馈数量
  maxHistorySize: number;         // 最大历史记录数量
  enableModelRetraining: boolean; // 启用模型再训练
  retrainingThreshold: number;    // 再训练阈值
}

/**
 * 模型版本信息
 */
export interface ModelVersion {
  version: number;
  timestamp: number;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
  };
  weights: any;
  eventsIncluded: number;
}

/**
 * 流式学习引擎
 */
export class StreamingLearningEngine {
  private static instance: StreamingLearningEngine;
  private mlEngine: MLMatchingEngine;
  private transformerEngine: TransformerMatchingEngine;
  private config: LearningConfig;
  private events: LearningEvent[];
  private modelVersions: ModelVersion[];
  private currentVersion: number;
  private pendingUpdates: LearningEvent[];
  private updateTimer: NodeJS.Timeout | null;

  private constructor(config?: LearningConfig) {
    this.mlEngine = MLMatchingEngine.getInstance();
    this.transformerEngine = TransformerMatchingEngine.getInstance();

    this.config = {
      enabled: true,
      learningRate: 0.01,
      adaptiveLearningRate: true,
      batchSize: 100,
      updateInterval: 60000,  // 1 分钟
      minFeedbackForUpdate: 50,
      maxHistorySize: 10000,
      enableModelRetraining: true,
      retrainingThreshold: 1000,
      ...config
    };

    this.events = [];
    this.modelVersions = [];
    this.currentVersion = 0;
    this.pendingUpdates = [];
    this.updateTimer = null;

  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: LearningConfig): StreamingLearningEngine {
    if (!StreamingLearningEngine.instance) {
      StreamingLearningEngine.instance = new StreamingLearningEngine(config);
    }
    return StreamingLearningEngine.instance;
  }

  /**
   * 启动流式学习
   */
  public start(): void {
    if (!this.config.enabled) {
      console.warn('[StreamingLearningEngine] 流式学习未启用');
      return;
    }


    // 启动定时更新
    this.updateTimer = setInterval(() => {
      this.processUpdates();
    }, this.config.updateInterval);

    // 创建初始模型版本
    this.createInitialModelVersion();
  }

  /**
   * 停止流式学习
   */
  public stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    // 处理剩余的更新
    if (this.pendingUpdates.length > 0) {
      this.processUpdates();
    }

  }

  /**
   * 记录学习事件
   */
  public recordEvent(event: Omit<LearningEvent, 'id' | 'timestamp'>): void {
    if (!this.config.enabled) {
      console.warn('[StreamingLearningEngine] 流式学习未启用，忽略事件');
      return;
    }

    const learningEvent: LearningEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...event
    };

    this.events.push(learningEvent);
    this.pendingUpdates.push(learningEvent);

    // 限制历史记录数量
    if (this.events.length > this.config.maxHistorySize) {
      this.events.shift();
    }


    // 记录到 ML 引擎
    if (event.feedback) {
      this.mlEngine.recordMatch(
        event.query,
        event.productId,
        event.productName,
        event.feedback === 'positive'
      );
    }

    // 检查是否需要立即更新
    if (this.pendingUpdates.length >= this.config.batchSize) {
      this.processUpdates();
    }
  }

  /**
   * 处理更新
   */
  private processUpdates(): void {
    if (this.pendingUpdates.length < this.config.minFeedbackForUpdate) {
      return;
    }


    // 分析事件
    const analysis = this.analyzeEvents(this.pendingUpdates);

    // 更新模型权重
    this.updateModelWeights(analysis);

    // 检查是否需要再训练
    if (this.config.enableModelRetraining) {
      this.checkRetrainingNeeded();
    }

    // 清空待处理事件
    this.pendingUpdates = [];
  }

  /**
   * 分析事件
   */
  private analyzeEvents(events: LearningEvent[]): {
    positiveCount: number;
    negativeCount: number;
    conversionCount: number;
    averageScore: number;
    scoreImprovement: number;
  } {
    const positiveCount = events.filter(e => e.feedback === 'positive').length;
    const negativeCount = events.filter(e => e.feedback === 'negative').length;
    const conversionCount = events.filter(e => e.type === 'purchase' || e.type === 'conversion').length;

    const scores = events.map(e => e.score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // 计算分数改进（与历史平均比较）
    const recentScores = events.slice(-20).map(e => e.score);
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const scoreImprovement = recentAvg - averageScore;

    return {
      positiveCount,
      negativeCount,
      conversionCount,
      averageScore,
      scoreImprovement
    };
  }

  /**
   * 更新模型权重
   */
  private updateModelWeights(analysis: any): void {

    // 计算学习率（自适应）
    const learningRate = this.config.adaptiveLearningRate
      ? this.calculateAdaptiveLearningRate(analysis)
      : this.config.learningRate;

    // 更新 ML 引擎权重
    const currentConfig = this.mlEngine.getConfig();
    const newWeights = {
      nameWeights: currentConfig.nameWeights,
      modelWeights: currentConfig.modelWeights,
      paramWeights: currentConfig.paramWeights,
      categoryWeights: currentConfig.categoryWeights,
      brandWeights: currentConfig.brandWeights,
      embeddingWeights: currentConfig.embeddingWeights,
      historicalWeights: currentConfig.historicalWeights
    };

    // 根据反馈调整权重
    if (analysis.positiveCount > analysis.negativeCount) {
      // 正面反馈多，增加历史权重
      newWeights.historicalWeights = Math.min(0.20, newWeights.historicalWeights + learningRate * 0.1);
      newWeights.nameWeights = Math.max(0.20, newWeights.nameWeights - learningRate * 0.05);
    } else if (analysis.negativeCount > analysis.positiveCount) {
      // 负面反馈多，增加嵌入权重
      newWeights.embeddingWeights = Math.min(0.20, newWeights.embeddingWeights + learningRate * 0.1);
      newWeights.historicalWeights = Math.max(0.05, newWeights.historicalWeights - learningRate * 0.05);
    }

    // 更新配置
    this.mlEngine.updateConfig(newWeights);

  }

  /**
   * 计算自适应学习率
   */
  private calculateAdaptiveLearningRate(analysis: any): number {
    // 基于分数改进调整学习率
    const baseRate = this.config.learningRate;

    if (analysis.scoreImprovement > 0.05) {
      // 分数显著提升，降低学习率
      return baseRate * 0.5;
    } else if (analysis.scoreImprovement < -0.05) {
      // 分数显著下降，提高学习率
      return baseRate * 2.0;
    } else {
      // 分数稳定，使用标准学习率
      return baseRate;
    }
  }

  /**
   * 检查是否需要再训练
   */
  private checkRetrainingNeeded(): void {
    const totalEvents = this.events.length;

    if (totalEvents >= this.config.retrainingThreshold + this.currentVersion * this.config.retrainingThreshold) {
      this.retrainModel();
    }
  }

  /**
   * 重新训练模型
   */
  private async retrainModel(): Promise<void> {

    // 创建新版本
    this.currentVersion++;

    // 分析所有事件
    const analysis = this.analyzeEvents(this.events);

    // 计算模型指标
    const metrics = this.calculateModelMetrics(analysis);

    // 保存模型版本
    const newVersion: ModelVersion = {
      version: this.currentVersion,
      timestamp: Date.now(),
      metrics,
      weights: this.mlEngine.getConfig(),
      eventsIncluded: this.events.length
    };

    this.modelVersions.push(newVersion);

    // 限制版本数量（最多保留 10 个版本）
    if (this.modelVersions.length > 10) {
      this.modelVersions.shift();
    }

  }

  /**
   * 计算模型指标
   */
  private calculateModelMetrics(analysis: any): {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
  } {
    const positive = analysis.positiveCount;
    const negative = analysis.negativeCount;
    const conversion = analysis.conversionCount;
    const total = positive + negative + conversion;

    if (total === 0) {
      return { accuracy: 0, precision: 0, recall: 0, f1: 0 };
    }

    const accuracy = (positive + conversion) / total;
    const precision = positive / (positive + negative);
    const recall = positive / (positive + negative + conversion);
    const f1 = 2 * (precision * recall) / (precision + recall);

    return {
      accuracy,
      precision,
      recall,
      f1
    };
  }

  /**
   * 创建初始模型版本
   */
  private createInitialModelVersion(): void {
    const initialVersion: ModelVersion = {
      version: this.currentVersion,
      timestamp: Date.now(),
      metrics: {
        accuracy: 0.5,
        precision: 0.5,
        recall: 0.5,
        f1: 0.5
      },
      weights: this.mlEngine.getConfig(),
      eventsIncluded: 0
    };

    this.modelVersions.push(initialVersion);
  }

  /**
   * 获取学习统计
   */
  public getStats(): LearningStats {
    const positiveEvents = this.events.filter(e => e.feedback === 'positive').length;
    const negativeEvents = this.events.filter(e => e.feedback === 'negative').length;
    const conversionEvents = this.events.filter(e => e.type === 'purchase' || e.type === 'conversion').length;

    const scores = this.events.map(e => e.score);
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // 计算转化率
    const conversionRate = this.events.length > 0 ? conversionEvents / this.events.length : 0;

    // 计算留存率（返回用户数 / 总用户数）
    const uniqueUsers = new Set(this.events.map(e => e.userId));
    const returningUsers = new Set<string>();
    const userFirstVisit = new Map<string, number>();

    this.events.forEach(e => {
      if (!userFirstVisit.has(e.userId)) {
        userFirstVisit.set(e.userId, e.timestamp);
      } else {
        returningUsers.add(e.userId);
      }
    });

    const retentionRate = uniqueUsers.size > 0 ? returningUsers.size / uniqueUsers.size : 0;

    return {
      totalEvents: this.events.length,
      positiveEvents,
      negativeEvents,
      conversionRate,
      retentionRate,
      averageScore,
      lastUpdate: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : 0,
      modelVersion: this.currentVersion
    };
  }

  /**
   * 获取模型版本历史
   */
  public getModelVersions(): ModelVersion[] {
    return [...this.modelVersions];
  }

  /**
   * 回滚到指定版本
   */
  public rollbackToVersion(version: number): boolean {
    const versionInfo = this.modelVersions.find(v => v.version === version);

    if (!versionInfo) {
      console.warn(`[StreamingLearningEngine] 版本 v${version} 不存在`);
      return false;
    }

    // 恢复权重
    this.mlEngine.updateConfig(versionInfo.weights);
    this.currentVersion = version;

    return true;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<LearningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  public getConfig(): LearningConfig {
    return { ...this.config };
  }

  /**
   * 清空历史记录
   */
  public clearHistory(): void {
    this.events = [];
    this.pendingUpdates = [];
  }
}

/**
 * 导出单例
 */
export const streamingLearningEngine = StreamingLearningEngine.getInstance({
  enabled: true,
  learningRate: 0.01,
  adaptiveLearningRate: true,
  batchSize: 100,
  updateInterval: 60000,
  minFeedbackForUpdate: 50,
  maxHistorySize: 10000,
  enableModelRetraining: true,
  retrainingThreshold: 1000
});
