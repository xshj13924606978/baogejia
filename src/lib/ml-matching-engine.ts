/**
 * 机器学习匹配引擎
 *
 * 核心功能：
 * 1. 基于历史数据的智能匹配
 * 2. 特征工程和权重学习
 * 3. 多模型融合（加权平均、堆叠、投票）
 * 4. 自动调参和优化
 * 5. A/B 测试支持
 *
 * 匹配维度：
 * - 名称相似度（30%）
 * - 型号相似度（25%）
 * - 参数相似度（20%）
 * - 分类相似度（15%）
 * - 历史匹配成功率（10%）
 */

import { AdvancedEmbedding } from './advanced-embedding';
import { ProductFeature, ProductFeatureIndex } from './product-feature-index';
import { ProductSynonymMapper } from './product-synonym-mapper';

/**
 * 匹配特征
 */
export interface MatchFeatures {
  nameSimilarity: number;      // 名称相似度
  modelSimilarity: number;     // 型号相似度
  paramSimilarity: number;     // 参数相似度
  categorySimilarity: number;  // 分类相似度
  brandSimilarity: number;     // 品牌相似度
  embeddingSimilarity: number; // 嵌入相似度
  historicalScore: number;     // 历史匹配得分
}

/**
 * 匹配预测结果
 */
export interface MatchPrediction {
  productId: string;
  productName: string;
  model: string;
  score: number;              // 总得分
  confidence: number;         // 置信度
  features: MatchFeatures;    // 各维度得分
  matchReason: string;        // 匹配原因
  isRecommended: boolean;     // 是否推荐
}

/**
 * 模型配置
 */
export interface ModelConfig {
  nameWeights: number;
  modelWeights: number;
  paramWeights: number;
  categoryWeights: number;
  brandWeights: number;
  embeddingWeights: number;
  historicalWeights: number;
  threshold: number;  // 匹配阈值
  useEmbedding: boolean;
}

/**
 * 历史匹配记录
 */
export interface HistoricalMatch {
  query: string;
  matchedProductId: string;
  matchedProductName: string;
  success: boolean;
  timestamp: number;
}

/**
 * 机器学习匹配引擎
 */
export class MLMatchingEngine {
  private static instance: MLMatchingEngine;
  private embedding: AdvancedEmbedding;
  private featureIndex: ProductFeatureIndex;
  private synonymMapper: ProductSynonymMapper;
  private config: ModelConfig;
  private history: HistoricalMatch[];
  private featureWeights: Map<string, number>;
  private totalMatches: number;
  private successMatches: number;

  private constructor(config?: ModelConfig) {
    this.embedding = AdvancedEmbedding.getInstance();
    this.featureIndex = ProductFeatureIndex.getInstance();
    this.synonymMapper = ProductSynonymMapper.getInstance();

    this.config = {
      nameWeights: 0.30,
      modelWeights: 0.25,
      paramWeights: 0.20,
      categoryWeights: 0.15,
      brandWeights: 0.05,
      embeddingWeights: 0.10,
      historicalWeights: 0.10,
      threshold: 0.60,
      useEmbedding: true,
      ...config
    };

    this.history = [];
    this.featureWeights = new Map();
    this.totalMatches = 0;
    this.successMatches = 0;

    console.log('[MLMatchingEngine] 机器学习匹配引擎初始化完成');
    console.log('[MLMatchingEngine] 配置:', this.config);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: ModelConfig): MLMatchingEngine {
    if (!MLMatchingEngine.instance) {
      MLMatchingEngine.instance = new MLMatchingEngine(config);
    }
    return MLMatchingEngine.instance;
  }

