/**
 * 产品查询解析器
 * 
 * 功能：
 * 1. 解析用户输入的自然语言查询
 * 2. 提取关键参数（排气量、压力、电压、功率等）
 * 3. 标准化参数值
 * 4. 识别查询意图（产品查询、价格查询等）
 */

/**
 * 查询类型枚举
 */
export enum QueryType {
  UNKNOWN = 'unknown',
  PRODUCT_QUERY = 'product_query',      // 产品查询
  PRICE_QUERY = 'price_query',          // 价格查询
  FEATURE_QUERY = 'feature_query',      // 功能查询
  COMPARISON_QUERY = 'comparison_query' // 对比查询
}

/**
 * 解析后的参数
 */
export interface ParsedParameters {
  // 核心参数
  flowRate: number | null;      // 排气量 (m³/min)
  pressure: number | null;      // 工作压力 (MPa)
  power: number | null;         // 功率 (KW)
  voltage: string | null;       // 电压 (220V/380V)
  controlType: string | null;   // 控制方式 (永磁变频/工频)
  tankType: string | null;      // 储气罐类型 (单储气罐/双储气罐)

  // 辅助信息
  rawQuery: string;             // 原始查询文本
  extractedKeywords: string[];  // 提取的关键词
  queryType: QueryType;         // 查询类型
  confidence: number;           // 解析置信度 (0-1)

  // 需求描述
  requirements: {
    budget?: number;            // 预算
    usage?: string;             // 使用场景
    efficiency?: string;        // 能效要求
  };
}

/**
 * 参数提取规则
 */
interface ExtractionRule {
  patterns: RegExp[];
  extractor: (match: RegExpMatchArray) => number | string | null;
}

/**
 * 产品查询解析器类
 */
export class ProductQueryParser {
  private extractionRules: Map<string, ExtractionRule[]> = new Map();

  constructor() {
    this.initExtractionRules();
    console.log('[ProductQueryParser] 查询解析器初始化完成');
  }

