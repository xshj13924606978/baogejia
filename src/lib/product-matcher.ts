/**
 * 产品匹配引擎
 * 
 * 功能：
 * 1. 实现产品匹配的核心算法
 * 2. 计算查询参数与产品特征的相似度
 * 3. 支持多种匹配模式（精确匹配、模糊匹配、语义匹配）
 * 4. 返回排序后的匹配结果
 */

import { ProductFeature } from './product-feature-index';
import { ParsedParameters } from './product-query-parser';
import { vectorSimilarityCalculator, SimilarityResult } from './vector-similarity';

/**
 * 匹配结果
 */
export interface MatchResult {
  product: ProductFeature;
  score: number;              // 匹配得分 (0-1)
  matchDetails: {
    flowRateScore: number;    // 排气量匹配得分
    pressureScore: number;    // 压力匹配得分
    powerScore: number;       // 功率匹配得分
    voltageScore: number;     // 电压匹配得分
    controlScore: number;     // 控制方式匹配得分
    tankScore: number;        // 储气罐匹配得分
    semanticScore?: number;   // 语义匹配得分（新增）
  };
  matchLevel: 'exact' | 'approximate' | 'other';  // 匹配级别
  mismatches: string[];      // 不匹配的参数列表
  similarityFactors?: string[];  // 相似度因素（新增）
}

/**
 * 匹配配置
 */
export interface MatchConfig {
  // 匹配模式
  exactMatchThreshold: number;     // 精确匹配阈值 (0-1)
  approximateThreshold: number;    // 近似匹配阈值 (0-1)

  // 权重配置
  flowRateWeight: number;
  pressureWeight: number;
  powerWeight: number;
  voltageWeight: number;
  controlWeight: number;
  tankWeight: number;
  semanticWeight?: number;         // 语义匹配权重（新增）

  // 容差配置
  flowRateTolerance: number;       // 排气量容差 (m³/min)
  pressureTolerance: number;       // 压力容差 (MPa)
  powerTolerance: number;          // 功率容差 (KW)

  // 语义匹配配置（新增）
  enableSemanticMatching: boolean; // 是否启用语义匹配
  semanticThreshold: number;       // 语义匹配阈值
}

/**
 * 产品匹配引擎类
 */
export class ProductMatcher {
  private config: MatchConfig;

  constructor(config?: Partial<MatchConfig>) {
    this.config = {
      exactMatchThreshold: 0.85,
      approximateThreshold: 0.6,

      flowRateWeight: 0.35,
      pressureWeight: 0.30,
      powerWeight: 0.15,
      voltageWeight: 0.10,
      controlWeight: 0.05,
      tankWeight: 0.05,
      semanticWeight: 0.2,          // 新增：语义匹配权重

      flowRateTolerance: 0.1,
      pressureTolerance: 0.1,
      powerTolerance: 1.0,

      enableSemanticMatching: true,  // 新增：启用语义匹配
      semanticThreshold: 0.7,       // 新增：语义匹配阈值

      ...config
    };
    console.log('[ProductMatcher] 匹配引擎初始化完成（已启用语义匹配）');
  }

  /**
   * 匹配产品
   */
  public match(
    query: ParsedParameters,
    products: ProductFeature[]
  ): MatchResult[] {
    console.log(`[ProductMatcher] 开始匹配 ${products.length} 个产品...`);

    const results: MatchResult[] = [];

    // 对每个产品进行匹配
    for (const product of products) {
      const result = this.matchProduct(query, product);
      results.push(result);
    }

    // 按匹配得分排序
    results.sort((a, b) => b.score - a.score);

    // 过滤掉得分过低的结果
    const filtered = results.filter(r => r.score >= this.config.approximateThreshold);

    console.log(`[ProductMatcher] 匹配完成，返回 ${filtered.length} 个结果`);

    return filtered;
  }

