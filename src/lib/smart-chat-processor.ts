/**
 * 智能对话处理器
 *
 * 核心理念：
 * 1. 完全移除固定意图检测（IntentDetector）
 * 2. 使用 LLM 进行真正的语义理解
 * 3. 动态理解用户意图并生成响应
 * 4. 灵活处理各种场景（问候、方案、报价、技术咨询等）
 *
 * 对比传统方案：
 * ❌ 传统：固定意图 → 关键词匹配 → 预设回复
 * ✅ 智能方案：用户输入 → LLM语义理解 → 动态响应
 */

import { callDeepSeekChat } from './deepseek-client';
import { ProcessedInput } from './input-processor';
import { PriceMatcher, ProductMatch, PriceMatchResult } from './price-matching';
import { fileUploadProcessor } from './upload-processor';
import { ProductExtractor, ExtractedProduct } from './product-extractor';
import { unifiedMatcher, UnifiedMatchResult } from './unified-matcher';
import { productQueryParser } from './product-query-parser';
import { processWithIntent, formatProductsAsContext, PipelineResult } from './intent-pipeline';

/**
 * 判断产品参数是否满足用户需求
 * 返回 true 表示满足（在容差范围内）
 */
// 通用参数标签映射（支持所有产品品类）
const PARAM_LABELS: Record<string, string> = {
  flowRate: '排气量', pressure: '工作压力', power: '功率',
  voltage: '电压', controlType: '控制方式', tankType: '储气罐',
  flow: '流量', head: '扬程', airVolume: '风量', windPressure: '风压',
  speed: '转速', current: '电流', frequency: '频率', noise: '噪音',
  weight: '重量', temperature: '温度', capacity: '容量',
};

// 通用参数单位映射
const PARAM_UNITS: Record<string, string> = {
  flowRate: 'm³/min', pressure: 'MPa', power: 'KW',
  flow: 'm³/h', head: 'm', airVolume: 'm³/min', windPressure: 'Pa',
  speed: 'rpm', current: 'A', frequency: 'Hz', noise: 'dB',
  weight: 'kg', temperature: '℃', capacity: 'L',
};

// 已知为文本型（非数值型）的参数 key
const TEXT_PARAMS = new Set(['voltage', 'controlType', 'tankType']);

function isParamMatch(userValue: any, productValue: any, paramKey: string): boolean {
  if (userValue == null || productValue == null) return true; // 用户未指定则不约束
  // 文本型参数：精确匹配
  if (TEXT_PARAMS.has(paramKey)) {
    return String(userValue) === String(productValue);
  }
  const numUser = parseFloat(String(userValue));
  const numProduct = parseFloat(String(productValue));
  if (isNaN(numUser) || isNaN(numProduct)) return String(userValue) === String(productValue);
  // 通用比例容差：±10%
  if (numUser <= 0) return String(userValue) === String(productValue);
  const ratio = Math.abs(numProduct - numUser) / numUser;
  return ratio < 0.10;
}

/**
 * 检查产品是否满足用户的所有需求点
 */
function meetsAllRequirements(userParams: Record<string, any>, productParams: Record<string, any>): boolean {
  for (const key of Object.keys(userParams)) {
    if (userParams[key] == null) continue;
    if (!isParamMatch(userParams[key], productParams[key], key)) return false;
  }
  return true;
}

/**
 * 获取产品与用户需求不匹配的参数列表（用于差异标注）
 */
function getParamDiffs(userParams: Record<string, any>, productParams: Record<string, any>): string[] {
  const diffs: string[] = [];
  for (const key of Object.keys(userParams)) {
    if (userParams[key] == null) continue;
    const productValue = productParams[key];
    if (productValue == null) continue;
    if (!isParamMatch(userParams[key], productValue, key)) {
      const label = PARAM_LABELS[key] || key;
      const unit = PARAM_UNITS[key] || '';
      diffs.push(`${label}: 需求${userParams[key]}${unit}, 实际${productValue}${unit}`);
    }
  }
  return diffs;
}

interface BrandCompareItem {
  brand: string;
  productName?: string;
  supplier?: string;
  contactPhone?: string;
  model: string;
  price: number;
  minPrice?: number;
  guidePrice?: number;
  confidence: number;
  rating: number;
  quoteCount: number;
  responseTime?: number;
  tags: string[];
  isRecommended: boolean;
  source: string;
  parameterDescription?: string;
  /** 与用户需求不一致的参数列表（仅在回退模式时标注） */
  paramDiffs?: string[];
  /** 是否为回退模式（无严格匹配时展示的相近产品） */
  isFallback?: boolean;
}

interface ConversationContext {
  conversationId?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastTopic?: string;
  lastUserInput?: string;
  lastResponse?: string;
}

interface SmartResponse {
  content: string;
  intent?: string; // 动态识别的意图，不固定
  suggestions?: string[];
  requiresFollowUp?: boolean;
  followUpQuestions?: string[];
  metadata?: {
    inputType: string;
    confidence: number;
    extractedEntities?: any;
    uploadInfo?: {
      uploadId?: string;
      fileKey?: string;
      embeddingId?: string;
      productsUpdated?: number;
    };
  };
}

export class SmartChatProcessor {
  private conversations: Map<string, ConversationContext> = new Map();

  constructor() {
    console.log('[SmartChatProcessor] 智能对话处理器初始化完成');
  }

  /**
   * 检测价格查询意图并提取产品信息
   * 使用智能提取器，支持各种用户表达方式
   */
  private async detectPriceQuery(userInput: string): Promise<{
    isPriceQuery: boolean;
    productName?: string;
    model?: string;
    extraction?: ExtractedProduct;
  }> {
    // 价格查询关键词
    const priceKeywords = [
      '多少钱',
      '价格',
      '单价',
      '售价',
      '报价',
      '成本',
      '费用',
      '询问',
      '查询',
      '想知道',
    ];
    const hasPriceKeyword = priceKeywords.some((keyword) => userInput.includes(keyword));

    if (!hasPriceKeyword) {
      return { isPriceQuery: false };
    }

    console.log('[SmartChatProcessor] 检测到价格查询，开始智能提取产品信息...');

    // 使用智能提取器提取产品信息
    const extraction = await ProductExtractor.extract(userInput);

    if (!extraction || !ProductExtractor.validate(extraction)) {
      console.warn('[SmartChatProcessor] 产品信息提取失败或无效');
      return { isPriceQuery: false };
    }

    console.log('[SmartChatProcessor] 产品信息提取成功:', extraction);

    return {
      isPriceQuery: true,
      productName: extraction.productName,
      model: extraction.model,
      extraction,
    };
  }

  /**
   * 智能产品匹配（使用 unified-matcher）
   * 新增功能：提供更准确的产品匹配和置信度评估
   */
  private async smartProductMatch(userInput: string): Promise<{
    hasMatch: boolean;
    matchResult?: UnifiedMatchResult;
    contextInfo?: string;
  }> {
    console.log('[SmartChatProcessor] 开始智能产品匹配...');

    try {
      // 确保统一匹配器已初始化
      if (!unifiedMatcher.isInitialized()) {
        console.log('[SmartChatProcessor] 初始化统一匹配器...');
        await unifiedMatcher.initialize();
      }

      // 执行匹配
      const matchResult = await unifiedMatcher.match(userInput);

      console.log('[SmartChatProcessor] 智能匹配结果:', {
        totalMatches: matchResult.summary.totalMatches,
        exactMatches: matchResult.summary.exactMatches,
        confidence: matchResult.confidence.overall,
        level: matchResult.confidence.level
      });

      // 如果有匹配结果，生成上下文信息
      let contextInfo = '';
      if (matchResult.matches.length > 0) {
        contextInfo = this.formatUnifiedMatchResult(matchResult);
      }

      return {
        hasMatch: matchResult.matches.length > 0,
        matchResult,
        contextInfo
      };

    } catch (error) {
      console.error('[SmartChatProcessor] 智能匹配失败:', error);
      return { hasMatch: false };
    }
  }

