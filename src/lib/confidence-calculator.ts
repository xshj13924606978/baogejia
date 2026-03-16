/**
 * 置信度计算器
 * 
 * 功能：
 * 1. 计算产品匹配结果的置信度
 * 2. 评估匹配结果的可靠性
 * 3. 提供置信度分级（高/中/低）
 * 4. 生成置信度报告
 */

import { MatchResult } from './product-matcher';
import { ParsedParameters } from './product-query-parser';

/**
 * 置信度级别
 */
export enum ConfidenceLevel {
  HIGH = 'high',        // 高置信度 (0.75-1.0)
  MEDIUM = 'medium',    // 中置信度 (0.5-0.75)
  LOW = 'low'          // 低置信度 (0-0.5)
}

/**
 * 置信度报告
 */
export interface ConfidenceReport {
  overall: number;                    // 总体置信度 (0-1)
  level: ConfidenceLevel;             // 置信度级别
  scores: {
    parsing: number;                  // 查询解析置信度
    matching: number;                 // 产品匹配置信度
    completeness: number;             // 参数完整度
    consistency: number;              // 参数一致性
  };
  factors: {
    positive: string[];               // 正向因素
    negative: string[];               // 负向因素
  };
  recommendation: {
    reliability: string;              // 可靠性描述
    action: string;                   // 建议操作
  };
}

/**
 * 置信度计算器配置
 */
export interface ConfidenceCalculatorConfig {
  // 权重配置
  parsingWeight: number;      // 查询解析权重
  matchingWeight: number;     // 产品匹配权重
  completenessWeight: number; // 参数完整度权重
  consistencyWeight: number;  // 参数一致性权重

  // 阈值配置
  highThreshold: number;      // 高置信度阈值
  mediumThreshold: number;    // 中置信度阈值
}

/**
 * 置信度计算器类
 */
export class ConfidenceCalculator {
  private config: ConfidenceCalculatorConfig;

  constructor(config?: Partial<ConfidenceCalculatorConfig>) {
    this.config = {
      parsingWeight: 0.25,
      matchingWeight: 0.35,
      completenessWeight: 0.25,
      consistencyWeight: 0.15,

      highThreshold: 0.75,
      mediumThreshold: 0.5,

      ...config
    };
    console.log('[ConfidenceCalculator] 置信度计算器初始化完成');
  }

  /**
   * 计算置信度
   */
  public calculate(
    query: ParsedParameters,
    matches: MatchResult[]
  ): ConfidenceReport {
    console.log('[ConfidenceCalculator] 开始计算置信度...');

    // 1. 查询解析置信度
    const parsingScore = this.calculateParsingScore(query);

    // 2. 产品匹配置信度
    const matchingScore = this.calculateMatchingScore(matches);

    // 3. 参数完整度
    const completenessScore = this.calculateCompletenessScore(query);

    // 4. 参数一致性
    const consistencyScore = this.calculateConsistencyScore(query, matches);

    // 5. 计算总体置信度
    const overall =
      parsingScore * this.config.parsingWeight +
      matchingScore * this.config.matchingWeight +
      completenessScore * this.config.completenessWeight +
      consistencyScore * this.config.consistencyWeight;

    // 6. 确定置信度级别
    const level = this.determineLevel(overall);

    // 7. 分析影响因素
    const factors = this.analyzeFactors(query, matches, {
      parsingScore,
      matchingScore,
      completenessScore,
      consistencyScore
    });

    // 8. 生成建议
    const recommendation = this.generateRecommendation(level, factors);

    const report: ConfidenceReport = {
      overall,
      level,
      scores: {
        parsing: parsingScore,
        matching: matchingScore,
        completeness: completenessScore,
        consistency: consistencyScore
      },
      factors,
      recommendation
    };

    console.log('[ConfidenceCalculator] 置信度计算完成:', {
      overall: `${(overall * 100).toFixed(1)}%`,
      level,
      ...recommendation
    });

    return report;
  }

  /**
   * 计算查询解析置信度
   */
  private calculateParsingScore(query: ParsedParameters): number {
    // 直接使用查询解析器的置信度
    return query.confidence;
  }

  /**
   * 计算产品匹配置信度
   */
  private calculateMatchingScore(matches: MatchResult[]): number {
    if (matches.length === 0) {
      return 0;
    }

    // 使用最佳匹配的得分
    const bestMatch = matches[0];

    // 如果是精确匹配，给予额外加分
    let score = bestMatch.score;
    if (bestMatch.matchLevel === 'exact') {
      score = Math.min(score + 0.1, 1.0);
    }

    // 如果有多个高得分匹配，增加置信度
    const highScoreMatches = matches.filter(m => m.score >= 0.8);
    if (highScoreMatches.length >= 2) {
      score = Math.min(score + 0.05, 1.0);
    }

    return score;
  }

  /**
   * 计算参数完整度
   */
  private calculateCompletenessScore(query: ParsedParameters): number {
    let extractedCount = 0;
    const totalCount = 6; // flowRate, pressure, power, voltage, controlType, tankType

    if (query.flowRate !== null) extractedCount++;
    if (query.pressure !== null) extractedCount++;
    if (query.power !== null) extractedCount++;
    if (query.voltage !== null) extractedCount++;
    if (query.controlType !== null) extractedCount++;
    if (query.tankType !== null) extractedCount++;

    // 核心参数（排气量、压力）权重更高
    let score = 0;
    if (query.flowRate !== null) score += 0.35;
    if (query.pressure !== null) score += 0.35;
    if (query.power !== null) score += 0.15;
    if (query.voltage !== null) score += 0.1;
    if (query.controlType !== null) score += 0.05;
    if (query.tankType !== null) score += 0.05;

    return score;
  }