  /**
   * 匹配单个产品
   */
  private matchProduct(
    query: ParsedParameters,
    product: ProductFeature
  ): MatchResult {
    const details = {
      flowRateScore: 0,
      pressureScore: 0,
      powerScore: 0,
      voltageScore: 0,
      controlScore: 0,
      tankScore: 0
    };

    const mismatches: string[] = [];

    // 计算各个参数的匹配得分
    // 1. 排气量匹配
    if (query.flowRate !== null && product.flowRate !== null) {
      const diff = Math.abs(query.flowRate - product.flowRate);
      if (diff <= this.config.flowRateTolerance) {
        details.flowRateScore = 1.0;
      } else {
        // 线性衰减
        details.flowRateScore = Math.max(0, 1.0 - (diff / (query.flowRate * 0.5)));
      }
    } else if (query.flowRate !== null) {
      mismatches.push('排气量');
    }

    // 2. 压力匹配
    if (query.pressure !== null && product.pressure !== null) {
      const diff = Math.abs(query.pressure - product.pressure);
      if (diff <= this.config.pressureTolerance) {
        details.pressureScore = 1.0;
      } else {
        // 线性衰减
        details.pressureScore = Math.max(0, 1.0 - (diff / (query.pressure * 0.3)));
      }
    } else if (query.pressure !== null) {
      mismatches.push('压力');
    }

    // 3. 功率匹配
    if (query.power !== null && product.power !== null) {
      const diff = Math.abs(query.power - product.power);
      if (diff <= this.config.powerTolerance) {
        details.powerScore = 1.0;
      } else {
        // 线性衰减
        details.powerScore = Math.max(0, 1.0 - (diff / (query.power * 0.5)));
      }
    } else if (query.power !== null) {
      mismatches.push('功率');
    }

    // 4. 电压匹配
    if (query.voltage !== null && product.voltage !== null) {
      details.voltageScore = query.voltage === product.voltage ? 1.0 : 0.0;
      if (query.voltage !== product.voltage) {
        mismatches.push('电压');
      }
    } else if (query.voltage !== null) {
      mismatches.push('电压');
    }

    // 5. 控制方式匹配
    if (query.controlType !== null && product.controlType !== null) {
      details.controlScore = query.controlType === product.controlType ? 1.0 : 0.5;
      if (query.controlType !== product.controlType) {
        mismatches.push('控制方式');
      }
    }

    // 6. 储气罐匹配
    if (query.tankType !== null && product.tankType !== null) {
      details.tankScore = query.tankType === product.tankType ? 1.0 : 0.5;
      if (query.tankType !== product.tankType) {
        mismatches.push('储气罐');
      }
    }

    // 7. 语义匹配（新增）
    const semanticResult = this.calculateSemanticSimilarity(query, product);
    const similarityFactors: string[] = [];

    if (this.config.enableSemanticMatching && semanticResult.score > 0) {
      (details as any).semanticScore = semanticResult.score;
      similarityFactors.push(...semanticResult.factors);
    }

    // 计算综合得分
    const score = this.calculateWeightedScore(details, query, (details as any).semanticScore);

    // 确定匹配级别
    const matchLevel = this.determineMatchLevel(score, query);

    return {
      product,
      score,
      matchDetails: details,
      matchLevel,
      mismatches,
      similarityFactors: similarityFactors.length > 0 ? similarityFactors : undefined
    };
  }