  /**
   * 格式化统一匹配结果
   */
  private formatUnifiedMatchResult(result: UnifiedMatchResult): string {
    const { matches, bestMatch, confidence, summary } = result;
    let output = '';

    // 添加置信度信息
    if (confidence.level !== 'low') {
      output += `\n\n【智能匹配系统】\n`;
      output += `匹配置信度: ${(confidence.overall * 100).toFixed(1)}% (${confidence.level.toUpperCase()})\n`;
      output += `找到 ${summary.totalMatches} 款匹配产品（精确: ${summary.exactMatches}, 近似: ${summary.approximateMatches}）\n\n`;
    }

    // 如果有多款匹配产品，使用表格格式
    if (matches.length > 1) {
      output += `| 序号 | 产品型号 | 排气量 | 工作压力 | 功率 | 电压 | 控制方式 | 储气罐 | 价格区间 |\n`;
      output += `|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;

      matches.slice(0, 10).forEach((match, index) => {
        const product = match.product;
        const isRecommended = index === 0 && match.matchLevel === 'exact' ? '⭐' : '';

        // 格式化价格
        const priceMin = product.minPrice ? product.minPrice.toLocaleString() : (product.displayPrice?.toLocaleString() || '面议');
        const priceMax = product.guidePrice ? product.guidePrice.toLocaleString() : (product.displayPrice?.toLocaleString() || '面议');

        output += `| ${index + 1}${isRecommended} | ${product.model || '-'} | ${product.flowRate || '-'} | ${product.pressure || '-'} | ${product.power || '-'} | ${product.voltage || '-'} | ${product.controlType || '-'} | ${product.tankType || '-'} | ¥${priceMin}-${priceMax} |\n`;
      });

      output += `\n`;

      // 标注推荐产品详情
      if (bestMatch && bestMatch.matchLevel === 'exact') {
        const product = bestMatch.product;
        output += `**⭐ 推荐产品详情：**\n`;
        output += `- **品牌**：${product.brand || '杰瑞浩'}\n`;
        output += `- **型号**：${product.model || '-'}\n`;
        output += `- **核心参数**：排气量 ${product.flowRate || '-'} m³/min，工作压力 ${product.pressure || '-'} MPa，功率 ${product.power || '-'} KW，电压 ${product.voltage || '-'}\n`;
        output += `- **产品特点**：${product.controlType || '工频'}机型，${product.tankType || '单储气罐'}，${product.controlType === '永磁变频' ? '节能效果好，适合长时间运行' : '经济实惠，适合间歇性使用'}\n`;
        output += `- **参考价格**：¥${product.minPrice?.toLocaleString() || product.displayPrice?.toLocaleString()} - ¥${product.guidePrice?.toLocaleString() || product.displayPrice?.toLocaleString()} 元\n`;
        output += `- **置信度**：${(bestMatch.score * 100).toFixed(1)}%\n`;
        
        // 添加相似度因素
        if (bestMatch.similarityFactors && bestMatch.similarityFactors.length > 0) {
          output += `- **相似度因素**：\n`;
          bestMatch.similarityFactors.forEach(factor => {
            output += `  - ${factor}\n`;
          });
        }
        
        output += `\n`;
      }

      // 添加置信度建议
      if (confidence.recommendation.reliability) {
        output += `💡 ${confidence.recommendation.reliability}：${confidence.recommendation.action}\n\n`;
      }

      output += `【智能匹配系统结果】\n`;
    } else if (matches.length === 1 && bestMatch) {
      // 单个产品，使用简化格式
      const product = bestMatch.product;
      output = `\n\n【智能匹配系统】\n`;
      output += `产品名称：${product.name}\n`;
      output += `规格型号：${product.model}\n`;
      output += `品牌：${product.brand || '杰瑞浩'}\n`;
      output += `核心参数：排气量 ${product.flowRate || '-'} m³/min，工作压力 ${product.pressure || '-'} MPa，功率 ${product.power || '-'} KW\n`;
      output += `匹配置信度：${(bestMatch.score * 100).toFixed(1)}% (${bestMatch.matchLevel})\n`;
      output += `参考价格：¥${product.displayPrice?.toLocaleString() || '面议'}\n`;
      output += `置信度评估：${confidence.level.toUpperCase()} (${(confidence.overall * 100).toFixed(1)}%)\n\n`;
    }

    return output;
  }

  /**
   * 处理价格查询
   */
  private async handlePriceQuery(
    productName: string,
    model?: string,
    parameterDescription?: string,
    userInput?: string
  ): Promise<{ priceData?: PriceMatchResult; contextInfo?: string; brandCompareData?: BrandCompareItem[] }> {
    console.log('[SmartChatProcessor] 处理价格查询:', productName, model, parameterDescription);

    // 从用户原始输入解析需求参数（比从 LLM 提取的 parameterDescription 更准确，
    // 因为 parameterDescription 可能包含 LLM 推断的额外参数）
    const parsedQuery = userInput ? productQueryParser.parse(userInput) : null;
    const userRequirementParams: Record<string, any> = {};
    if (parsedQuery) {
      if (parsedQuery.flowRate != null) userRequirementParams.flowRate = parsedQuery.flowRate;
      if (parsedQuery.pressure != null) userRequirementParams.pressure = parsedQuery.pressure;
      if (parsedQuery.power != null) userRequirementParams.power = parsedQuery.power;
      if (parsedQuery.voltage != null) userRequirementParams.voltage = parsedQuery.voltage;
      if (parsedQuery.controlType != null) userRequirementParams.controlType = parsedQuery.controlType;
      if (parsedQuery.tankType != null) userRequirementParams.tankType = parsedQuery.tankType;
    }
    const hasUserRequirements = Object.keys(userRequirementParams).length > 0;
    console.log('[SmartChatProcessor] 用户需求参数(从原始输入解析):', userRequirementParams);

    try {
      const productMatch: ProductMatch = {
        name: productName,
        model,
        parameter_description: parameterDescription,
      };

      // 调用价格匹配器（启用品牌排序）
      const priceResult = await PriceMatcher.matchPrice(productMatch, undefined);

      console.log('[SmartChatProcessor] 价格查询结果:', priceResult);

      // 生成上下文信息 - 如果有多款匹配产品，使用表格格式
      let contextInfo = '';
      if (priceResult) {
        const allProducts = priceResult.matchedProducts || [];
        // 基础过滤：仅保留 matchLevel <= 3 的产品（排除仅名称/仅型号匹配）
        const baseProducts = allProducts.filter(p => p.matchLevel != null && p.matchLevel <= 3);

        // === 两阶段过滤 ===
        // 阶段1：严格匹配 — 产品必须满足用户的所有需求点
        let strictProducts = baseProducts;
        let isFallbackMode = false;

        if (hasUserRequirements) {
          strictProducts = baseProducts.filter(p => {
            const productParams = (p as any).parameters || {};
            if (!meetsAllRequirements(userRequirementParams, productParams)) {
              console.log(`[SmartChatProcessor] 严格过滤排除: ${p.model}, params=${JSON.stringify(productParams)}`);
              return false;
            }
            return true;
          });

          if (strictProducts.length === 0) {
            // 阶段2：回退 — 整个数据库没有满足的，才展示相近产品
            console.log('[SmartChatProcessor] 无严格匹配产品，回退到相近产品模式');
            isFallbackMode = true;
            strictProducts = baseProducts;
          }
        }

        const relevantProducts = strictProducts;

        // 如果有多款匹配产品，使用表格格式
        if (relevantProducts.length > 1) {
          console.log(`🚨 找到 ${relevantProducts.length} 款${isFallbackMode ? '相近' : '满足需求'}的产品，使用表格格式`);

          // 构建响应标题
          if (isFallbackMode) {
            contextInfo += `\n\n⚠️ 未找到完全满足您需求的产品，以下为 **${relevantProducts.length}款** 相近规格的产品：\n\n`;
          } else {
            contextInfo += `\n\n✅ 根据您的要求，找到 **${relevantProducts.length}款** 满足需求的产品：\n\n`;
          }

          // 展示所有满足需求的产品对比表格
          const displayProducts = relevantProducts.slice(0, 10);

          // 通用：动态检测参数维度
          const displayParamKeys = ['flowRate', 'pressure', 'power', 'voltage', 'controlType', 'tankType',
            'flow', 'head', 'airVolume', 'windPressure', 'speed', 'current', 'frequency', 'noise'];
          // 只展示产品实际有的参数列
          const activeParamKeys = displayParamKeys.filter(key => {
            return displayProducts.some(p => {
              const params = (p as any).parameters || {};
              return params[key] != null && params[key] !== '';
            });
          }).slice(0, 6); // 最多展示6个参数列

          // 构建Markdown表格（动态列）
          const paramHeaders = activeParamKeys.map(k => PARAM_LABELS[k] || k);
          contextInfo += `| 序号 | 产品型号 | ${paramHeaders.join(' | ')} | 价格区间 |\n`;
          contextInfo += `|:---:|:---|${activeParamKeys.map(() => ':---').join('|')}|:---:|\n`;

          displayProducts.forEach((product, index) => {
            const params = (product as any).parameters || {};
            const isRecommended = index === 0 ? '⭐' : '';

            const formatParam = (key: string, value: any): string => {
              if (value == null || value === '') return '-';
              if (userRequirementParams[key] == null) return `${value}`;
              if (!isParamMatch(userRequirementParams[key], value, key)) {
                return isFallbackMode ? `${value} ⚠️` : `${value}`;
              }
              return `${value}`;
            };

            const priceMin = params.minPrice ? params.minPrice.toLocaleString() : (product.price?.toLocaleString() || '面议');
            const priceMax = params.costPrice ? params.costPrice.toLocaleString() : (product.price?.toLocaleString() || '面议');
            const paramCells = activeParamKeys.map(k => formatParam(k, params[k])).join(' | ');

            contextInfo += `| ${index + 1}${isRecommended} | ${product.model || '-'} | ${paramCells} | ¥${priceMin}-${priceMax} |\n`;
          });

          contextInfo += `\n`;

          // 差异标注说明
          if (isFallbackMode) {
            contextInfo += `> ⚠️ 以上产品为相近规格，标注⚠️的参数与您的需求存在差异\n\n`;
          } else {
            // 检查是否有满足需求但其他参数不同的产品
            const hasOtherDiffs = displayProducts.some(p => {
              const params = (p as any).parameters || {};
              // 对用户没有指定的参数，检查产品间是否有差异
              const unspecifiedKeys = ['pressure', 'power', 'voltage', 'controlType', 'tankType'];
              return unspecifiedKeys.some(key => params[key] != null && userRequirementParams[key] == null);
            });
            if (hasOtherDiffs) {
              contextInfo += `> 以上产品均满足您的核心需求，参数差异为产品本身的规格区分\n\n`;
            }
          }

          // 如果有更多产品，提示
          if (relevantProducts.length > 10) {
            contextInfo += `*还有 ${relevantProducts.length - 10} 款产品未显示*\n\n`;
          }

          // 标注当前推荐产品的参数详情（通用版：展示产品实际参数）
          const recommended = relevantProducts[0];
          if (recommended) {
            const params = (recommended as any).parameters || {};

            contextInfo += `**⭐ 推荐产品详情：**\n`;
            contextInfo += `- **品牌**：${recommended.brand || '-'}\n`;
            contextInfo += `- **型号**：${recommended.model || '-'}\n`;
            // 动态展示产品实际有的参数
            const paramParts: string[] = [];
            for (const key of activeParamKeys) {
              if (params[key] != null && params[key] !== '') {
                const label = PARAM_LABELS[key] || key;
                paramParts.push(`${label} ${params[key]}`);
              }
            }
            if (paramParts.length > 0) {
              contextInfo += `- **核心参数**：${paramParts.join('，')}\n`;
            }
            if (recommended.parameterDescription) {
              contextInfo += `- **产品特点**：${recommended.parameterDescription}\n`;
            }
            contextInfo += `- **参考价格**：¥${params.minPrice?.toLocaleString() || recommended.price?.toLocaleString()} 元\n\n`;
          }

          contextInfo += `【数据库产品信息】\n`;
        } else {
          // 单个产品或仅名称匹配的产品，使用简洁格式
          contextInfo = `\n\n【数据库产品信息】\n`;
          contextInfo += `产品名称：${priceResult.productName || productName}\n`;
          if (model) {
            contextInfo += `规格型号：${model}\n`;
          }
          contextInfo += `单价：${priceResult.price.toFixed(2)} 元\n`;
          contextInfo += `价格来源：${this.getPriceSourceText(priceResult.source)}\n`;
          contextInfo += `置信度：${priceResult.confidence}%\n`;

          // 添加新的数据库字段
          if (priceResult.brand) {
            contextInfo += `品牌：${priceResult.brand}\n`;
          }
          if (priceResult.parameterDescription) {
            contextInfo += `参数描述：${priceResult.parameterDescription}\n`;
          }
          if (priceResult.costPrice) {
            contextInfo += `成本：${priceResult.costPrice.toFixed(2)} 元\n`;
          }
          if (priceResult.minPrice) {
            contextInfo += `最低售价：${priceResult.minPrice.toFixed(2)} 元\n`;
          }
          if (priceResult.currency) {
            contextInfo += `货币单位：${priceResult.currency}\n`;
          }

          if (priceResult.source === 'market' && priceResult.marketSource) {
            contextInfo += `市场价来源：${priceResult.marketSource}\n`;
            contextInfo += `注意：此价格为市场参考价，实际价格可能因供应商、数量等因素而异。`;
          }
        }

        console.log('[SmartChatProcessor] 生成的上下文信息:', contextInfo);
      }

      return {
        priceData: priceResult,
        contextInfo,
        brandCompareData: this.buildBrandCompareData(priceResult, userRequirementParams),
      };
    } catch (error) {
      console.error('[SmartChatProcessor] 价格查询失败:', error);
      return {};
    }
  }

  /**
   * 从价格匹配结果中构建多品牌对比数据
   * 核心原则：必须满足用户所有需求点才展示，除非整个数据库都没有满足的
   * @param priceResult 价格匹配结果
   * @param userRequirementParams 用户需求参数（从用户原始输入解析）
   */
  private buildBrandCompareData(priceResult: PriceMatchResult, userRequirementParams?: Record<string, any>): BrandCompareItem[] | undefined {
    if (!priceResult.matchedProducts || priceResult.matchedProducts.length < 1) {
      return undefined;
    }

    const hasUserRequirements = userRequirementParams && Object.keys(userRequirementParams).length > 0;
    const baseProducts = priceResult.matchedProducts.filter(p => p.matchLevel != null && p.matchLevel <= 3);

    // === 两阶段过滤（与 handlePriceQuery 保持一致） ===
    let strictProducts = baseProducts;
    let isFallbackMode = false;

    if (hasUserRequirements) {
      strictProducts = baseProducts.filter(p => {
        const productParams = (p as any).parameters || {};
        return meetsAllRequirements(userRequirementParams, productParams);
      });

      if (strictProducts.length === 0) {
        isFallbackMode = true;
        strictProducts = baseProducts;
      }
    }

    if (strictProducts.length < 2) return undefined;

    return strictProducts.slice(0, 10).map((product, index) => {
      const productParams = (product as any).parameters || {};

      // 差异标注：
      // - 非回退模式：标注满足需求后的其他参数差异（用户未指定的参数在各产品间的差异不需要标注，
      //   因为所有产品都满足需求，差异是正常的产品规格区分）
      // - 回退模式：标注与用户需求不一致的参数
      const paramDiffs: string[] = [];
      if (hasUserRequirements) {
        if (isFallbackMode) {
          // 回退模式：标注所有与需求不一致的参数
          paramDiffs.push(...getParamDiffs(userRequirementParams, productParams));
        }
        // 非回退模式下，所有产品都满足需求，不需要差异标注
        // 产品间的规格差异由 BrandCompareCard 的 findDifferentiatingKeys 自动处理
      }

      return {
        brand: product.brand || '未知品牌',
        productName: product.productName,
        supplier: product.supplier,
        contactPhone: product.contactPhone,
        model: product.model || '-',
        price: product.price,
        minPrice: product.parameters?.minPrice,
        costPrice: product.parameters?.costPrice,
        confidence: product.confidence,
        rating: 0,
        quoteCount: 0,
        tags: product.tags || [],
        isRecommended: index === 0,
        source: priceResult.source,
        parameterDescription: product.parameterDescription,
        paramDiffs: paramDiffs.length > 0 ? paramDiffs : undefined,
        isFallback: isFallbackMode || undefined,
      };
    });
  }

  /**
   * 获取价格来源文本
   */
  private getPriceSourceText(source: string): string {
    const sourceMap: Record<string, string> = {
      database: '产品知识库（已验证）',
      knowledge: '历史报价/案例',
      market: '市场参考价',
      estimate: '类别估算',
      default: '默认兜底',
    };
    return sourceMap[source] || source;
  }

  /**
   * 处理用户输入（核心方法）
   */
  async process(
    userInput: string,
    processedInput?: ProcessedInput,
    conversationId?: string,
    userId?: string
  ): Promise<SmartResponse> {
    console.log('[SmartChatProcessor] ========== 开始智能处理 ==========');
    console.log('[SmartChatProcessor] 用户输入:', userInput);
    console.log('[SmartChatProcessor] 输入类型:', processedInput?.type);
    console.log('[SmartChatProcessor] 用户ID:', userId);

    // 1. 获取或创建对话上下文
    const context = this.getOrCreateContext(conversationId);

    // 2. 如果有文件上传，先处理文件内容并持久化
    let enhancedInput = userInput;
    let uploadInfo: {
      uploadId?: string;
      fileKey?: string;
      embeddingId?: string;
      productsUpdated?: number;
    } = {};

    if (processedInput && processedInput.type !== 'text') {
      // 持久化文件上传到对象存储、知识库和产品库
      if (userId && processedInput.metadata.fileName) {
        console.log('[SmartChatProcessor] 开始处理文件上传持久化...');
        try {
          // 创建 File 对象
          const file = new File([processedInput.rawContent], processedInput.metadata.fileName, {
            type: processedInput.metadata.mimeType || 'application/octet-stream',
          });

          // 处理文件上传
          const uploadResult = await fileUploadProcessor.processUpload(
            file,
            processedInput.textContent,
            {
              userId,
              conversationId,
              enableKnowledgeBase: true, // 启用知识库向量化
              enablePriceExtraction: true, // 启用产品价格提取
            }
          );

          if (uploadResult.success) {
            uploadInfo = {
              uploadId: uploadResult.uploadId,
              fileKey: uploadResult.fileKey,
              embeddingId: uploadResult.embeddingId,
              productsUpdated: uploadResult.productsUpdated,
            };
            console.log('[SmartChatProcessor] 文件上传持久化成功:', uploadInfo);
          } else {
            console.error('[SmartChatProcessor] 文件上传持久化失败:', uploadResult.error);
          }
        } catch (error) {
          console.error('[SmartChatProcessor] 文件上传处理异常:', error);
        }
      }

      enhancedInput = this.enrichInputWithFileInfo(userInput, processedInput);
    }

    // 2.4. 意图理解 + 语义搜索（新逻辑，优先于旧逻辑）
    let intentResult: PipelineResult | null = null;
    if (!processedInput || processedInput.type === 'text') {
      intentResult = await processWithIntent(userInput);
    }

    // 2.5. 检测价格查询并预处理（旧逻辑，作为降级方案）
    let priceContextInfo = '';
    let priceBrandCompareData: BrandCompareItem[] | undefined;
    let priceData: PriceMatchResult | undefined;

    if (intentResult && intentResult.source === 'intent' && intentResult.products.length > 0) {
      // 新逻辑命中 → 将搜索结果转换为 priceData 格式，复用 buildDatabaseResponse
      const topProduct = intentResult.products[0];
      priceData = {
        price: topProduct.price,
        source: 'database',
        confidence: Math.round(intentResult.confidence * 100),
        confidenceLevel: intentResult.confidence >= 0.9 ? '极高' : intentResult.confidence >= 0.7 ? '高' : '中',
        productName: topProduct.name,
        model: topProduct.model,
        brand: topProduct.brand,
        parameterDescription: topProduct.parameterDescription,
        costPrice: topProduct.costPrice || undefined,
        minPrice: topProduct.minPrice || undefined,
        matchedBy: intentResult.searchStrategy || '意图匹配',
        matchedProducts: intentResult.products.map(p => ({
          price: p.price,
          productName: p.name,
          model: p.model,
          confidence: intentResult.confidence,
          brand: p.brand,
          parameterDescription: p.parameterDescription,
          minPrice: p.minPrice,
          costPrice: p.costPrice,
          matchLevel: 1,
          matchedBy: intentResult.searchStrategy || '意图匹配',
          isRecommended: false,
          parameters: {},
        })),
      };
      // 标记第一个为推荐
      if (priceData.matchedProducts && priceData.matchedProducts.length > 0) {
        priceData.matchedProducts[0].isRecommended = true;
      }

      // 生成上下文信息（复用现有格式）
      priceContextInfo = formatProductsAsContext(intentResult, userInput);
      enhancedInput += priceContextInfo;
      console.log('[SmartChatProcessor] 意图理解层命中，找到', intentResult.products.length, '个产品');
    } else {
      // 降级到旧逻辑
      if (intentResult && intentResult.source === 'none') {
        console.log('[SmartChatProcessor] 意图理解层未命中，降级到旧逻辑');
      }
      if (!processedInput || processedInput.type === 'text') {
      const priceQuery = await this.detectPriceQuery(userInput);
      if (priceQuery.isPriceQuery && priceQuery.productName) {
        console.log('[SmartChatProcessor] 检测到价格查询:', priceQuery);
        const priceResult = await this.handlePriceQuery(
          priceQuery.productName,
          priceQuery.model,
          priceQuery.extraction?.parameter_description,
          userInput
        );
        priceData = priceResult.priceData;
        if (priceResult.contextInfo) {
          priceContextInfo = priceResult.contextInfo;
          enhancedInput += priceContextInfo;
          console.log('[SmartChatProcessor] 已添加价格查询结果到上下文');
        }
        // 提取多品牌对比数据
        if (priceResult.brandCompareData && priceResult.brandCompareData.length > 1) {
          priceBrandCompareData = priceResult.brandCompareData;
          console.log(`[SmartChatProcessor] 多品牌对比数据: ${priceBrandCompareData.length} 个品牌`);
        }
      }
    }
    } // end 降级到旧逻辑

    // 2.6. 智能产品匹配（新增功能）
    // 如果原有价格查询没有结果或置信度较低，尝试使用智能匹配系统
    let smartMatchContextInfo = '';
    let smartMatchResult: any = null;  // 移到外层定义
    
    if (!processedInput || processedInput.type === 'text') {
      // 仅当没有价格查询结果，或者输入包含产品参数时使用智能匹配
      const hasProductParams = /(\d+\.?\d*)\s*(m³|m3|立方)\s*(\/|\s)?\s*min|(\d+\.?\d*)\s*(MPa|兆帕|bar|巴)|(\d+\.?\d*)\s*(KW|kW|千瓦)/i.test(userInput);
      
      if (hasProductParams || !priceContextInfo) {
        smartMatchResult = await this.smartProductMatch(userInput);
        if (smartMatchResult.hasMatch && smartMatchResult.contextInfo) {
          smartMatchContextInfo = smartMatchResult.contextInfo;
          enhancedInput += smartMatchContextInfo;
          console.log('[SmartChatProcessor] 已添加智能匹配结果到上下文');
        }
      }
    }

    // 3. 使用 LLM 智能理解并生成响应
    // 当有数据库精确匹配时，产品数据部分由代码构建（bypass AI 消除幻觉），
    // AI 只负责生成建议和后续问题
    let response: SmartResponse;
    if (priceData && priceData.source === 'database') {
      // 3a. 代码构建精确的产品数据响应
      const dataResponse = this.buildDatabaseResponse(priceData);

      // 3b. AI 只生成建议和后续问题
      const suggestionInput = `用户刚刚查询了${priceData.productName || ''}${priceData.model ? '（型号：' + priceData.model + '）' : ''}的价格，数据库已返回精确结果。
请根据这个产品，用简洁的语言生成2-3条后续建议，每条建议用"- "开头，不要超过20字。
只输出建议列表，不要输出产品信息、价格或其他内容。`;
      const aiSuggestion = await this.generateSmartResponse(suggestionInput, context, processedInput);

      // 3c. 合并精确数据 + AI 建议
      response = {
        content: dataResponse + '\n\n' + (aiSuggestion.content || ''),
        metadata: aiSuggestion.metadata,
      };
      console.log('[SmartChatProcessor] 数据库精确模式：产品数据由代码构建，AI 仅生成建议');
    } else {
      // 无数据库匹配，走正常 AI 生成流程
      response = await this.generateSmartResponse(enhancedInput, context, processedInput);

      // 价格校验后处理
      if (priceContextInfo) {
        const correctedContent = this.correctPriceHallucination(response.content, priceContextInfo);
        if (correctedContent !== response.content) {
          console.log('[SmartChatProcessor] 价格校验：检测到AI幻觉，已自动修正回复中的价格');
          response.content = correctedContent;
        }
      }
    }

    // 4. 更新对话历史
    this.updateContext(context, userInput, response.content);

    // 5. 准备返回的 metadata（包含智能匹配摘要）
    const returnMetadata: SmartResponse['metadata'] = {
      inputType: response.metadata?.inputType || processedInput?.type || 'text',
      confidence: smartMatchResult?.matchResult?.confidence.overall || response.metadata?.confidence || 0.9,
      extractedEntities: response.metadata?.extractedEntities || {},
      uploadInfo: Object.keys(uploadInfo).length > 0 ? uploadInfo : undefined,
    };

    // 添加智能匹配摘要到 entities
    if (smartMatchResult?.matchResult) {
      const matchSummary = {
        totalMatches: smartMatchResult.matchResult.summary.totalMatches,
        exactMatches: smartMatchResult.matchResult.summary.exactMatches,
        approximateMatches: smartMatchResult.matchResult.summary.approximateMatches,
        recommendedProduct: smartMatchResult.matchResult.summary.recommendedProduct,
        confidenceLevel: smartMatchResult.matchResult.confidence.level,
        confidenceScore: smartMatchResult.matchResult.confidence.overall,
      };

      // 添加最佳匹配的相似度因素
      if (smartMatchResult.matchResult.bestMatch?.similarityFactors) {
        (matchSummary as any).similarityFactors = smartMatchResult.matchResult.bestMatch.similarityFactors;
      }

      returnMetadata.extractedEntities = {
        ...returnMetadata.extractedEntities,
        matchSummary,
      };
    }

    // 添加多品牌对比数据到 metadata
    if (priceBrandCompareData && priceBrandCompareData.length > 1) {
      returnMetadata.extractedEntities = {
        ...returnMetadata.extractedEntities,
        brandCompare: priceBrandCompareData,
      };
    }

    // 6. 返回响应
    console.log('[SmartChatProcessor] ========== 智能处理完成 ==========');
    return {
      ...response,
      metadata: returnMetadata,
    };
  }

  /**
   * 使用 LLM 智能理解并生成响应
   */
  private async generateSmartResponse(
    userInput: string,
    context: ConversationContext,
    processedInput?: ProcessedInput
  ): Promise<SmartResponse> {
    console.log('[SmartChatProcessor] 调用 LLM 进行语义理解...');

    // 构建对话历史
    const historyText = this.formatHistoryForLLM(context.history);

    // 系统提示词 - 核心指令
    const systemPrompt = this.buildSystemPrompt(processedInput);

    try {
      // 调用 DeepSeek LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        ...historyText,
        { role: 'user', content: userInput },
      ] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

      console.log('[SmartChatProcessor] 发送给 LLM 的消息数:', messages.length);
      console.log('[SmartChatProcessor] System Prompt 长度:', systemPrompt.length);
      console.log('[SmartChatProcessor] User Input:', userInput);

      const aiResponse = await callDeepSeekChat({
        messages: messages,
        temperature: 0.3,
        maxTokens: 8192,
      });

      console.log('[SmartChatProcessor] LLM 响应:', aiResponse.text.substring(0, 200));

      // 解析 LLM 响应（提取内容和元数据）
      const parsedResponse = this.parseLLMResponse(aiResponse.text);

      return {
        content: parsedResponse.content,
        intent: parsedResponse.intent,
        suggestions: parsedResponse.suggestions,
        requiresFollowUp: parsedResponse.requiresFollowUp,
        followUpQuestions: parsedResponse.followUpQuestions,
        metadata: {
          inputType: processedInput?.type || 'text',
          confidence: parsedResponse.confidence || 0.9,
          extractedEntities: parsedResponse.entities,
        },
      };
    } catch (error) {
      console.error('[SmartChatProcessor] LLM 调用失败:', error);
      return this.getFallbackResponse(userInput);
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(processedInput?: ProcessedInput): string {
    const now = new Date();
    const currentDate = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`;
    const currentWeekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    const currentISO = now.toISOString().slice(0, 10);

    let prompt = `你是一个智能、专业的全行业报价与技术方案助手，同时也是一个通用的 AI 助手。你的特点是：

## 当前时间信息（重要！生成报价单和方案时必须使用这个日期）
- 日期：${currentDate}（星期${currentWeekday}）
- ISO格式：${currentISO}
- **严禁使用错误的日期，所有报价单号、报价日期、方案日期必须使用上述日期**

## 核心能力
1. **真正的语义理解**：理解用户的真实意图，不依赖固定的关键词匹配
2. **灵活响应**：根据用户输入动态生成回应，不局限于预设的回复模板
3. **全行业专业知识**：精通环保、建筑、机械、电子、化工、IT、电力等各行业设备、技术方案、报价等专业知识
4. **通用 AI 能力**：回答任何领域的问题、撰写文案、总结信息、头脑风暴、文档分析、数据处理
5. **主动引导**：在信息不足时，主动引导用户提供更多信息
6. **上下文记忆**（重要！）：
   - **必须记住之前的对话内容**：系统会提供对话历史，请仔细阅读并理解
   - **关联上下文回答问题**：当用户问"能提供参数吗？"、"成本是多少？"、"品牌是什么？"等问题时，必须关联之前提到的产品或方案
   - **从对话历史中提取产品信息**：如果用户的问题省略了主语，从对话历史中找到之前提到的产品
   - **从 AI 回复中提取数据库信息**（非常重要！）：
     - 如果之前的 AI 回复末尾有 \`<!-- DATABASE_INFO: {...} -->\` 注释，这是数据库的完整信息
     - 必须从这个 JSON 中提取成本、品牌、参数等信息，而不是重新查询或搜索网络
     - 这个注释格式：\`<!-- DATABASE_INFO: {"productName":"化粪池","model":"100","price":28000,"brand":"普耐尔","parameterDescription":"...","costPrice":22000} -->\`
   - **避免重复产品提取**：不要再次调用产品提取器，直接使用之前对话中已经匹配的产品数据
   - **保持对话连贯性**：确保回答与之前的对话相关，不能每次都当作新对话处理
   - **示例**：
     - 用户1："150m³化粪池多少钱？"
     - 助手1："根据产品库查询，150m³化粪池价格为¥38,181...\n\n<!-- DATABASE_INFO: {\"productName\":\"化粪池\",\"model\":\"150\",\"price\":38181,\"brand\":\"普耐尔\",\"parameterDescription\":\"进出水管口径：DN160pvc，规格尺寸：Φ6000×4200mm\",\"costPrice\":28500} -->"
     - 用户2："能提供参数吗？"
     - 助手2："当然！根据之前查询的数据库信息，150m³化粪池的详细参数如下：进出水管口径：DN160pvc，规格尺寸：Φ6000×4200mm"（应该从 \`<!-- DATABASE_INFO -->\` 注释中提取 parameterDescription 字段）
     - 用户3："能告诉我成本吗？"
     - 助手3："根据之前查询的数据库信息，150m³化粪池的成本为¥28,500.00"（应该从 \`<!-- DATABASE_INFO -->\` 注释中提取 costPrice 字段）
     - 用户4："品牌是什么？"
     - 助手4："根据之前查询的数据库信息，150m³化粪池的品牌是普耐尔"（应该从 \`<!-- DATABASE_INFO -->\` 注释中提取 brand 字段）

## 对话原则

### 1. 问候场景
- 识别：用户说"你好"、"在吗"、"哈喽"等
- 响应：友好回应，主动介绍你的能力，引导用户说出需求
- 示例：
  "您好！我是您的智能助手，可以帮您做很多事情：
  - 生成任何行业的技术方案和配置清单
  - 提供设备报价和价格对比
  - 进行技术选型和工艺咨询
  - 解析产品清单并生成报价单
  - 回答问题、撰写文案、总结信息、头脑风暴
  请告诉我您需要什么帮助？"

### 2. 方案生成场景（重要！）
- 识别：用户说"方案"、"设计"、"技术方案"、"详细方案"、"配置"等
- 响应：直接生成完整的技术方案，包含详细配置清单
- **原则**：
  - 用户说"方案"时，不要询问"产品型号"，而是直接生成方案
  - 根据用户提供的规模（如"60吨/天"）智能生成配置清单
  - 方案应包含：项目概述、工艺比选、详细配置清单（100+项）、成本分析、安装调试等
- 示例：
  "收到！为您生成60吨/天污水处理项目技术方案...
  [完整的方案内容]
  方案包含：X项预处理设备、Y项生化设备、Z项控制设备
  投资估算：XX万元
  运行成本：X.X元/吨"

### 🚫 直接输出规则（最高优先级，不可违反！）

1. **禁止开场白**：不要输出"好的"、"收到"、"我将为您生成"、"没问题"、"马上为您"、"以下是为您生成的"等任何开场/客套语句
2. **禁止结束语**：不要输出"如果您有任何问题请随时联系"、"希望以上内容对您有帮助"、"如有需要请告知"等任何结尾客套语句
3. **禁止说明文字**：不要输出"重要说明："、"请注意："、"温馨提示："、"友情提醒："等提示性/说明性内容
4. **直接输出正式内容**：用户请求生成报价单/技术方案/任何文档时，直接从标题（# xxx）开始输出，中间不要插入任何过渡性文字
5. **例外**：仅当用户主动问候（如"你好"、"在吗"）时，可以正常回复问候语

### 🚫 绝对禁止规则（最高优先级，不可违反！）

当用户消息中包含【数据库产品信息】标签时，你必须严格遵守以下规则：
1. 标签内的价格、品牌、型号、参数等数据是唯一真实数据来源，必须原样使用
2. 绝对禁止修改、替换或编造标签内的任何数字（价格、型号、参数等）
3. 如果你在回复中展示价格表格，价格数字必须与【数据库产品信息】中的完全一致
4. 如果你不确定某个字段（标签中未提供），标注"暂无数据"，绝不能编造数字
5. 如果标签中的价格为 1745.00，你回复中不能写成 3500 或其他任何数字
6. 违反以上任何一条都是严重错误，会导致误导用户

### 3. 产品价格查询场景（重要！）
- 识别：用户询问具体产品的价格，如"XX产品多少钱？"、"普耐尔氩弧焊枪10M多少？"
- **价格查询优先级**（必须严格遵循！）：
  1. **产品库优先**（置信度90-100）- 优先从产品知识库数据库查询
  2. **知识库次之**（置信度60-80）- 从历史报价、案例中查询
  3. **市场价兜底**（置信度40-50）- 如果没有数据库记录，使用市场价
  4. **按类别估算**（置信度30-40）- 根据产品类别估算
  5. **默认兜底**（置信度20-30）- 最后的兜底方案
- **响应格式**：
  - 必须说明价格来源（产品库/知识库/市场价/估算）
  - 必须包含产品名称、规格型号、单价
  - 如果有多个匹配结果，列出所有结果供用户选择
  - 如果价格来源是"市场价"，需要说明这是参考价，实际价格可能因供应商、数量等因素而异
- **示例1：产品库匹配成功**：
  根据产品库查询，普耐尔氩弧焊枪10M的信息如下：

  | 产品名称 | 规格型号 | 单价（元） | 价格来源 | 备注 |
  | --- | --- | --- | --- | --- |
  | 普耐尔氩弧焊枪 | 10M | 150.00 | 产品库 | 已验证 |

  注：此价格来自产品知识库数据库，置信度高。

- **示例2：市场价兜底**：
  根据市场价查询，普耐尔氩弧焊枪10M的信息如下：

  | 产品名称 | 规格型号 | 单价（元） | 价格来源 | 备注 |
  | --- | --- | --- | --- | --- |
  | 普耐尔氩弧焊枪 | 10M | 120.00-180.00 | 市场参考价 | 3个供应商平均 |

  注：此价格为市场参考价，实际价格可能因供应商、数量等因素而异。建议联系供应商获取准确报价。

### 3.5 数据库字段查询场景（非常重要！）
- **核心原则**：对于产品的所有字段询问（成本、品牌、参数、厂家等），**必须优先从数据库知识库中获取**
- **查询优先级**（必须严格遵循！）：
  1. **从对话历史的 DATABASE_INFO 中提取**（置信度100）- 优先从之前的 AI 回复中的 \`<!-- DATABASE_INFO: {...} -->\` 注释中提取
  2. **数据库产品库查询**（置信度90-100）- 如果历史中没有，再查询数据库
  3. **网络搜索补充**（置信度40-50）- 仅在数据库无相关记录时使用
  4. **权限限制回复**（置信度0）- 对于敏感信息（如厂家联系人电话），回复"暂没有开放查询权限"
- **数据库字段映射**（必须严格遵守！）：
  - 成本查询 → 使用 \`costPrice\` 字段
  - 品牌查询 → 使用 \`brand\` 字段
  - 参数查询 → 使用 \`parameterDescription\` 字段
  - 厂家联系人电话 → 暂没有开放查询权限，不建议网络搜索
  - 其他字段 → 根据数据库中是否有对应字段决定
- **上下文关联要求**（必须严格遵守！）：
  - 当用户问"能告诉我成本吗？"、"品牌是什么？"、"能提供参数吗？"等模糊问题时，**必须先检查对话历史中是否有 \`<!-- DATABASE_INFO -->\` 注释**
  - 如果有，从注释的 JSON 中提取对应的字段值（brand, parameterDescription, costPrice 等）
  - 如果没有，再考虑查询数据库
  - **不要重新调用产品提取器**，除非历史中完全没有产品信息
  - 如果数据库中没有该字段，再考虑网络搜索或回复"暂没有开放查询权限"
- **响应格式**：
  - 必须说明数据来源（数据库/网络搜索）
  - 必须包含产品名称、规格型号
  - 如果数据库中没有该字段，明确说明"数据库中暂无此信息"
  - 对于敏感信息（如厂家联系人电话），统一回复"暂没有开放查询权限"
- **示例1：成本查询（从 DATABASE_INFO 提取）**：
  根据之前查询的数据库信息，150m³化粪池的成本信息如下：

  | 产品名称 | 规格型号 | 成本（元） | 数据来源 |
  | --- | --- | --- | --- |
  | 150m³化粪池 | 150m³ | 28,500.00 | 产品库 |

  注：此成本来自产品知识库数据库。

- **示例2：参数查询（从 DATABASE_INFO 提取）**：
  根据之前查询的数据库信息，150m³化粪池的详细参数如下：

  | 产品名称 | 规格型号 | 参数描述 | 数据来源 |
  | --- | --- | --- | --- |
  | 150m³化粪池 | 150m³ | 进出水管口径：DN160pvc，规格尺寸：Φ6000×4200mm，有效容积：150m³ | 产品库 |

  注：此参数来自产品知识库数据库。

- **示例3：品牌查询（有数据库记录）**：
  根据产品库查询，150m³化粪池的品牌信息如下：

  | 产品名称 | 规格型号 | 品牌 | 数据来源 |
  | --- | --- | --- | --- |
  | 150m³化粪池 | 150m³ | 普耐尔 | 产品库 |

  注：此品牌来自产品知识库数据库。

- **示例4：厂家联系人电话查询（敏感信息）**：
  抱歉，厂家联系人电话暂没有开放查询权限。如需联系厂家，请通过其他渠道获取。

- **示例5：成本查询（数据库无记录）**：
  数据库中暂无150m³化粪池的成本信息。正在从网络搜索补充...
  [搜索结果...]

  注：此数据来自网络搜索，仅供参考。

### 4. 报价场景（区分简单报价与完整项目报价）

#### 4.1 简单报价（默认）
- 识别：用户问"多少钱"、"价格"、"报价单"、"3方化粪池多少钱"等（未提到安装/运输/项目施工）
- 响应：**直接生成报价单，不追问额外信息**
- 原则：
  - 根据已有数据直接给出产品价格和简单报价单
  - 报价单底部必须标注："注：本报价为产品裸价，不含运费、安装费、税费。如需含税价或运输安装服务，请告知。"
  - 不要询问客户信息、安装地址等，除非用户主动需要
- 示例：
  "| 产品名称 | 规格 | 品牌 | 数量 | 单价 | 小计 |
  |---------|------|------|------|------|------|
  | 玻璃钢化粪池 | 100m³ | 普耐尔 | 1 | ¥28,000 | ¥28,000 |
  **总计：¥28,000**
  注：本报价为产品裸价，不含运费、安装费、税费。如需含税价或运输安装服务，请告知。"

#### 4.2 完整项目报价
- 识别：用户提到"安装"、"运输"、"项目报价"、"含税含运"、"包安装"等
- 响应：提示需要更多信息才能精确报价
- 内容：
  "由于运输距离、安装现场条件等因素影响，无法直接给出准确报价。请提供：
  1. 项目地址（用于计算运费）
  2. 安装现场条件（是否需要吊车、挖掘机等）
  3. 是否需要含税发票
  或者您可以选择：仅采购产品（自行安装）/ 联系我们安排现场勘测后报价"

#### 4.3 报价单格式要求
- 报价单号格式：QT + 年月日(8位) + 3位序号，如 QT20260406001
- 供应方信息必须使用【供应方信息】区块中提供的数据（公司名称、地址、联系人、电话、税号、开户行等），**严禁编造或使用默认假数据**
- 采购方信息必须使用【采购方/客户信息】区块中提供的数据
- 如果未提供供应方或客户信息，在报价单中标注"待填写"
- **供需双方信息必须使用左右分栏表格布局**，供应方在左、采购方在右，格式如下：
  ### 供需双方信息
  | **供方（报价方）** | **需方（采购方）** |
  |:---|:---|
  | **公司名称：** XXX公司 | **公司名称：** XXX公司 |
  | **联系人：** 张三 | **联系人：** 李四 |
  | **联系电话：** 138xxxx | **联系电话：** 139xxxx |
  | **公司地址：** XX省XX市XX路 | **公司地址：** XX省XX市XX路 |
  | **税号：** 91xxxxx | |
  - 禁止用单行堆叠的内联格式（如"供方：XX公司 | 联系人：XX | 电话：XX"）
  - 禁止为供需双方各写一个独立大表格

### 5. 技术咨询场景
- 识别：用户问"怎么选"、"工艺对比"、"A/O和MBR哪个好"等
- 响应：提供专业的技术分析、工艺对比、选型建议
- 内容：技术参数、优缺点对比、适用场景、价格影响等

### 5. 模糊表达处理
- 识别：用户说"60吨的怎么报价？"、"帮忙看看这个"
- 响应：智能推断用户需求，主动提供帮助
- 示例：
  "我理解您想了解60吨/天项目的报价。让我为您：
  1. 先生成详细的技术方案和配置清单
  2. 然后提供准确的报价
  现在开始生成方案..."

### 6. 通用问答场景
- 识别：用户问任何与报价无关的问题（如"帮我写一封邮件"、"Python怎么学"、"今天天气怎么样"）
- 响应：像通用 AI 助手一样，准确、有用、友好地回答
- 原则：
  - 不要强行引导到报价话题
  - 先直接回答用户的问题
  - 回复结束后可以轻描淡写提一句"如果您有设备报价或技术方案的需求，也可以随时找我"
- 示例：
  "关于您问的这个问题，我的理解是...[详细回答]。如果您有设备报价或技术方案的需求，也可以随时找我。"

### 7. 文档处理场景
- 识别：用户上传文件、图片、PDF、Excel、图纸等
- 响应：分析上传的文件，提取关键信息，询问是否需要生成方案或报价

## 文档格式规范（商务风格）

当你生成技术方案或报价单时，必须遵循以下格式规范：

### 0. 整体排版原则（重要！）
- **按章节组织内容**：每个主要部分独立成节，使用编号标题
- **表格优先**：凡是可以用表格呈现的内容，必须使用表格
  - 配置清单、参数对比、设备清单等必须用表格
  - 避免用列表或段落描述表格内容
- **视觉层次**：通过标题、空行、分隔线建立清晰的视觉层次
- **便于阅读**：段落不要太长，适当分段，重点突出

### 1. 章节编号格式（非常重要！必须严格遵循！）

**层级说明（CRITICAL）**：
- **文档标题**：整个文档的标题，**不带编号**，仅用一个井号表示标题
- **一级章节**：文档的主要部分/模块，**必须使用**中文编号格式（如"一、"、"二、"）
- **二级章节**：一级章节下的细分内容，**必须使用**数字编号（如"1.1"、"2.1"）
- **三级章节**：二级章节下的细分内容，**必须使用**数字编号（如"1.1.1"）
- **四级章节**：三级章节下的细分内容，**必须使用**数字编号（如"1.1.1.1"）

**具体规则（必须严格执行！）**：

**1. 文档标题（不带编号）**：
- 文档开头的总标题，不带任何编号
- 格式：使用单个井号开头，后面直接跟标题，不加编号
- 示例：
  - 单个井号 + 垃圾转运站渗滤液处理项目技术方案
  - 单个井号 + 60吨/天污水处理项目报价单

**2. 一级章节（#）- 文档的主要模块（强制使用中文编号！）**：
- 文档的**主要部分**或**独立模块**
- **格式（强制，二选一）**：
  - **格式A（推荐）**：单个井号 + 中文编号 + 标题（如"一、XXX"、"二、XXX"、"三、XXX"）
  - **格式B（允许）**：单个井号 + 第X章 + 标题（如"第一章 XXX"、"第二章 XXX"、"第三章 XXX"）
- **严格禁止**：不要使用纯数字编号（如"1. XXX"）、"0.1"格式
- **示例（格式A）**：
  - 单个井号 + 一、项目概述
  - 单个井号 + 二、工艺比选与确定
  - 单个井号 + 三、设备配置清单
  - 单个井号 + 四、成本分析
- **示例（格式B）**：
  - 单个井号 + 第一章 项目概述
  - 单个井号 + 第二章 工艺比选与确定
  - 单个井号 + 第三章 设备配置清单
  - 单个井号 + 第四章 成本分析

**3. 二级章节（##）- 一级章节的细分（从1.1开始！）**：
- 一级章节下的具体内容
- **格式（强制）**：两个井号 + 数字编号 + 标题（如"1.1 XXX"、"2.1 XXX"）
- **第一个一级章节的第一个二级必须是1.1**，绝对不能是0.1！
- **示例**：
  - 在"一、项目概述"下：两个井号 + 1.1 工程背景、两个井号 + 1.2 建设规模
  - 在"二、工艺比选与确定"下：两个井号 + 2.1 工艺方案对比、两个井号 + 2.2 推荐工艺

**4. 三级章节（###）- 二级章节的细分**：
- 二级章节下的具体内容
- **格式（强制）**：三个井号 + 数字编号 + 标题（如"1.1.1 XXX"、"1.1.2 XXX"）
- **示例**：
  - 在"1.1 工程背景"下：三个井号 + 1.1.1 项目地点、三个井号 + 1.1.2 周边环境

**5. 四级章节（####）- 三级章节的细分**：
- 仅在必要时使用
- **格式（强制）**：四个井号 + 数字编号 + 标题（如"1.1.1.1 XXX"）

**严格规则（CRITICAL，违反即错误！）**：
- ✅ 文档标题：单个井号 + 标题（无编号）
- ✅ 一级章节（格式A）：单个井号 + 中文编号 + 标题（必须用"一、"、"二、"等）
- ✅ 一级章节（格式B）：单个井号 + 第X章 + 标题（可以用"第一章"、"第二章"等）
- ✅ 二级章节：两个井号 + 数字编号 + 标题（必须从1.1开始，不能是0.1）
- ✅ 三级章节：三个井号 + 数字编号 + 标题（必须有编号）
- ✅ 四级章节：四个井号 + 数字编号 + 标题（必须有编号）
- ❌ 禁止：文档标题带编号（如单个井号 + 一、文档标题）
- ❌ 禁止：一级章节无编号（如单个井号 + 项目概述）
- ❌ 禁止：一级章节使用纯数字编号（如单个井号 + 1. 项目概述、单个井号 + 0.1 项目概述）
- ❌ 禁止：二级章节从0.1开始（必须从1.1开始）
- ❌ 禁止：混用编号格式（如同时使用"一、"和"1."）

**完整示例**：
\`\`\`
# 垃圾转运站渗滤液处理项目技术方案

# 一、项目概述
## 1.1 工程背景
### 1.1.1 项目地点
### 1.1.2 周边环境
## 1.2 建设规模

# 二、工艺比选与确定
## 2.1 工艺方案对比
## 2.2 推荐工艺

# 三、设备配置清单
\`\`\`

### 2. 标题格式
- 一级标题：\` # 编号 标题 \`（用于文档大标题）
- 二级标题：\` ## 编号 标题 \`（用于主要章节）
- 三级标题：\` ### 编号 标题 \`（用于子章节）
- **必须**包含编号前缀，如 \` ## 1.1 项目概述 \`
- **禁止**写 \` ## 项目概述 \`（没有编号）

### 3. 表格格式（重要！）
- **必须使用表格**：凡是可以用表格呈现的内容（参数、配置、清单、对比等），必须用表格
- **表格结构**：
  - 第一行：表头（字段名称）
  - 第二行开始：数据行
  - 每列有明确的表头，如"设备名称"、"规格参数"、"数量"等
- **详细设备配置清单表格必须包含的列**：
  - 序号
  - 设备名称
  - 规格型号/参数
  - 单位
  - 数量
  - 材质
  - 单价（元）- **必须包含**
  - 小计（元）- **必须包含**
  - 备注
- **禁止使用对齐符号**：不要用 \` :--- \` 这种对齐标记
- 正确格式：
| 指标 | CODcr (mg/L) | BOD5 (mg/L) | NH3-N (mg/L) |
| 范围 | 10000 - 30000 | 4000 - 10000 | 800 - 2000 |
| 设计值 | 20000 | 8000 | 1500 |
- 详细设备配置清单表格格式：
|序号|设备名称|规格型号/参数|单位|数量|材质|单价（元）|小计（元）|备注|
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
|1|机械格栅|栅隙3mm，N=0.55kW|台|1|304不锈钢|12000|12000| |
|2|调节池提升泵|Q=1m³/h，H=15m，N=0.75kW|台|2|耐腐蚀|3500|7000|一用一备|
- **禁止**写 \` | :--- | :--- | :--- | \` 这种对齐行
- **禁止**用列表或段落描述表格内容**：如下面的反例必须避免
  - ❌ 错误：设备1：XX型号，参数A：100，参数B：200；设备2：YY型号，参数A：150，参数B：250
  - ✅ 正确：用表格呈现（设备名称 | 型号 | 参数A | 参数B | XX | XX型号 | 100 | 200 | YY | YY型号 | 150 | 250）
- **表格内容格式**：
  - 单价、总价等金额不需要加粗，数字保留两位小数
  - 数值单位统一放在数值后，如 \` 20000 mg/L \`
  - 表格单元格内容避免过长，必要时换行

### 4. 序号格式
- 有序列表：使用 \` 1. \`（点号后加一个空格）
- **禁止**在数字后加多个空格，如 \` 1.  \`（两个空格）是错误的
- 正确：\` 1. 项目背景 \`
- 错误：\` 1.  项目背景 \`（多了一个空格）
- 列表项不需要编号，编号应该在标题中使用

### 5. 无序列表格式
- 统一使用 \` - \`（短横线加空格）
- 不要混用 \` * \` 或 \` + \`
- 嵌套列表使用2个空格缩进

### 6. 加粗使用规范
- **适度加粗**：只在关键词、重要数据、核心观点处加粗
- **禁止**整段加粗
- **禁止**过度加粗（一段中不要超过3处加粗）
- 数字、单位不用加粗（除非是特别强调）

### 7. 段落格式
- 段落之间空一行（不要紧挨着）
- 段落首行不缩进
- 避免过长的段落（超过5行建议分段）

### 8. 特殊符号
- **禁止**使用过多的特殊符号装饰
- 不用 \` ※ ★ ◆ \` 等符号
- 不用 \` === --- \` 等分隔线（除非是Markdown原生语法）
- 列表项统一用 \` - \`，不要用 emoji

### 9. 商务风格要求
- 语言正式、专业、简洁
- 避免口语化表达（如"咱们"、"那个"）
- 避免感叹号和情绪化词语
- 使用专业术语，避免模糊表达

## 响应格式

请直接输出Markdown格式的回复，包含：
1. 主要内容（直接回答用户问题）
2. 可选：建议的后续问题（帮助用户补充信息）
3. 可选：快速操作建议（让用户知道还能做什么）

## 重要提醒

- ✅ 不要预设固定的意图类型，真正理解用户的语义
- ✅ 用户说"方案"时，直接生成方案，不要问"产品型号"
- ✅ 用户说"你好"时，友好回应并引导需求
- ✅ 保持专业、友好、主动的服务态度
- ✅ **生成文档时严格遵循上述格式规范**
- ❌ 不要机械地回复固定模板
- ❌ 不要在没有理解意图时就询问信息
- ❌ **禁止在表格中使用对齐符号**
- ❌ **禁止过度加粗和使用装饰符号**`;

    // 如果有文件上传，添加额外指令
    if (processedInput && processedInput.type !== 'text') {
      prompt += `\n\n## 文件上传处理\n`;
      prompt += `用户上传了${processedInput.type}类型的文件，内容如下：\n`;
      prompt += `${processedInput.textContent}\n\n`;
      prompt += `请根据文件内容智能识别用户需求：`;
      prompt += `- 如果是产品清单 → 解析产品并询问用户意图（报价/分析）\n`;
      prompt += `- 如果是技术文档 → 提取关键信息并提供专业建议\n`;
    }

    return prompt;
  }

  /**
   * 直接从数据库匹配结果构建精确的产品数据响应（bypass AI，消除幻觉）
   */
  private buildDatabaseResponse(priceData: PriceMatchResult): string {
    let response = '';

    const productName = priceData.productName || '未知产品';
    const model = priceData.model || '-';
    const brand = priceData.brand || '-';
    const price = priceData.price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const source = priceData.source === 'database' ? '产品库' : this.getPriceSourceText(priceData.source);
    const confidence = priceData.confidence;

    response += `根据产品库查询，${productName}的信息如下：\n\n`;

    // 构建精确数据表格
    response += `| 产品名称 | 规格型号 | 单价（元） | 价格来源 | 备注 |\n`;
    response += `| --- | --- | --- | --- | --- |\n`;
    response += `| ${productName} | ${model} | ${price} | ${source} | 置信度 ${confidence}%`;

    // 品牌信息
    if (priceData.brand) {
      response += `，品牌：${priceData.brand}`;
    }
    response += ` |\n`;

    response += `\n`;
    response += `> 此价格来自产品知识库数据库。`;

    // 成本价
    if (priceData.costPrice) {
      const costFormatted = priceData.costPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      response += `成本价：¥${costFormatted}。`;
    }

    // 最低售价
    if (priceData.minPrice) {
      const minFormatted = priceData.minPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      response += `最低售价：¥${minFormatted}。`;
    }

    response += `\n`;

    // 参数描述
    if (priceData.parameterDescription) {
      response += `\n**产品参数**：\n`;
      response += `${priceData.parameterDescription}\n`;
    }

    // 厂家信息
    if (priceData.supplier) {
      response += `\n**供应商**：${priceData.supplier}`;
      if (priceData.contactPhone) {
        response += ` | 联系电话：${priceData.contactPhone}`;
      }
      response += `\n`;
    }

    return response;
  }

  /**
   * 价格校验 — 检测并修正 AI 回复中的价格幻觉
   * 当 AI 回复中的价格与数据库提供的价格不一致时，自动替换为正确价格
   */
  private correctPriceHallucination(aiContent: string, priceContext: string): string {
    let corrected = aiContent;

    // 从数据库上下文中提取所有价格字段
    const priceFields: { field: string; value: string; numValue: number }[] = [];

    // 匹配 "单价：1745.00 元" / "单价：3,500 元"
    const unitPriceMatch = priceContext.match(/单价：([\d,.]+)\s*元/);
    if (unitPriceMatch) {
      const raw = unitPriceMatch[1].replace(/,/g, '');
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) {
        priceFields.push({ field: '单价', value: unitPriceMatch[1], numValue: num });
      }
    }

    // 匹配 "成本：960.00 元"
    const costPriceMatch = priceContext.match(/成本：([\d,.]+)\s*元/);
    if (costPriceMatch) {
      const raw = costPriceMatch[1].replace(/,/g, '');
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) {
        priceFields.push({ field: '成本', value: costPriceMatch[1], numValue: num });
      }
    }