  /**
   * 计算参数一致性
   */
  private calculateConsistencyScore(
    query: ParsedParameters,
    matches: MatchResult[]
  ): number {
    if (matches.length === 0) {
      return 0;
    }

    // 检查匹配结果的不匹配项数量
    const bestMatch = matches[0];
    const mismatchCount = bestMatch.mismatches.length;

    // 不匹配项越少，一致性越高
    const score = Math.max(0, 1.0 - (mismatchCount * 0.2));

    return score;
  }

  /**
   * 确定置信度级别
   */
  private determineLevel(overall: number): ConfidenceLevel {
    if (overall >= this.config.highThreshold) {
      return ConfidenceLevel.HIGH;
    } else if (overall >= this.config.mediumThreshold) {
      return ConfidenceLevel.MEDIUM;
    } else {
      return ConfidenceLevel.LOW;
    }
  }

  /**
   * 分析影响因素
   */
  private analyzeFactors(
    query: ParsedParameters,
    matches: MatchResult[],
    scores: {
      parsingScore: number;
      matchingScore: number;
      completenessScore: number;
      consistencyScore: number;
    }
  ): {
    positive: string[];
    negative: string[];
  } {
    const positive: string[] = [];
    const negative: string[] = [];

    // 查询解析
    if (scores.parsingScore >= 0.8) {
      positive.push('查询意图识别清晰');
    } else if (scores.parsingScore < 0.5) {
      negative.push('查询意图识别模糊，可能存在歧义');
    }

    // 产品匹配
    if (matches.length > 0 && matches[0].matchLevel === 'exact') {
      positive.push('找到精确匹配的产品');
    } else if (matches.length === 0) {
      negative.push('未找到匹配的产品');
    }

    // 参数完整度
    if (query.flowRate !== null && query.pressure !== null) {
      positive.push('核心参数（排气量、压力）完整');
    } else {
      negative.push('核心参数缺失，影响匹配精度');
    }

    // 参数一致性
    if (matches.length > 0 && matches[0].mismatches.length === 0) {
      positive.push('所有参数完全匹配');
    } else if (matches.length > 0 && matches[0].mismatches.length > 0) {
      negative.push(`存在${matches[0].mismatches.length}个参数不匹配`);
    }

    // 多个匹配结果
    if (matches.length >= 2) {
      positive.push(`找到${matches.length}个匹配产品，可提供对比选择`);
    }

    return { positive, negative };
  }

  /**
   * 生成建议
   */
  private generateRecommendation(
    level: ConfidenceLevel,
    factors: { positive: string[]; negative: string[] }
  ): {
    reliability: string;
    action: string;
  } {
    switch (level) {
      case ConfidenceLevel.HIGH:
        return {
          reliability: '高可靠性',
          action: '可直接使用推荐结果'
        };

      case ConfidenceLevel.MEDIUM:
        return {
          reliability: '中等可靠性',
          action: factors.negative.length > 0
            ? `建议确认：${factors.negative.slice(0, 2).join('、')}`
            : '建议查看多个匹配结果进行对比'
        };

      case ConfidenceLevel.LOW:
        return {
          reliability: '低可靠性',
          action: factors.negative.length > 0
            ? `建议补充参数：${factors.negative.join('、')}`
            : '建议提供更详细的产品需求'
        };

      default:
        return {
          reliability: '未知',
          action: '无法评估'
        };
    }
  }

  /**
   * 格式化置信度报告
   */
  public formatReport(report: ConfidenceReport): string {
    const levelEmoji = {
      [ConfidenceLevel.HIGH]: '🟢',
      [ConfidenceLevel.MEDIUM]: '🟡',
      [ConfidenceLevel.LOW]: '🔴'
    };

    return `
${levelEmoji[report.level]} 置信度评估报告
==========================
总体置信度: ${(report.overall * 100).toFixed(1)}%
置信度级别: ${report.level.toUpperCase()}

详细评分:
  • 查询解析: ${(report.scores.parsing * 100).toFixed(1)}%
  • 产品匹配: ${(report.scores.matching * 100).toFixed(1)}%
  • 参数完整度: ${(report.scores.completeness * 100).toFixed(1)}%
  • 参数一致性: ${(report.scores.consistency * 100).toFixed(1)}%

正向因素:
${report.factors.positive.map(f => `  ✅ ${f}`).join('\n') || '  无'}

负向因素:
${report.factors.negative.map(f => `  ⚠️ ${f}`).join('\n') || '  无'}

建议:
  • 可靠性: ${report.recommendation.reliability}
  • 操作建议: ${report.recommendation.action}
    `.trim();
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<ConfidenceCalculatorConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[ConfidenceCalculator] 配置已更新:', this.config);
  }

  /**
   * 获取当前配置
   */
  public getConfig(): ConfidenceCalculatorConfig {
    return { ...this.config };
  }
}

// 导出单例
export const confidenceCalculator = new ConfidenceCalculator();