  /**
   * 计算语义相似度（优化版 - 集成向量相似度）
   */
  private calculateSemanticSimilarity(
    query: ParsedParameters,
    product: ProductFeature
  ): { score: number; factors: string[] } {
    const factors: string[] = [];
    let totalScore = 0;
    let factorCount = 0;

    // 1. 产品类别/名称相似度
    if (query.rawQuery && product.name) {
      let nameSimilarity = 0;
      
      // 优先使用向量相似度
      if (vectorSimilarityCalculator.isReady()) {
        const vectorResult = vectorSimilarityCalculator.calculateSimilarity(query.rawQuery, product.name);
        nameSimilarity = vectorResult.score;
      } else {
        // 降级到文本相似度
        nameSimilarity = this.calculateTextSimilarity(query.rawQuery, product.name);
      }

      if (nameSimilarity >= this.config.semanticThreshold * 0.8) {
        totalScore += nameSimilarity * 0.4;
        factorCount++;
        factors.push(`产品名称相似度: ${(nameSimilarity * 100).toFixed(0)}%`);
      }
    }

    // 2. 产品型号相似度
    if (query.rawQuery && product.model) {
      let modelSimilarity = 0;
      
      // 优先使用向量相似度
      if (vectorSimilarityCalculator.isReady()) {
        const vectorResult = vectorSimilarityCalculator.calculateSimilarity(query.rawQuery, product.model);
        modelSimilarity = vectorResult.score;
      } else {
        // 降级到文本相似度
        modelSimilarity = this.calculateTextSimilarity(query.rawQuery, product.model);
      }

      if (modelSimilarity >= this.config.semanticThreshold) {
        totalScore += modelSimilarity * 0.3;
        factorCount++;
        factors.push(`产品型号相似度: ${(modelSimilarity * 100).toFixed(0)}%`);
      }
    }

    // 3. 描述相似度
    if (query.rawQuery && product.description) {
      let descSimilarity = 0;
      
      // 优先使用向量相似度
      if (vectorSimilarityCalculator.isReady()) {
        const vectorResult = vectorSimilarityCalculator.calculateSimilarity(query.rawQuery, product.description);
        descSimilarity = vectorResult.score;
      } else {
        // 降级到文本相似度
        descSimilarity = this.calculateTextSimilarity(query.rawQuery, product.description);
      }

      if (descSimilarity >= this.config.semanticThreshold * 0.8) {
        totalScore += descSimilarity * 0.2;
        factorCount++;
        factors.push(`描述相似度: ${(descSimilarity * 100).toFixed(0)}%`);
      }
    }

    // 4. 参数描述相似度
    if (query.rawQuery && product.parameterDescription) {
      let paramSimilarity = 0;
      
      // 优先使用向量相似度
      if (vectorSimilarityCalculator.isReady()) {
        const vectorResult = vectorSimilarityCalculator.calculateSimilarity(query.rawQuery, product.parameterDescription);
        paramSimilarity = vectorResult.score;
      } else {
        // 降级到文本相似度
        paramSimilarity = this.calculateTextSimilarity(query.rawQuery, product.parameterDescription);
      }

      if (paramSimilarity >= this.config.semanticThreshold * 0.8) {
        totalScore += paramSimilarity * 0.3;
        factorCount++;
        factors.push(`参数描述相似度: ${(paramSimilarity * 100).toFixed(0)}%`);
      }
    }

    // 计算平均语义得分
    const semanticScore = factorCount > 0 ? totalScore / factorCount : 0;

    return {
      score: semanticScore,
      factors
    };
  }

  /**
   * 计算文本相似度（Jaccard相似度 + Levenshtein距离）
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.tokenizeText(text1.toLowerCase()));
    const words2 = new Set(this.tokenizeText(text2.toLowerCase()));

    if (words1.size === 0 || words2.size === 0) {
      return 0.0;
    }

    // Jaccard 相似度
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccardSimilarity = intersection.size / union.size;

    // Levenshtein 距离（简化版）
    const levenshteinSimilarity = this.calculateLevenshteinSimilarity(text1, text2);

    // 加权平均
    return jaccardSimilarity * 0.6 + levenshteinSimilarity * 0.4;
  }

  /**
   * 分词（中文 + 英文）
   */
  private tokenizeText(text: string): string[] {
    // 中文分词（简单按字符拆分）
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    
    // 英文/数字分词
    const englishWords = text.match(/[a-zA-Z0-9]+/g) || [];

    return [...chineseChars, ...englishWords];
  }

