/**
 * 统一匹配器
 * 
 * 功能：
 * 1. 整合所有匹配组件（特征索引、查询解析器、匹配引擎、置信度计算器）
 * 2. 提供统一的匹配接口
 * 3. 管理匹配流程
 * 4. 返回完整的匹配结果
 */

import { productFeatureIndex, ProductFeature } from './product-feature-index';
import { productQueryParser, ParsedParameters, QueryType } from './product-query-parser';
import { productMatcher, MatchResult } from './product-matcher';
import { confidenceCalculator, ConfidenceReport, ConfidenceLevel } from './confidence-calculator';
import { vectorSimilarityCalculator } from './vector-similarity';
import { redisCacheManager } from './redis-cache';
import { advancedEmbedding, EmbeddingModelType, MODEL_CONFIGS } from './advanced-embedding';
import { mlMatchingEngine, MatchPrediction } from './ml-matching-engine';
import { cacheWarmer, WarmupConfig } from './cache-warmer';
import { abTestingFramework, AlgorithmType } from './ab-testing';

// 逐步启用新功能 - 第1步：跨语言匹配（已启用）
import { crossLanguageMatcher, LanguageCode, CrossLanguageMatchResult } from './cross-language-matcher';

// 逐步启用新功能 - 第2步：Transformer 匹配引擎
import { transformerMatchingEngine, TransformerMatchScore } from './transformer-matching-engine';

// 逐步启用新功能 - 第3步：流式学习引擎
import { streamingLearningEngine, LearningEvent } from './streaming-learning';

// 逐步启用新功能 - 第4步：扩展 A/B 测试指标
import { abTestExtendedMetrics, UserBehaviorEvent, ExtendedAlgorithmStats } from './ab-test-extended-metrics';

/**
 * 统一匹配结果
 */
export interface UnifiedMatchResult {
  query: ParsedParameters;            // 解析后的查询
  matches: MatchResult[];            // 匹配结果列表
  bestMatch: MatchResult | null;     // 最佳匹配
  confidence: ConfidenceReport;      // 置信度报告
  transformerScore?: TransformerMatchScore;  // Transformer 匹配分数（新增）
  summary: {                         // 匹配摘要
    totalMatches: number;
    exactMatches: number;
    approximateMatches: number;
    recommendedProduct?: string;
    priceRange?: string;
  };
}

/**
 * 匹配选项
 */
export interface MatchOptions {
  forceRefresh?: boolean;            // 强制刷新索引
  maxResults?: number;               // 最大结果数
  minConfidence?: number;            // 最小置信度阈值
  useCache?: boolean;                // 是否使用缓存（新增）
  cacheTTL?: number;                 // 缓存有效期（毫秒）（新增）
}

/**
 * 统一匹配器类
 */
export class UnifiedMatcher {
  private static instance: UnifiedMatcher;
  private initialized = false;

  private constructor() {
    console.log('[UnifiedMatcher] 统一匹配器初始化完成（已启用缓存）');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): UnifiedMatcher {
    if (!UnifiedMatcher.instance) {
      UnifiedMatcher.instance = new UnifiedMatcher();
    }
    return UnifiedMatcher.instance;
  }