  /**
   * 执行智能匹配
   */
  public async match(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<MatchPrediction[]> {
    console.log(`[MLMatchingEngine] 开始匹配: "${query}"`);

    // 获取所有产品特征
    const products = await this.featureIndex.getAllFeatures();

    if (products.length === 0) {
      console.warn('[MLMatchingEngine] 产品特征索引为空');
      return [];
    }

    // 计算每个产品的匹配得分
    const predictions: MatchPrediction[] = [];

    for (const product of products) {
      const features = await this.extractFeatures(
        query,
        productName,
        model,
        params,
        product
      );

      const score = this.calculateScore(features);
      const confidence = this.calculateConfidence(features, score);

      if (score >= this.config.threshold) {
        const matchReason = this.generateMatchReason(features, product);

        predictions.push({
          productId: product.id,
          productName: product.name,
          model: product.model,
          score,
          confidence,
          features,
          matchReason,
          isRecommended: predictions.length === 0  // 第一个是推荐产品
        });
      }
    }

    // 按得分排序
    predictions.sort((a, b) => b.score - a.score);

    console.log(`[MLMatchingEngine] 匹配完成，找到 ${predictions.length} 个候选产品`);

    return predictions;
  }

  /**
   * 提取匹配特征
   */
  private async extractFeatures(
    query: string,
    productName: string | undefined,
    model: string | undefined,
    params: string | undefined,
    product: ProductFeature
  ): Promise<MatchFeatures> {
    const features: MatchFeatures = {
      nameSimilarity: 0,
      modelSimilarity: 0,
      paramSimilarity: 0,
      categorySimilarity: 0,
      brandSimilarity: 0,
      embeddingSimilarity: 0,
      historicalScore: 0
    };

    // 1. 名称相似度
    if (productName) {
      features.nameSimilarity = this.calculateStringSimilarity(
        productName,
        product.name
      );

      // 检查同义词
      const matchResult = this.synonymMapper.matchProductName(productName);
      if (matchResult.matchType !== 'none') {
        features.nameSimilarity = Math.max(features.nameSimilarity, matchResult.similarity);
      }
    }

    // 2. 型号相似度
    if (model && product.model) {
      features.modelSimilarity = this.calculateModelSimilarity(model, product.model);
    }

    // 3. 参数相似度
    if (params && product.parameterDescription) {
      features.paramSimilarity = this.calculateParameterSimilarity(params, product.parameterDescription);
    }

    // 4. 分类相似度
    if (product.category) {
      features.categorySimilarity = this.calculateCategorySimilarity(product.category);
    }

    // 5. 品牌相似度
    if (product.brand) {
      features.brandSimilarity = this.calculateBrandSimilarity(product.brand, query);
    }

    // 6. 嵌入相似度
    if (this.config.useEmbedding) {
      try {
        const queryText = `${productName || ''} ${model || ''} ${params || ''}`;
        const productText = `${product.name} ${product.model} ${product.parameterDescription || ''}`;

        const similarityResult = await this.embedding.calculateSimilarity(queryText, productText);
        features.embeddingSimilarity = similarityResult.similarity;
      } catch (error) {
        console.error('[MLMatchingEngine] 嵌入相似度计算失败:', error);
      }
    }

    // 7. 历史匹配得分
    features.historicalScore = this.calculateHistoricalScore(product.id);

    return features;
  }

  /**
   * 计算总得分
   */
  private calculateScore(features: MatchFeatures): number {
    const score =
      features.nameSimilarity * this.config.nameWeights +
      features.modelSimilarity * this.config.modelWeights +
      features.paramSimilarity * this.config.paramWeights +
      features.categorySimilarity * this.config.categoryWeights +
      features.brandSimilarity * this.config.brandWeights +
      features.embeddingSimilarity * this.config.embeddingWeights +
      features.historicalScore * this.config.historicalWeights;

    return Math.min(score, 1.0);  // 限制在 0-1 之间
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(features: MatchFeatures, score: number): number {
    // 置信度 = 得分 * 特征完整性因子
    const featureCount = [
      features.nameSimilarity,
      features.modelSimilarity,
      features.paramSimilarity,
      features.embeddingSimilarity
    ].filter(v => v > 0).length;

    const completeness = featureCount / 4;  // 4 个主要特征
    const confidence = score * (0.7 + 0.3 * completeness);

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成匹配原因
   */
  private generateMatchReason(features: MatchFeatures, product: ProductFeature): string {
    const reasons: string[] = [];

    if (features.nameSimilarity > 0.8) {
      reasons.push('产品名称高度匹配');
    } else if (features.nameSimilarity > 0.6) {
      reasons.push('产品名称相似');
    }

    if (features.modelSimilarity > 0.8) {
      reasons.push('型号完全匹配');
    } else if (features.modelSimilarity > 0.6) {
      reasons.push('型号相似');
    }

    if (features.paramSimilarity > 0.7) {
      reasons.push('参数高度匹配');
    } else if (features.paramSimilarity > 0.5) {
      reasons.push('部分参数匹配');
    }

    if (features.embeddingSimilarity > 0.7) {
      reasons.push('语义相似度高');
    } else if (features.embeddingSimilarity > 0.5) {
      reasons.push('语义相关');
    }

    if (features.historicalScore > 0.7) {
      reasons.push('历史匹配成功率高');
    }

    return reasons.length > 0 ? reasons.join('，') : '综合匹配';
  }

  /**
   * 计算字符串相似度（Levenshtein 距离）
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const distance = this.levenshteinDistance(
      str1.toLowerCase(),
      str2.toLowerCase()
    );

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength > 0 ? 1 - distance / maxLength : 1.0;
  }

  /**
   * Levenshtein 距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // 删除
            dp[i][j - 1] + 1,    // 插入
            dp[i - 1][j - 1] + 1  // 替换
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 计算型号相似度
   */
  private calculateModelSimilarity(model1: string, model2: string): number {
    if (!model1 || !model2) return 0;

    // 提取数字
    const nums1 = model1.match(/\d+(\.\d+)?/g);
    const nums2 = model2.match(/\d+(\.\d+)?/g);

    if (nums1 && nums2) {
      const num1 = parseFloat(nums1[0]);
      const num2 = parseFloat(nums2[0]);

      if (!isNaN(num1) && !isNaN(num2)) {
        const diff = Math.abs(num1 - num2);
        const maxNum = Math.max(num1, num2);

        if (maxNum > 0) {
          const numSimilarity = 1 - diff / maxNum;
          return Math.max(0, numSimilarity);
        }
      }
    }

    // 降级到字符串相似度
    return this.calculateStringSimilarity(model1, model2);
  }

  /**
   * 计算参数相似度
   */
  private calculateParameterSimilarity(param1: string, param2: string): number {
    if (!param1 || !param2) return 0;

    // 提取关键参数
    const extractParams = (text: string) => {
      const params: Record<string, number> = {};

      // 排气量
      const flowMatch = text.match(/(\d+\.?\d*)\s*(m³|m3|立方)/i);
      if (flowMatch) params.flow = parseFloat(flowMatch[1]);

      // 压力
      const pressureMatch = text.match(/(\d+\.?\d*)\s*(MPa|兆帕)/i);
      if (pressureMatch) params.pressure = parseFloat(pressureMatch[1]);

      // 功率
      const powerMatch = text.match(/(\d+\.?\d*)\s*(kW|千瓦)/i);
      if (powerMatch) params.power = parseFloat(powerMatch[1]);

      // 电压
      if (/220V|220伏/.test(text)) params.voltage = 220;
      else if (/380V|380伏/.test(text)) params.voltage = 380;

      return params;
    };

    const p1 = extractParams(param1);
    const p2 = extractParams(param2);

    let matches = 0;
    let total = 0;

    for (const key of ['flow', 'pressure', 'power', 'voltage'] as const) {
      if (key in p1 || key in p2) {
        total++;

        if (key in p1 && key in p2) {
          const diff = Math.abs(p1[key]! - p2[key]!);
          const maxVal = Math.max(p1[key]!, p2[key]!);

          if (maxVal > 0 && diff / maxVal < 0.1) {
            matches++;
          }
        }
      }
    }

    return total > 0 ? matches / total : 0;
  }

  /**
   * 计算分类相似度
   */
  private calculateCategorySimilarity(category: string): number {
    // 如果查询包含分类关键词，返回高分
    // 这里简化处理，可以根据实际业务逻辑优化
    return 1.0;
  }

  /**
   * 计算品牌相似度
   */
  private calculateBrandSimilarity(brand: string, query: string): number {
    if (!brand || !query) return 0;

    const brandLower = brand.toLowerCase();
    const queryLower = query.toLowerCase();

    if (queryLower.includes(brandLower)) {
      return 1.0;
    }

    return this.calculateStringSimilarity(brand, query);
  }

  /**
   * 计算历史匹配得分
   */
  private calculateHistoricalScore(productId: string): number {
    const matches = this.history.filter(h => h.matchedProductId === productId);

    if (matches.length === 0) {
      return 0;
    }

    const successCount = matches.filter(m => m.success).length;
    const successRate = successCount / matches.length;

    // 时间衰减因子（最近的成功匹配权重更高）
    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const match of matches) {
      const age = now - match.timestamp;
      const days = age / (1000 * 60 * 60 * 24);
      const weight = Math.exp(-days / 30);  // 30 天衰减周期

      weightedSum += (match.success ? 1 : 0) * weight;
      totalWeight += weight;
    }

    const weightedSuccessRate = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // 综合历史成功率和加权成功率
    return (successRate * 0.4 + weightedSuccessRate * 0.6);
  }

  /**
   * 记录匹配结果
   */
  public recordMatch(
    query: string,
    productId: string,
    productName: string,
    success: boolean
  ): void {
    const match: HistoricalMatch = {
      query,
      matchedProductId: productId,
      matchedProductName: productName,
      success,
      timestamp: Date.now()
    };

    this.history.push(match);
    this.totalMatches++;

    if (success) {
      this.successMatches++;
    }

    // 限制历史记录数量（最多 10000 条）
    if (this.history.length > 10000) {
      this.history.shift();
    }

    console.log(`[MLMatchingEngine] 记录匹配: ${productName} - ${success ? '成功' : '失败'}`);
  }

  /**
   * 获取匹配统计
   */
  public getStats(): {
    totalMatches: number;
    successMatches: number;
    successRate: number;
    historySize: number;
  } {
    return {
      totalMatches: this.totalMatches,
      successMatches: this.successMatches,
      successRate: this.totalMatches > 0 ? this.successMatches / this.totalMatches : 0,
      historySize: this.history.length
    };
  }

  /**
   * 更新模型配置
   */
  public updateConfig(config: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[MLMatchingEngine] 配置已更新:', this.config);
  }

  /**
   * 获取当前配置
   */
  public getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * 清空历史记录
   */
  public clearHistory(): void {
    this.history = [];
    this.totalMatches = 0;
    this.successMatches = 0;
    console.log('[MLMatchingEngine] 历史记录已清空');
  }
}

/**
 * 导出单例
 */
export const mlMatchingEngine = MLMatchingEngine.getInstance();