  /**
   * 计算 Levenshtein 相似度
   */
  private calculateLevenshteinSimilarity(text1: string, text2: string): number {
    const len1 = text1.length;
    const len2 = text2.length;

    if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
    if (len2 === 0) return 0.0;

    // 简化版：只计算前100个字符
    const limit = 100;
    const s1 = text1.substring(0, limit);
    const s2 = text2.substring(0, limit);

    const matrix: number[][] = Array(limit + 1).fill(null).map(() => Array(limit + 1).fill(0));

    for (let i = 0; i <= s1.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1.0 - (distance / maxLength);
  }

  /**
   * 计算加权得分
   */
  private calculateWeightedScore(
    details: {
      flowRateScore: number;
      pressureScore: number;
      powerScore: number;
      voltageScore: number;
      controlScore: number;
      tankScore: number;
      semanticScore?: number;  // 新增
    },
    query: ParsedParameters,
    semanticScore?: number     // 新增
  ): number {
    let totalWeight = 0;
    let totalScore = 0;

    // 排气量
    if (query.flowRate !== null) {
      totalWeight += this.config.flowRateWeight;
      totalScore += details.flowRateScore * this.config.flowRateWeight;
    }

    // 压力
    if (query.pressure !== null) {
      totalWeight += this.config.pressureWeight;
      totalScore += details.pressureScore * this.config.pressureWeight;
    }

    // 功率
    if (query.power !== null) {
      totalWeight += this.config.powerWeight;
      totalScore += details.powerScore * this.config.powerWeight;
    }

    // 电压
    if (query.voltage !== null) {
      totalWeight += this.config.voltageWeight;
      totalScore += details.voltageScore * this.config.voltageWeight;
    }

    // 控制方式
    if (query.controlType !== null) {
      totalWeight += this.config.controlWeight;
      totalScore += details.controlScore * this.config.controlWeight;
    }

    // 储气罐
    if (query.tankType !== null) {
      totalWeight += this.config.tankWeight;
      totalScore += details.tankScore * this.config.tankWeight;
    }

    // 语义匹配得分（新增）
    if (semanticScore !== undefined && semanticScore > 0 && this.config.enableSemanticMatching) {
      const semanticWeight = this.config.semanticWeight || 0.2;
      totalWeight += semanticWeight;
      totalScore += semanticScore * semanticWeight;
    }

    // 如果没有任何参数，返回默认分数
    if (totalWeight === 0) {
      return 0.5;
    }

    return totalScore / totalWeight;
  }

  /**
   * 确定匹配级别
   */
  private determineMatchLevel(
    score: number,
    query: ParsedParameters
  ): 'exact' | 'approximate' | 'other' {
    // 精确匹配：得分高且所有参数都匹配
    if (score >= this.config.exactMatchThreshold) {
      return 'exact';
    }

    // 近似匹配：得分中等，部分参数匹配
    if (score >= this.config.approximateThreshold) {
      return 'approximate';
    }

    // 其他：得分较低
    return 'other';
  }

  /**
   * 根据 matchType 计算 confidence（供调用方使用）
   */
  static calculateConfidence(matchLevel: 'exact' | 'approximate' | 'other', matchType?: 'exact' | 'close'): number {
    // 如果有 matchType 信息，使用精确的置信度
    if (matchType === 'exact') return 0.95;
    if (matchType === 'close') return 0.70;
    // 否则基于 matchLevel
    if (matchLevel === 'exact') return 0.95;
    if (matchLevel === 'approximate') return 0.70;
    return 0.50;
  }

  /**
   * 获取最佳匹配
   */
  public getBestMatch(results: MatchResult[]): MatchResult | null {
    if (results.length === 0) {
      return null;
    }

    // 返回得分最高的精确匹配
    const exactMatches = results.filter(r => r.matchLevel === 'exact');
    if (exactMatches.length > 0) {
      return exactMatches[0];
    }

    // 否则返回得分最高的结果
    return results[0];
  }

  /**
   * 按匹配级别分组
   */
  public groupByMatchLevel(results: MatchResult[]): {
    exact: MatchResult[];
    approximate: MatchResult[];
    other: MatchResult[];
  } {
    return {
      exact: results.filter(r => r.matchLevel === 'exact'),
      approximate: results.filter(r => r.matchLevel === 'approximate'),
      other: results.filter(r => r.matchLevel === 'other')
    };
  }

  /**
   * 格式化匹配结果（用于调试）
   */
  public formatResult(result: MatchResult): string {
    const { product, score, matchDetails, matchLevel, mismatches } = result;

    return `
🔍 匹配结果 - ${product.name}
==========================
产品型号: ${product.model}
品牌: ${product.brand}
匹配得分: ${(score * 100).toFixed(1)}%
匹配级别: ${matchLevel}

参数匹配详情:
  • 排气量: ${(matchDetails.flowRateScore * 100).toFixed(1)}% 
    (${product.flowRate || 'N/A'} m³/min)
  • 压力: ${(matchDetails.pressureScore * 100).toFixed(1)}%
    (${product.pressure || 'N/A'} MPa)
  • 功率: ${(matchDetails.powerScore * 100).toFixed(1)}%
    (${product.power || 'N/A'} KW)
  • 电压: ${(matchDetails.voltageScore * 100).toFixed(1)}%
    (${product.voltage || 'N/A'})
  • 控制方式: ${(matchDetails.controlScore * 100).toFixed(1)}%
    (${product.controlType || 'N/A'})
  • 储气罐: ${(matchDetails.tankScore * 100).toFixed(1)}%
    (${product.tankType || 'N/A'})

${mismatches.length > 0 ? `不匹配参数: ${mismatches.join(', ')}` : '所有参数匹配 ✅'}
    `.trim();
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<MatchConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[ProductMatcher] 配置已更新:', this.config);
  }

  /**
   * 获取当前配置
   */
  public getConfig(): MatchConfig {
    return { ...this.config };
  }
}

// 导出单例
export const productMatcher = new ProductMatcher();