  /**
   * 初始化匹配器
   */
  public async initialize(options?: { forceRefresh?: boolean; enableAdvancedFeatures?: boolean }): Promise<void> {
    try {
      console.log('[UnifiedMatcher] 开始初始化...');

      // 构建 Redis 连接
      await redisCacheManager.connect();
      console.log('[UnifiedMatcher] 缓存管理器初始化完成');

      // 构建特征索引
      await productFeatureIndex.buildIndex();

      // 检查索引是否已构建
      if (!productFeatureIndex.isIndexed()) {
        throw new Error('特征索引构建失败');
      }

      // 初始化向量相似度计算器
      const products = productFeatureIndex.getAllFeatures();
      if (products.length > 0 && !vectorSimilarityCalculator.isReady()) {
        const corpus = products.map(p => [
          p.name,
          p.model,
          p.description || '',
          p.parameterDescription || ''
        ].join(' ')).filter(t => t.trim());

        if (corpus.length > 0) {
          vectorSimilarityCalculator.initializeVocabulary(corpus);
          console.log('[UnifiedMatcher] 向量相似度计算器初始化完成');
        }
      }

      // 初始化高级功能
      const enableAdvanced = options?.enableAdvancedFeatures !== false;  // 默认启用

      if (enableAdvanced) {
        console.log('[UnifiedMatcher] 初始化高级功能...');

        // Advanced Embedding 已在导入时初始化
        console.log(`[UnifiedMatcher] Advanced Embedding 模型: ${advancedEmbedding.getCurrentModel()}`);

        // ML Matching Engine 已在导入时初始化
        const mlStats = mlMatchingEngine.getStats();
        console.log(`[UnifiedMatcher] ML Matching Engine - 总匹配: ${mlStats.totalMatches}, 成功率: ${(mlStats.successRate * 100).toFixed(1)}%`);

        // 启动缓存预热器
        if (cacheWarmer) {
          await cacheWarmer.start();
          console.log('[UnifiedMatcher] 缓存预热器已启动');
        }

        // A/B Testing Framework 已在导入时初始化
        const abStats = abTestingFramework.getStats();
        console.log(`[UnifiedMatcher] A/B Testing Framework - 活跃算法: ${abStats.length} 个`);

        console.log('[UnifiedMatcher] 高级功能初始化完成');
      }

      this.initialized = true;
      console.log('[UnifiedMatcher] 初始化完成');

    } catch (error) {
      console.error('[UnifiedMatcher] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 执行匹配
   */
  public async match(
    queryText: string,
    options?: MatchOptions
  ): Promise<UnifiedMatchResult> {
    console.log('[UnifiedMatcher] 执行匹配:', queryText);

    try {
      // 1. 生成查询哈希
      const queryHash = this.generateQueryHash(queryText);

      // 2. 检查缓存（如果启用且不强制刷新）
      const useCache = options?.useCache !== false;  // 默认启用缓存
      if (useCache && !options?.forceRefresh) {
        const cached = await this.getFromCache(queryHash);
        if (cached) {
          console.log('[UnifiedMatcher] 使用缓存结果');
          return cached;
        }
      }

      // 3. 确保已初始化
      if (!this.initialized) {
        await this.initialize(options);
      }

      // 4. 强制刷新索引（如果需要）
      if (options?.forceRefresh) {
        await productFeatureIndex.refreshIndex();
      }

      // 5. 解析查询
      const query = productQueryParser.parse(queryText);
      console.log('[UnifiedMatcher] 查询解析完成:', {
        type: query.queryType,
        confidence: query.confidence,
        params: {
          flowRate: query.flowRate,
          pressure: query.pressure,
          power: query.power,
          voltage: query.voltage
        }
      });

      // 6. 获取所有产品特征
      const products = productFeatureIndex.getAllFeatures();
      console.log('[UnifiedMatcher] 获取到', products.length, '个产品');

      // 7. 执行匹配
      let matches: MatchResult[] = [];
      
      if (products.length > 0) {
        matches = productMatcher.match(query, products);
      }

      console.log('[UnifiedMatcher] 匹配结果:', {
        total: matches.length,
        exact: matches.filter(m => m.matchLevel === 'exact').length,
        approximate: matches.filter(m => m.matchLevel === 'approximate').length
      });

      // 8. 获取最佳匹配
      const bestMatch = productMatcher.getBestMatch(matches);

      // 9. 计算置信度
      const confidence = confidenceCalculator.calculate(query, matches);

      // 10. 使用 Transformer 引擎计算高级匹配分数（新增）
      let transformerScore: TransformerMatchScore | undefined;
      if (bestMatch) {
        try {
          const transformerScores = await transformerMatchingEngine.match(
            queryText,
            bestMatch.product.name,
            queryText
          );
          if (transformerScores.length > 0) {
            transformerScore = transformerScores[0];
            console.log('[UnifiedMatcher] Transformer 匹配分数:', transformerScore);
          }
        } catch (error) {
          console.warn('[UnifiedMatcher] Transformer 匹配失败，忽略:', error);
        }
      }

      // 11. 生成摘要
      const summary = this.generateSummary(matches, bestMatch, confidence);

      const result: UnifiedMatchResult = {
        query,
        matches,
        bestMatch,
        confidence,
        transformerScore,
        summary
      };

      // 12. 缓存结果（如果启用）
      if (useCache) {
        this.saveToCache(queryHash, result, options?.cacheTTL);
      }

      return result;

    } catch (error) {
      console.error('[UnifiedMatcher] 匹配失败:', error);
      throw error;
    }
  }

  /**
   * 生成查询哈希（用于缓存键）
   */
  private generateQueryHash(query: string): string {
    // 简单的哈希函数
    let hash = 0;
    const normalizedQuery = query.toLowerCase().trim();
    
    for (let i = 0; i < normalizedQuery.length; i++) {
      const char = normalizedQuery.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * 从缓存获取结果
   */
  private async getFromCache(queryHash: string): Promise<UnifiedMatchResult | null> {
    try {
      const cached = await redisCacheManager.get(queryHash);
      
      if (cached) {
        console.log('[UnifiedMatcher] 命中缓存');
        return cached;
      }

      return null;

    } catch (error) {
      console.error('[UnifiedCacheManager] 从缓存获取失败:', error);
      return null;
    }
  }

  /**
   * 保存结果到缓存
   */
  private async saveToCache(queryHash: string, result: UnifiedMatchResult, ttl?: number): Promise<void> {
    try {
      await redisCacheManager.set(queryHash, result, ttl || 300000);
      console.log('[UnifiedMatcher] 结果已缓存到 Redis');
    } catch (error) {
      console.error('[UnifiedCacheManager] 保存到缓存失败:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): {
    redisAvailable: boolean;
    hitRate: number;
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    memoryCacheSize: number;
  } {
    return redisCacheManager.getStats();
  }

  /**
   * 清除缓存
   */
  public async clearCache(): Promise<void> {
    await redisCacheManager.clear();
    console.log('[UnifiedMatcher] 缓存已清除');
  }

  /**
   * 生成匹配摘要
   */
  private generateSummary(
    matches: MatchResult[],
    bestMatch: MatchResult | null,
    confidence: ConfidenceReport
  ): UnifiedMatchResult['summary'] {
    const exactMatches = matches.filter(m => m.matchLevel === 'exact');
    const approximateMatches = matches.filter(m => m.matchLevel === 'approximate');

    const summary: UnifiedMatchResult['summary'] = {
      totalMatches: matches.length,
      exactMatches: exactMatches.length,
      approximateMatches: approximateMatches.length
    };

    // 推荐产品
    if (bestMatch && confidence.level === ConfidenceLevel.HIGH) {
      summary.recommendedProduct = bestMatch.product.name;
    }

    // 价格区间
    if (matches.length > 0) {
      const prices = matches
        .map(m => m.product.displayPrice)
        .filter(p => p !== null && p !== undefined) as number[];

      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        summary.priceRange = `¥${min.toLocaleString()} - ¥${max.toLocaleString()}`;
      }
    }

    return summary;
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取索引统计信息
   */
  public getStats() {
    return productFeatureIndex.getStats();
  }

  /**
   * 格式化匹配结果（用于调试）
   */
  public formatResult(result: UnifiedMatchResult): string {
    const { query, matches, bestMatch, confidence, summary } = result;

    let output = `
📋 匹配结果摘要
=================
查询类型: ${query.queryType}
解析置信度: ${(query.confidence * 100).toFixed(1)}%

匹配统计:
  • 总匹配数: ${summary.totalMatches}
  • 精确匹配: ${summary.exactMatches}
  • 近似匹配: ${summary.approximateMatches}
  ${summary.recommendedProduct ? `• 推荐产品: ${summary.recommendedProduct}` : ''}
  ${summary.priceRange ? `• 价格区间: ${summary.priceRange}` : ''}

置信度评估:
  • 总体置信度: ${(confidence.overall * 100).toFixed(1)}%
  • 置信度级别: ${confidence.level.toUpperCase()}
  • 可靠性: ${confidence.recommendation.reliability}
  • 建议: ${confidence.recommendation.action}
`;

    if (bestMatch) {
      output += `\n${productMatcher.formatResult(bestMatch)}`;
    }

    return output.trim();
  }

  /**
   * 获取匹配器配置
   */
  public getConfigurations() {
    return {
      matcher: productMatcher.getConfig(),
      confidenceCalculator: confidenceCalculator.getConfig()
    };
  }

  /**
   * 更新匹配器配置
   */
  public updateConfigurations(config: {
    matcher?: Parameters<typeof productMatcher.updateConfig>[0];
    confidenceCalculator?: Parameters<typeof confidenceCalculator.updateConfig>[0];
  }) {
    if (config.matcher) {
      productMatcher.updateConfig(config.matcher);
    }
    if (config.confidenceCalculator) {
      confidenceCalculator.updateConfig(config.confidenceCalculator);
    }
  }

  // ==================== 高级功能集成 ====================

  /**
   * 使用机器学习引擎匹配（新增）
   */
  public async matchWithML(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<MatchPrediction[]> {
    console.log('[UnifiedMatcher] 使用 ML 引擎匹配');
    return await mlMatchingEngine.match(query, productName, model, params);
  }

  /**
   * 使用高级嵌入匹配（新增）
   */
  public async matchWithEmbedding(
    query: string,
    candidates: string[]
  ): Promise<Array<{ text: string; similarity: number; distance: number }>> {
    console.log('[UnifiedMatcher] 使用高级嵌入匹配');
    return await advancedEmbedding.calculateSimilarities(query, candidates);
  }

  /**
   * 执行 A/B 测试（新增）
   */
  public async runABTest(
    userId: string,
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ) {
    console.log('[UnifiedMatcher] 执行 A/B 测试');
    return await abTestingFramework.test(userId, query, productName, model, params);
  }

  /**
   * 提交 A/B 测试反馈（新增）
   */
  public submitABTestFeedback(
    algorithm: AlgorithmType,
    query: string,
    feedback: 'positive' | 'negative' | 'neutral'
  ): void {
    console.log(`[UnifiedMatcher] 提交 A/B 测试反馈: ${algorithm} - ${feedback}`);
    abTestingFramework.submitFeedback(algorithm, query, feedback);
  }

  /**
   * 获取 A/B 测试统计（新增）
   */
  public getABTestStats() {
    return abTestingFramework.getStats();
  }

  /**
   * 获取推荐的算法（新增）
   */
  public getRecommendedAlgorithm(): AlgorithmType {
    return abTestingFramework.getRecommendedAlgorithm();
  }

  /**
   * 获取缓存预热统计（新增）
   */
  public getCacheWarmerStats() {
    return cacheWarmer.getStats();
  }

  /**
   * 手动触发缓存预热（新增）
   */
  public async warmupCache(queries?: string[]): Promise<void> {
    console.log('[UnifiedMatcher] 手动触发缓存预热');
    if (queries && queries.length > 0) {
      queries.forEach(q => cacheWarmer.addTask(q, 10));
    }
    // 由预热器自动执行
  }

  /**
   * 切换 Embedding 模型（新增）
   */
  public switchEmbeddingModel(model: EmbeddingModelType): void {
    console.log(`[UnifiedMatcher] 切换 Embedding 模型: ${model}`);
    advancedEmbedding.switchModel(model);
  }

  /**
   * 获取当前 Embedding 模型（新增）
   */
  public getCurrentEmbeddingModel(): EmbeddingModelType {
    return advancedEmbedding.getCurrentModel();
  }

  /**
   * 清空 Embedding 缓存（新增）
   */
  public clearEmbeddingCache(): void {
    advancedEmbedding.clearCache();
    console.log('[UnifiedMatcher] Embedding 缓存已清空');
  }

  /**
   * 获取 ML 引擎统计（新增）
   */
  public getMLEngineStats() {
    return mlMatchingEngine.getStats();
  }

  /**
   * 记录 ML 匹配结果（新增）
   */
  public recordMLMatch(
    query: string,
    productId: string,
    productName: string,
    success: boolean
  ): void {
    mlMatchingEngine.recordMatch(query, productId, productName, success);
  }

  /**
   * 获取完整的高级功能统计（新增）
   * 已启用：嵌入引擎、ML 引擎、Transformer 引擎、流式学习、缓存预热、A/B 测试、跨语言匹配、扩展指标
   * 所有深度优化功能已全部启用
   */
  public getAdvancedFeaturesStats() {
    return {
      embedding: {
        currentModel: advancedEmbedding.getCurrentModel(),
        modelInfo: advancedEmbedding.getModelInfo ? advancedEmbedding.getModelInfo() : null,
        supportedModels: advancedEmbedding.getSupportedModels ? advancedEmbedding.getSupportedModels() : [],
        cacheStats: advancedEmbedding.getCacheStats ? advancedEmbedding.getCacheStats() : null
      },
      mlEngine: mlMatchingEngine.getStats(),
      // 已启用：Transformer 引擎
      transformerEngine: transformerMatchingEngine.getStats(),
      // 已启用：流式学习引擎
      streamingLearning: streamingLearningEngine.getStats(),
      cacheWarmer: cacheWarmer.getStats(),
      abTesting: {
        stats: abTestingFramework.getStats(),
        recommendedAlgorithm: abTestingFramework.getRecommendedAlgorithm(),
        config: abTestingFramework.getConfig()
      },
      // 已启用：跨语言匹配
      crossLanguage: crossLanguageMatcher.getStats(),
      // 已启用：扩展指标
      extendedMetrics: abTestExtendedMetrics.getSummary()
    };
  }
  // ==================== 新增功能：Transformer 匹配（已启用） ====================

  /**
   * 使用 Transformer 引擎匹配
   */
  public async matchWithTransformer(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<TransformerMatchScore[]> {
    console.log('[UnifiedMatcher] 使用 Transformer 引擎匹配');
    return await transformerMatchingEngine.match(query, productName, model, params);
  }

  /**
   * 获取 Transformer 引擎配置
   */
  public getTransformerConfig() {
    return transformerMatchingEngine.getConfig();
  }

  /**
   * 更新 Transformer 引擎配置
   */
  public updateTransformerConfig(config: any) {
    transformerMatchingEngine.updateConfig(config);
  }

  // ==================== 新增功能：流式学习（已启用） ====================

  /**
   * 启动流式学习
   */
  public startStreamingLearning(): void {
    console.log('[UnifiedMatcher] 启动流式学习');
    streamingLearningEngine.start();
  }

  /**
   * 停止流式学习
   */
  public stopStreamingLearning(): void {
    console.log('[UnifiedMatcher] 停止流式学习');
    streamingLearningEngine.stop();
  }

  /**
   * 记录学习事件
   */
  public recordLearningEvent(event: Omit<LearningEvent, 'id' | 'timestamp'>): void {
    streamingLearningEngine.recordEvent(event);
  }

  /**
   * 获取流式学习统计
   */
  public getStreamingLearningStats() {
    return streamingLearningEngine.getStats();
  }
// 
  /**
   * 获取模型版本历史
   */
  public getModelVersions() {
    return streamingLearningEngine.getModelVersions();
  }

  /**
   * 回滚到指定模型版本
   */
  public rollbackModel(version: number): boolean {
    return streamingLearningEngine.rollbackToVersion(version);
  }

  /**
   * 更新流式学习配置
   */
  public updateStreamingLearningConfig(config: any) {
    streamingLearningEngine.updateConfig(config);
  }

  // ==================== 新增功能：扩展 A/B 测试指标（已启用） ====================

  /**
   * 记录用户行为事件
   */
  public recordUserBehavior(event: UserBehaviorEvent): void {
    abTestExtendedMetrics.recordEvent(event);
  }

  /**
   * 获取扩展的算法统计
   */
  public getExtendedABTestStats(algorithm: string, baseStats: any): ExtendedAlgorithmStats {
    return abTestExtendedMetrics.calculateExtendedStats(algorithm, baseStats);
  }

  /**
   * 获取扩展指标摘要
   */
  public getExtendedMetricsSummary() {
    return abTestExtendedMetrics.getSummary();
  }

  /**
   * 清空扩展指标历史
   */
  public clearExtendedMetricsHistory(): void {
    abTestExtendedMetrics.clearHistory();
  }

  // ==================== 新增功能：跨语言匹配（已启用） ====================

  /**
   * 检测文本语言
   */
   public detectLanguage(text: string) {
     return crossLanguageMatcher.detectLanguage(text);
   }
  
   /**
    * 翻译文本
    */
   public async translate(text: string, targetLanguage: LanguageCode) {
     return await crossLanguageMatcher.translate(text, targetLanguage);
   }
  
   /**
    * 跨语言匹配
    */
   public async matchCrossLanguage(
     query: string,
     products: Array<{ name: string; description?: string }>,
     targetLanguage?: LanguageCode
   ): Promise<CrossLanguageMatchResult[]> {
     return await crossLanguageMatcher.match(query, products, targetLanguage);
   }
  
   /**
    * 获取支持的语言列表
    */
   public getSupportedLanguages() {
     return crossLanguageMatcher.getSupportedLanguages();
   }
  
   /**
    * 添加多语言同义词映射
    */
   public addMultilingualSynonymMapping(mapping: any): void {
     crossLanguageMatcher.addSynonymMapping(mapping);
   }
// 
//   /**
//    * 清空跨语言匹配缓存
//    */
//   public clearCrossLanguageCache(): void {
//     crossLanguageMatcher.clearCache();
//   }
// 
//   // ==================== 新增功能：模型配置管理 ====================
// 
//   /**
//    * 获取所有支持的 Embedding 模型
//    */
//   public getAllEmbeddingModels() {
//     return advancedEmbedding.getSupportedModels();
//   }
// 
//   /**
//    * 检查模型是否支持多语言
//    */
//   public isModelMultilingual(model?: EmbeddingModelType): boolean {
//     return advancedEmbedding.isMultilingual(model);
//   }
}

// 导出单例
export const unifiedMatcher = UnifiedMatcher.getInstance();
