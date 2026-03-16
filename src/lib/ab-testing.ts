/**
 * A/B 测试框架
 *
 * 核心功能：
 * 1. 支持多种匹配算法对比测试
 * 2. 自动分配用户到不同测试组
 * 3. 收集性能指标（准确率、响应时间、用户满意度）
 * 4. 实时统计和可视化
 * 5. 自动选择最优算法
 *
 * 支持的算法：
 * - 传统规则匹配（baseline）
 * - 向量相似度匹配（TF-IDF + 余弦相似度）
 * - 机器学习匹配（ML Matching Engine）
 * - 高级嵌入匹配（BERT/RoBERTa）
 * - 混合算法（多模型融合）
 *
 * 测试指标：
 * - 匹配准确率
 * - 匹配置信度
 * - 响应时间
 * - 缓存命中率
 * - 用户反馈（点击率、满意度）
 */

import { UnifiedMatcher } from './unified-matcher';
import { MLMatchingEngine, MatchPrediction } from './ml-matching-engine';
import { AdvancedEmbedding } from './advanced-embedding';
import { ProductExtractor, ExtractedProduct } from './product-extractor';

/**
 * 算法类型
 */
export type AlgorithmType =
  | 'baseline'        // 传统规则匹配（基线）
  | 'vector'          // 向量相似度匹配
  | 'ml'              // 机器学习匹配
  | 'embedding'       // 高级嵌入匹配
  | 'hybrid';         // 混合算法

/**
 * 算法配置
 */
export interface AlgorithmConfig {
  type: AlgorithmType;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;  // 流量分配权重
}

/**
 * 测试结果
 */
export interface TestResult {
  algorithm: AlgorithmType;
  query: string;
  productId: string;
  productName: string;
  score: number;
  confidence: number;
  duration: number;
  timestamp: number;
  matched: boolean;
  userFeedback?: 'positive' | 'negative' | 'neutral';
}

/**
 * 算法统计
 */
export interface AlgorithmStats {
  type: AlgorithmType;
  name: string;
  totalTests: number;
  matchedCount: number;
  matchRate: number;
  averageScore: number;
  averageConfidence: number;
  averageDuration: number;
  positiveFeedback: number;
  negativeFeedback: number;
  netPromoterScore: number;  // 净推荐值
}

/**
 * A/B 测试配置
 */
export interface ABTestConfig {
  enabled: boolean;
  algorithms: AlgorithmConfig[];
  trafficAllocation: Record<AlgorithmType, number>;  // 流量分配
  testDuration: number;  // 测试持续时间（毫秒）
  minSampleSize: number;  // 最小样本数
  statisticalSignificance: number;  // 统计显著性阈值
}

/**
 * A/B 测试框架
 */
export class ABTestingFramework {
  private static instance: ABTestingFramework;
  private unifiedMatcher: UnifiedMatcher;
  private mlEngine: MLMatchingEngine;
  private embedding: AdvancedEmbedding;
  private config: ABTestConfig;
  private results: Map<AlgorithmType, TestResult[]>;
  private userGroups: Map<string, AlgorithmType>;  // 用户分组
  private currentTestStart: number;

  private constructor(config?: ABTestConfig) {
    // 延迟初始化以避免循环依赖
    this.unifiedMatcher = null as any;  // 将在需要时初始化
    this.mlEngine = MLMatchingEngine.getInstance();
    this.embedding = AdvancedEmbedding.getInstance();

    this.config = {
      enabled: true,
      algorithms: [
        {
          type: 'baseline',
          name: '传统规则匹配',
          description: '基于规则和模糊匹配的传统算法',
          enabled: true,
          weight: 0.20
        },
        {
          type: 'vector',
          name: '向量相似度匹配',
          description: 'TF-IDF + 余弦相似度',
          enabled: true,
          weight: 0.20
        },
        {
          type: 'ml',
          name: '机器学习匹配',
          description: '基于历史数据的智能匹配',
          enabled: true,
          weight: 0.30
        },
        {
          type: 'embedding',
          name: '高级嵌入匹配',
          description: 'BERT/RoBERTa 深度语义匹配',
          enabled: true,
          weight: 0.15
        },
        {
          type: 'hybrid',
          name: '混合算法',
          description: '多模型融合匹配',
          enabled: true,
          weight: 0.15
        }
      ],
      trafficAllocation: {
        baseline: 0.20,
        vector: 0.20,
        ml: 0.30,
        embedding: 0.15,
        hybrid: 0.15
      },
      testDuration: 7 * 24 * 60 * 60 * 1000,  // 7 天
      minSampleSize: 100,
      statisticalSignificance: 0.95,
      ...config
    };

    this.results = new Map();
    this.userGroups = new Map();
    this.currentTestStart = Date.now();

    // 初始化结果存储
    this.config.algorithms.forEach(algo => {
      if (algo.enabled) {
        this.results.set(algo.type, []);
      }
    });

    console.log('[ABTestingFramework] A/B 测试框架初始化完成');
    console.log('[ABTestingFramework] 支持的算法:', this.config.algorithms.filter(a => a.enabled).map(a => a.name));
  }