  /**
   * 初始化参数提取规则
   */
  private initExtractionRules(): void {
    // 排气量提取规则
    this.extractionRules.set('flowRate', [
      {
        patterns: [
          /(\d+\.?\d*)\s*(m³|m3|立方)\s*(\/|\s)?\s*min/i,
          /(\d+\.?\d*)\s*立方/i,
          /排气量[：:：]?\s*(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*(m3|min)/i
        ],
        extractor: (match: RegExpMatchArray) => parseFloat(match[1])
      },
      {
        patterns: [
          /(\d+)\s*(cubic|cube)/i
        ],
        extractor: (match: RegExpMatchArray) => parseFloat(match[1])
      }
    ]);

    // 工作压力提取规则
    this.extractionRules.set('pressure', [
      {
        patterns: [
          /(\d+\.?\d*)\s*(MPa|兆帕|mpa)\b/i,
          /工作压力[：:：]?\s*(\d+\.?\d*)/i,
          /压力[：:：]?\s*(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*(bar|巴)\b/i
        ],
        extractor: (match: RegExpMatchArray) => {
          const value = parseFloat(match[1]);
          // bar 转 MPa (1 bar = 0.1 MPa)
          return /bar|巴/i.test(match[2]) ? value * 0.1 : value;
        }
      }
    ]);

    // 功率提取规则
    this.extractionRules.set('power', [
      {
        patterns: [
          /(\d+\.?\d*)\s*(KW|kW|千瓦)/i,
          /功率[：:：]?\s*(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*(HP|马力)\b/i
        ],
        extractor: (match: RegExpMatchArray) => {
          const value = parseFloat(match[1]);
          // HP 转 KW (1 HP ≈ 0.75 KW)
          return /HP|马力/i.test(match[2]) ? value * 0.75 : value;
        }
      }
    ]);

    // 电压提取规则
    this.extractionRules.set('voltage', [
      {
        patterns: [
          /220V|220伏|220v|单相/i,
          /380V|380伏|380v|三相/i
        ],
        extractor: (match: RegExpMatchArray) => {
          if (/220|单相/i.test(match[0])) return '220V';
          if (/380|三相/i.test(match[0])) return '380V';
          return null;
        }
      }
    ]);

    // 控制方式提取规则
    this.extractionRules.set('controlType', [
      {
        patterns: [
          /永磁变频|变频/i,
          /工频/i
        ],
        extractor: (match: RegExpMatchArray) => {
          if (/变频/i.test(match[0])) return '永磁变频';
          if (/工频/i.test(match[0])) return '工频';
          return null;
        }
      }
    ]);

    // 储气罐类型提取规则
    this.extractionRules.set('tankType', [
      {
        patterns: [
          /双罐|双储气罐/i,
          /单罐|单储气罐/i
        ],
        extractor: (match: RegExpMatchArray) => {
          if (/双/i.test(match[0])) return '双储气罐';
          if (/单/i.test(match[0])) return '单储气罐';
          return null;
        }
      }
    ]);
  }

  /**
   * 解析用户查询
   */
  public parse(query: string): ParsedParameters {
    const result: ParsedParameters = {
      flowRate: null,
      pressure: null,
      power: null,
      voltage: null,
      controlType: null,
      tankType: null,
      rawQuery: query.trim(),
      extractedKeywords: [],
      queryType: this.detectQueryType(query),
      confidence: 0,
      requirements: {}
    };

    if (!query || query.trim().length === 0) {
      return result;
    }

    // 提取所有参数
    this.extractAllParameters(query, result);

    // 提取需求信息
    this.extractRequirements(query, result);

    // 计算置信度
    result.confidence = this.calculateConfidence(result);

    return result;
  }

  /**
   * 检测查询类型
   */
  private detectQueryType(query: string): QueryType {
    const lowerQuery = query.toLowerCase();

    // 价格查询
    if (/(多少钱|价格|报价|费用|成本|预算|贵不贵|便宜)/.test(lowerQuery)) {
      return QueryType.PRICE_QUERY;
    }

    // 对比查询
    if (/(对比|比较|哪个好|区别|差异)/.test(lowerQuery)) {
      return QueryType.COMPARISON_QUERY;
    }

    // 功能查询
    if (/(功能|特点|优势|能不能|可以.*吗|怎么样|好不好)/.test(lowerQuery)) {
      return QueryType.FEATURE_QUERY;
    }

    // 默认为产品查询
    if (/(空压机|压缩机|机器|设备|型号|推荐|找)/.test(lowerQuery)) {
      return QueryType.PRODUCT_QUERY;
    }

    return QueryType.UNKNOWN;
  }

  /**
   * 提取所有参数
   */
  private extractAllParameters(query: string, result: ParsedParameters): void {
    const paramKeys = ['flowRate', 'pressure', 'power', 'voltage', 'controlType', 'tankType'] as const;

    paramKeys.forEach(key => {
      const rules = this.extractionRules.get(key);
      if (!rules) return;

      for (const rule of rules) {
        for (const pattern of rule.patterns) {
          const match = query.match(pattern);
          if (match) {
            const value = rule.extractor(match);
            if (value !== null) {
              // 类型断言：确保赋值正确
              if (typeof value === 'number') {
                (result as any)[key] = value;
              } else {
                (result as any)[key] = value as string;
              }
              
              // 添加关键词
              result.extractedKeywords.push(match[0]);
              console.log(`[ProductQueryParser] 提取 ${key}: ${value}`);
              break;
            }
          }
        }
      }
    });
  }

  /**
   * 提取需求信息
   */
  private extractRequirements(query: string, result: ParsedParameters): void {
    // 提取预算
    const budgetMatch = query.match(/预算\s*[：:：]?\s*(\d+\.?\d*)\s*([元万千]+)/i);
    if (budgetMatch) {
      let budget = parseFloat(budgetMatch[1]);
      const unit = budgetMatch[2];
      
      if (unit.includes('万')) budget *= 10000;
      if (unit.includes('千')) budget *= 1000;
      
      result.requirements.budget = budget;
    }

    // 提取使用场景
    const usagePatterns = [
      /工厂|车间|生产/i,
      /家庭|家用|个人/i,
      /医疗|医院/i,
      /实验室|科研/i,
      /施工|工地/i,
      /连续|长时间|24小时/i
    ];

    for (const pattern of usagePatterns) {
      const match = query.match(pattern);
      if (match) {
        result.requirements.usage = match[0];
        result.extractedKeywords.push(match[0]);
        break;
      }
    }

    // 提取能效要求
    const efficiencyPatterns = [
      /节能|省电|低能耗/i,
      /高效|效率高/i,
      /稳定|可靠/i
    ];

    for (const pattern of efficiencyPatterns) {
      const match = query.match(pattern);
      if (match) {
        result.requirements.efficiency = match[0];
        result.extractedKeywords.push(match[0]);
        break;
      }
    }
  }

  /**
   * 计算解析置信度
   */
  private calculateConfidence(result: ParsedParameters): number {
    let score = 0;
    let maxScore = 0;

    // 参数权重
    const weights = {
      flowRate: 0.3,
      pressure: 0.3,
      power: 0.15,
      voltage: 0.1,
      controlType: 0.1,
      tankType: 0.05
    };

    // 计算得分
    if (result.flowRate !== null) score += weights.flowRate;
    if (result.pressure !== null) score += weights.pressure;
    if (result.power !== null) score += weights.power;
    if (result.voltage !== null) score += weights.voltage;
    if (result.controlType !== null) score += weights.controlType;
    if (result.tankType !== null) score += weights.tankType;

    // 需求得分
    if (result.requirements.budget) score += 0.1;
    if (result.requirements.usage) score += 0.1;
    if (result.requirements.efficiency) score += 0.1;

    maxScore = 1.0;

    // 归一化到 0-1 范围
    return Math.min(score / maxScore, 1.0);
  }

  /**
   * 格式化解析结果（用于调试）
   */
  public formatResult(result: ParsedParameters): string {
    return `
📋 查询解析结果
=================
原始查询: ${result.rawQuery}
查询类型: ${result.queryType}
置信度: ${(result.confidence * 100).toFixed(1)}%

提取参数:
  • 排气量: ${result.flowRate !== null ? `${result.flowRate} m³/min` : '未提取'}
  • 工作压力: ${result.pressure !== null ? `${result.pressure} MPa` : '未提取'}
  • 功率: ${result.power !== null ? `${result.power} KW` : '未提取'}
  • 电压: ${result.voltage || '未提取'}
  • 控制方式: ${result.controlType || '未提取'}
  • 储气罐: ${result.tankType || '未提取'}

提取关键词: ${result.extractedKeywords.join(', ') || '无'}

需求信息:
  • 预算: ${result.requirements.budget ? `¥${result.requirements.budget}` : '未指定'}
  • 使用场景: ${result.requirements.usage || '未指定'}
  • 能效要求: ${result.requirements.efficiency || '未指定'}
    `.trim();
  }

  /**
   * 验证解析结果的有效性
   */
  public validateResult(result: ParsedParameters): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查是否至少有一个核心参数
    if (result.flowRate === null && result.pressure === null && result.power === null) {
      issues.push('未提取到任何核心参数（排气量/压力/功率）');
    }

    // 检查置信度
    if (result.confidence < 0.3) {
      issues.push('解析置信度过低，可能无法准确匹配产品');
    }

    // 检查参数合理性
    if (result.flowRate !== null && result.flowRate > 100) {
      issues.push('排气量数值异常，可能识别错误');
    }

    if (result.pressure !== null && (result.pressure > 20 || result.pressure < 0.1)) {
      issues.push('压力数值异常，可能识别错误');
    }

    if (result.power !== null && result.power > 500) {
      issues.push('功率数值异常，可能识别错误');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// 导出单例
export const productQueryParser = new ProductQueryParser();