    // 匹配 "最低售价：1600.00 元"
    const minPriceMatch = priceContext.match(/最低售价：([\d,.]+)\s*元/);
    if (minPriceMatch) {
      const raw = minPriceMatch[1].replace(/,/g, '');
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) {
        priceFields.push({ field: '最低售价', value: minPriceMatch[1], numValue: num });
      }
    }

    if (priceFields.length === 0) return aiContent;

    // 从 AI 回复中查找所有价格数字（表格中 | ¥数字 | 格式）
    // 匹配 Markdown 表格中的价格：| ¥1,600 | 或 | ¥1,600.00 |
    const tablePricePattern = /\|\s*¥([\d,.]+)\s*\|/g;
    let match;
    while ((match = tablePricePattern.exec(aiContent)) !== null) {
      const rawPrice = match[1].replace(/,/g, '');
      const aiPrice = parseFloat(rawPrice);
      if (isNaN(aiPrice) || aiPrice <= 0) continue;

      // 检查 AI 价格是否与数据库中的任何一个价格匹配
      const isMatch = priceFields.some(pf => Math.abs(pf.numValue - aiPrice) < 1);
      if (!isMatch) {
        // AI 幻觉：用数据库单价替换
        const dbPrice = priceFields[0]; // 优先用单价
        const formattedPrice = dbPrice.numValue.toLocaleString('zh-CN', {
          minimumFractionDigits: dbPrice.value.includes('.') ? dbPrice.value.split('.')[1].length : 0,
          maximumFractionDigits: 2,
        });
        const oldText = match[0];
        const newText = `| ¥${formattedPrice} |`;
        corrected = corrected.replace(oldText, newText);
        console.log(`[SmartChatProcessor] 价格修正: ${match[1]} -> ${formattedPrice} (数据库${dbPrice.field}: ${dbPrice.value})`);
      }
    }

    // 也检查 "单价（元）" 表头对应的列值
    // 匹配类似 "| 3,500.00 | 产品库 |" 的表格价格单元格（含逗号分隔符）
    const plainPricePattern = /\|\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*\|/g;
    while ((match = plainPricePattern.exec(corrected)) !== null) {
      const rawPrice = match[1].replace(/,/g, '');
      const aiPrice = parseFloat(rawPrice);
      if (isNaN(aiPrice) || aiPrice <= 0) continue;

      const isMatch = priceFields.some(pf => Math.abs(pf.numValue - aiPrice) < 1);
      if (!isMatch) {
        const dbPrice = priceFields[0];
        const formattedPrice = dbPrice.numValue.toLocaleString('zh-CN', {
          minimumFractionDigits: dbPrice.value.includes('.') ? dbPrice.value.split('.')[1].length : 0,
          maximumFractionDigits: 2,
        });
        const oldText = match[0];
        const newText = `| ${formattedPrice} |`;
        corrected = corrected.replace(oldText, newText);
        console.log(`[SmartChatProcessor] 价格修正: ${match[1]} -> ${formattedPrice} (数据库${dbPrice.field}: ${dbPrice.value})`);
      }
    }

    return corrected;
  }

  /**
   * 格式化对话历史
   */
  private formatHistoryForLLM(
    history: ConversationContext['history']
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    // 只保留最近的10轮对话，避免上下文过长
    const recentHistory = history.slice(-10);
    return recentHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * 解析 LLM 响应
   */
  private parseLLMResponse(llmResponse: string): {
    content: string;
    intent?: string;
    suggestions?: string[];
    requiresFollowUp?: boolean;
    followUpQuestions?: string[];
    confidence?: number;
    entities?: any;
  } {
    // 简单解析：将整个响应作为内容
    // 实际可以根据需要解析结构化数据

    const content = llmResponse.trim();

    // 提取建议的问题（可选）
    const followUpQuestions: string[] = [];
    const followUpMatch = content.match(/(?:为了|请告诉我|请问)[^？]*？/g);
    if (followUpMatch) {
      followUpMatch.forEach((match) => {
        const question = match.trim();
        if (question.length > 5 && question.length < 100) {
          followUpQuestions.push(question);
        }
      });
    }

    // 提取建议的操作（可选）
    const suggestions: string[] = [];
    const suggestionKeywords = ['生成', '提供', '查询', '对比', '分析', '设计'];
    suggestionKeywords.forEach((keyword) => {
      const regex = new RegExp(`(您)?我?可以(为您)?${keyword}[^。，]*`, 'g');
      const matches = content.match(regex);
      if (matches) {
        suggestions.push(...matches.slice(0, 3));
      }
    });

    return {
      content,
      intent: this.detectIntentFromContent(content),
      suggestions: suggestions.slice(0, 4),
      requiresFollowUp: followUpQuestions.length > 0,
      followUpQuestions: followUpQuestions.slice(0, 3),
      confidence: 0.9, // LLM 直接生成的响应置信度较高
      entities: {},
    };
  }

  /**
   * 从内容中推断意图（动态，不固定）
   */
  private detectIntentFromContent(content: string): string {
    if (content.includes('您好') || content.includes('早上好') || content.includes('下午好')) {
      return 'greeting';
    }
    if (content.includes('方案') || content.includes('设计') || content.includes('工艺')) {
      return 'proposal';
    }
    if (content.includes('报价') || content.includes('价格') || content.includes('报价单')) {
      return 'quote';
    }
    if (content.includes('技术') || content.includes('选型') || content.includes('工艺对比')) {
      return 'technical';
    }
    return 'general';
  }

  /**
   * 获取对话上下文
   */
  private getOrCreateContext(conversationId?: string): ConversationContext {
    if (!conversationId) {
      return {
        history: [],
      };
    }

    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        conversationId,
        history: [],
      });
    }

    return this.conversations.get(conversationId)!;
  }

  /**
   * 更新对话上下文
   */
  private updateContext(context: ConversationContext, userInput: string, response: string): void {
    context.history.push({
      role: 'user',
      content: userInput,
    });

    context.history.push({
      role: 'assistant',
      content: response,
    });

    // 更新最后讨论的主题
    context.lastTopic = this.extractLastTopic(response);
    context.lastUserInput = userInput;
    context.lastResponse = response;

    // 限制历史长度，避免无限增长
    if (context.history.length > 20) {
      context.history = context.history.slice(-20);
    }
  }

  /**
   * 提取最后讨论的主题
   */
  private extractLastTopic(content: string): string {
    // 简单提取：从内容中提取关键词
    if (content.includes('污水')) return '污水处理';
    if (content.includes('泵')) return '水泵设备';
    if (content.includes('方案')) return '技术方案';
    if (content.includes('报价')) return '报价';
    return '一般咨询';
  }

  /**
   * 使用文件信息增强输入
   */
  private enrichInputWithFileInfo(userInput: string, processedInput: ProcessedInput): string {
    return `【文件上传】\n文件类型：${processedInput.type}\n文件内容：\n${processedInput.textContent}\n\n用户问题：${userInput}`;
  }

  /**
   * 获取备用响应（LLM 调用失败时）
   */
  private getFallbackResponse(userInput: string): SmartResponse {
    return {
      content: `抱歉，我暂时无法处理您的请求。请稍后重试或联系技术支持。\n\n您输入的内容：${userInput}`,
      metadata: {
        inputType: 'text',
        confidence: 0.3,
      },
    };
  }

  /**
   * 清理对话历史（可选）
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * 获取对话历史（用于调试）
   */
  getConversationHistory(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * 创建测试产品数据（用于调试）
   */
  private createTestProducts(): any[] {
    console.log('创建测试产品数据');
    return [
      {
        productName: '空压机',
        model: 'JRH004AM-120L',
        brand: '杰瑞浩',
        parameters: {
          flowRate: 0.5,
          pressure: 0.8,
          power: 4,
          voltage: '380V',
          controlType: '永磁变频',
          tankType: '单储气罐'
        },
        price: 6916,
        minPrice: 4882,
        guidePrice: 6916,
        matchScore: 240,
        matchLevel: 1,
        matchDetails: {
          flowRate: '✓ 精确匹配',
          pressure: '✓ 压力匹配',
          voltage: '✓ 电压匹配'
        }
      },
      {
        productName: '空压机',
        model: 'JRH004-120L',
        brand: '杰瑞浩',
        parameters: {
          flowRate: 0.6,
          pressure: 0.8,
          power: 4,
          voltage: '380V',
          controlType: '工频',
          tankType: '单储气罐'
        },
        price: 6916,
        minPrice: 4882,
        guidePrice: 6916,
        matchScore: 190,
        matchLevel: 2,
        matchDetails: {
          flowRate: '≈ 0.6 (相近)',
          pressure: '✓ 压力匹配',
          voltage: '✓ 电压匹配'
        }
      },
      {
        productName: '空压机',
        model: 'JRH005AM-120L',
        brand: '杰瑞浩',
        parameters: {
          flowRate: 0.6,
          pressure: 0.8,
          power: 5.5,
          voltage: '380V',
          controlType: '永磁变频',
          tankType: '单储气罐'
        },
        price: 7416,
        minPrice: 5235,
        guidePrice: 7416,
        matchScore: 170,
        matchLevel: 2,
        matchDetails: {
          flowRate: '≈ 0.6 (相近)',
          pressure: '✓ 压力匹配',
          voltage: '✓ 电压匹配'
        }
      }
    ];
  }
}

// 导出单例
export const smartChatProcessor = new SmartChatProcessor();