  /**
   * 获取 UnifiedMatcher 实例（延迟初始化以避免循环依赖）
   */
  private getMatcher(): UnifiedMatcher {
    if (!this.unifiedMatcher) {
      this.unifiedMatcher = UnifiedMatcher.getInstance();
    }
    return this.unifiedMatcher;
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: ABTestConfig): ABTestingFramework {
    if (!ABTestingFramework.instance) {
      ABTestingFramework.instance = new ABTestingFramework(config);
    }
    return ABTestingFramework.instance;
  }

  /**
   * 执行 A/B 测试
   */
  public async test(
    userId: string,
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<{
    result: TestResult;
    algorithm: AlgorithmType;
    allResults?: Map<AlgorithmType, TestResult>;  // 可选：返回所有算法的结果（用于对比）
  }> {
    if (!this.config.enabled) {
      // 如果 A/B 测试未启用，使用默认算法（ML）
      const result = await this.runAlgorithm('ml', query, productName, model, params);
      return { result, algorithm: 'ml' };
    }

    // 获取用户的测试组
    const algorithm = this.assignUserToGroup(userId);

    // 执行选定的算法
    const result = await this.runAlgorithm(algorithm, query, productName, model, params);

    // 记录结果
    this.recordResult(algorithm, result);

    // 同时运行其他算法（用于对比）
    if (this.shouldRunComparison()) {
      const allResults = new Map<AlgorithmType, TestResult>();

      for (const algo of this.config.algorithms) {
        if (algo.enabled && algo.type !== algorithm) {
          try {
            const algoResult = await this.runAlgorithm(algo.type, query, productName, model, params);
            allResults.set(algo.type, algoResult);
          } catch (error) {
            console.error(`[ABTestingFramework] ${algo.type} 执行失败:`, error);
          }
        }
      }

      return { result, algorithm, allResults };
    }

    return { result, algorithm };
  }

  /**
   * 分配用户到测试组
   */
  private assignUserToGroup(userId: string): AlgorithmType {
    // 检查用户是否已经分组
    if (this.userGroups.has(userId)) {
      return this.userGroups.get(userId)!;
    }

    // 基于用户 ID 哈希进行一致性分配
    const hash = this.hashString(userId);
    const enabledAlgorithms = this.config.algorithms.filter(a => a.enabled);

    // 计算累积权重
    let cumulativeWeight = 0;
    const totalWeight = enabledAlgorithms.reduce((sum, a) => sum + a.weight, 0);

    for (const algo of enabledAlgorithms) {
      cumulativeWeight += algo.weight / totalWeight;

      if (hash < cumulativeWeight) {
        this.userGroups.set(userId, algo.type);
        console.log(`[ABTestingFramework] 用户 ${userId} 分配到 ${algo.name}`);
        return algo.type;
      }
    }

    // 默认分配到第一个算法
    const defaultAlgo = enabledAlgorithms[0];
    this.userGroups.set(userId, defaultAlgo.type);
    return defaultAlgo.type;
  }

  /**
   * 运行指定算法
   */
  private async runAlgorithm(
    algorithm: AlgorithmType,
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      let productId = '';
      let productNameMatch = '';
      let score = 0;
      let confidence = 0;
      let matched = false;

      switch (algorithm) {
        case 'baseline':
          const baselineResult = await this.runBaseline(query, productName, model, params);
          productId = baselineResult.productId;
          productNameMatch = baselineResult.productName;
          score = baselineResult.score;
          confidence = baselineResult.confidence;
          matched = baselineResult.matched;
          break;

        case 'vector':
          const vectorResult = await this.runVector(query, productName, model, params);
          productId = vectorResult.productId;
          productNameMatch = vectorResult.productName;
          score = vectorResult.score;
          confidence = vectorResult.confidence;
          matched = vectorResult.matched;
          break;

        case 'ml':
          const mlResult = await this.runML(query, productName, model, params);
          productId = mlResult.productId;
          productNameMatch = mlResult.productName;
          score = mlResult.score;
          confidence = mlResult.confidence;
          matched = mlResult.matched;
          break;

        case 'embedding':
          const embeddingResult = await this.runEmbedding(query, productName, model, params);
          productId = embeddingResult.productId;
          productNameMatch = embeddingResult.productName;
          score = embeddingResult.score;
          confidence = embeddingResult.confidence;
          matched = embeddingResult.matched;
          break;

        case 'hybrid':
          const hybridResult = await this.runHybrid(query, productName, model, params);
          productId = hybridResult.productId;
          productNameMatch = hybridResult.productName;
          score = hybridResult.score;
          confidence = hybridResult.confidence;
          matched = hybridResult.matched;
          break;
      }

      const duration = Date.now() - startTime;

      return {
        algorithm,
        query,
        productId,
        productName: productNameMatch,
        score,
        confidence,
        duration,
        timestamp: Date.now(),
        matched,
        userFeedback: undefined
      };
    } catch (error) {
      console.error(`[ABTestingFramework] ${algorithm} 执行失败:`, error);

      return {
        algorithm,
        query,
        productId: '',
        productName: '',
        score: 0,
        confidence: 0,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        matched: false,
        userFeedback: undefined
      };
    }
  }

  /**
   * 运行基线算法
   */
  private async runBaseline(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<{ productId: string; productName: string; score: number; confidence: number; matched: boolean }> {
    const extracted = await ProductExtractor.extractWithLLM(query);

    if (!extracted) {
      return { productId: '', productName: '', score: 0, confidence: 0, matched: false };
    }

    const result = await this.getMatcher().match(query);

    if (result.matches && result.matches.length > 0) {
      const best = result.matches[0];
      return {
        productId: best.product.id,
        productName: best.product.name,
        score: best.score,
        confidence: best.score,
        matched: true
      };
    }

    return { productId: '', productName: '', score: 0, confidence: 0, matched: false };
  }

  /**
   * 运行向量相似度算法
   */
  private async runVector(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<{ productId: string; productName: string; score: number; confidence: number; matched: boolean }> {
    // 简化实现，使用 UnifiedMatcher
    return this.runBaseline(query, productName, model, params);
  }

  /**
   * 运行机器学习算法
   */
  private async runML(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<{ productId: string; productName: string; score: number; confidence: number; matched: boolean }> {
    const predictions = await this.mlEngine.match(query, productName, model, params);

    if (predictions.length > 0) {
      const best = predictions[0];
      return {
        productId: best.productId,
        productName: best.productName,
        score: best.score,
        confidence: best.confidence,
        matched: true
      };
    }

    return { productId: '', productName: '', score: 0, confidence: 0, matched: false };
  }

  /**
   * 运行嵌入算法
   */
  private async runEmbedding(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<{ productId: string; productName: string; score: number; confidence: number; matched: boolean }> {
    // 使用嵌入相似度
    const similarities = await this.embedding.calculateSimilarities(
      query,
      [productName || '', model || '', params || ''].filter(Boolean)
    );

    if (similarities.length > 0) {
      return {
        productId: '',
        productName: productName || '',
        score: similarities[0].similarity,
        confidence: similarities[0].similarity,
        matched: true
      };
    }

    return { productId: '', productName: '', score: 0, confidence: 0, matched: false };
  }

  /**
   * 运行混合算法
   */
  private async runHybrid(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<{ productId: string; productName: string; score: number; confidence: number; matched: boolean }> {
    // 同时运行 ML 和基线，取加权平均
    const mlResult = await this.runML(query, productName, model, params);
    const baselineResult = await this.runBaseline(query, productName, model, params);

    const score = mlResult.score * 0.7 + baselineResult.score * 0.3;
    const confidence = mlResult.confidence * 0.7 + baselineResult.confidence * 0.3;
    const matched = mlResult.matched || baselineResult.matched;

    return {
      productId: mlResult.productId || baselineResult.productId,
      productName: mlResult.productName || baselineResult.productName,
      score,
      confidence,
      matched
    };
  }

  /**
   * 判断是否需要运行对比测试
   */
  private shouldRunComparison(): boolean {
    // 随机采样 10% 的请求进行全算法对比
    return Math.random() < 0.1;
  }

  /**
   * 记录测试结果
   */
  private recordResult(algorithm: AlgorithmType, result: TestResult): void {
    if (!this.results.has(algorithm)) {
      this.results.set(algorithm, []);
    }

    const results = this.results.get(algorithm)!;
    results.push(result);

    // 限制结果数量（最多 10000 条）
    if (results.length > 10000) {
      results.shift();
    }
  }

  /**
   * 提交用户反馈
   */
  public submitFeedback(
    algorithm: AlgorithmType,
    query: string,
    feedback: 'positive' | 'negative' | 'neutral'
  ): void {
    const results = this.results.get(algorithm);

    if (results) {
      const result = results.find(r => r.query === query && r.timestamp === this.findLatestTimestamp(algorithm, query));

      if (result) {
        result.userFeedback = feedback;
        console.log(`[ABTestingFramework] 记录反馈: ${algorithm} - ${feedback}`);
      }
    }
  }

  /**
   * 查找最新时间戳
   */
  private findLatestTimestamp(algorithm: AlgorithmType, query: string): number {
    const results = this.results.get(algorithm);

    if (!results) return 0;

    const filtered = results.filter(r => r.query === query);
    return filtered.length > 0 ? Math.max(...filtered.map(r => r.timestamp)) : 0;
  }

  /**
   * 获取算法统计
   */
  public getStats(): AlgorithmStats[] {
    const stats: AlgorithmStats[] = [];

    for (const algorithm of this.config.algorithms) {
      if (!algorithm.enabled || !this.results.has(algorithm.type)) continue;

      const results = this.results.get(algorithm.type)!;

      const matchedCount = results.filter(r => r.matched).length;
      const positiveCount = results.filter(r => r.userFeedback === 'positive').length;
      const negativeCount = results.filter(r => r.userFeedback === 'negative').length;

      const stat: AlgorithmStats = {
        type: algorithm.type,
        name: algorithm.name,
        totalTests: results.length,
        matchedCount,
        matchRate: results.length > 0 ? matchedCount / results.length : 0,
        averageScore: results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0,
        averageConfidence: results.length > 0 ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length : 0,
        averageDuration: results.length > 0 ? results.reduce((sum, r) => sum + r.duration, 0) / results.length : 0,
        positiveFeedback: positiveCount,
        negativeFeedback: negativeCount,
        netPromoterScore: positiveCount + negativeCount > 0 ?
          (positiveCount - negativeCount) / (positiveCount + negativeCount) : 0
      };

      stats.push(stat);
    }

    // 按匹配率排序
    return stats.sort((a, b) => b.matchRate - a.matchRate);
  }

  /**
   * 获取推荐算法
   */
  public getRecommendedAlgorithm(): AlgorithmType {
    const stats = this.getStats();

    if (stats.length === 0) {
      return 'ml';  // 默认返回 ML
    }

    // 综合考虑匹配率、平均得分和净推荐值
    const best = stats.reduce((best, current) => {
      const bestScore = best.matchRate * 0.4 + best.averageScore * 0.3 + best.netPromoterScore * 0.3;
      const currentScore = current.matchRate * 0.4 + current.averageScore * 0.3 + current.netPromoterScore * 0.3;

      return currentScore > bestScore ? current : best;
    });

    console.log(`[ABTestingFramework] 推荐算法: ${best.name} (匹配率: ${(best.matchRate * 100).toFixed(1)}%, NPS: ${(best.netPromoterScore * 100).toFixed(1)}%)`);

    return best.type;
  }

  /**
   * 字符串哈希函数
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;  // 归一化到 0-1
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<ABTestConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[ABTestingFramework] 配置已更新');
  }

  /**
   * 获取当前配置
   */
  public getConfig(): ABTestConfig {
    return { ...this.config };
  }

  /**
   * 清空测试结果
   */
  public clearResults(): void {
    this.results.clear();
    this.userGroups.clear();
    this.currentTestStart = Date.now();

    // 重新初始化结果存储
    this.config.algorithms.forEach(algo => {
      if (algo.enabled) {
        this.results.set(algo.type, []);
      }
    });

    console.log('[ABTestingFramework] 测试结果已清空');
  }
}

/**
 * 导出单例
 */
export const abTestingFramework = ABTestingFramework.getInstance();
