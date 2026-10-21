/**
 * 智能报价增强器
 *
 * 功能：
 * 1. 使用联网搜索获取市场价格（Coze Web Search）
 * 2. 使用向量模型推荐相似产品（Coze Embedding）
 * 3. 使用生图模型生成产品图（Coze Image Generation）
 * 4. 使用 DeepSeek 生成智能价格优化建议（DeepSeek）
 *
 * 集成到报价生成流程中，支持智能服务选择和降级
 */

import { cozeToolsService, MarketPriceInfo, SimilarProduct, GeneratedImage } from './coze-tools';
import { callDeepSeekChat } from './deepseek-client';
import { aiServiceSelector } from './ai-service-selector';
import { Logger } from './logger';

// ============================================================================
// 产品类型
// ============================================================================

export interface Product {
  id?: string;
  name: string;
  model?: string;
  brand?: string;
  specs?: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  remark?: string;
  category?: string;
}

export interface EnhancedProduct extends Product {
  marketPrice?: MarketPriceInfo;
  similarProducts?: SimilarProduct[];
  productImage?: GeneratedImage;
  priceAdjustment?: {
    type: 'increase' | 'decrease' | 'keep';
    reason: string;
    suggestedPrice: number;
  };
}

export interface PriceOptimizationSuggestion {
  product: string;
  currentPrice: number;
  suggestedPrice: number;
  adjustmentType: 'increase' | 'decrease' | 'keep';
  adjustmentPercent: number;
  reason: string;
  confidence: number;
  marketContext?: string;
  competitorAnalysis?: string;
}

export interface QuoteEnhancementResult {
  products: EnhancedProduct[];
  summary: {
    totalProducts: number;
    productsWithMarketPrice: number;
    productsWithSimilarProducts: number;
    productsWithImages: number;
    productsWithPriceOptimization: number;
    totalValue: number;
    marketTotalValue?: number;
    priceDifference?: number;
    priceDifferencePercent?: number;
  };
  priceOptimizations?: PriceOptimizationSuggestion[];
  usedTools: {
    deepseek: boolean;
    webSearch: boolean;
    embedding: boolean;
    imageGeneration: boolean;
  };
}

// ============================================================================
// 智能报价增强器
// ============================================================================

export class QuoteEnhancer {
  private productCache: Map<string, MarketPriceInfo>;
  private similarProductsCache: Map<string, SimilarProduct[]>;

  constructor() {
    this.productCache = new Map();
    this.similarProductsCache = new Map();
  }

  /**
   * 增强报价单
   * @param products 产品列表
   * @param options 配置选项
   * @returns 增强后的报价单
   */
  async enhanceQuote(
    products: Product[],
    options: {
      enableMarketPrice?: boolean;
      enableSimilarProducts?: boolean;
      enableProductImages?: boolean;
      enablePriceOptimization?: boolean;
      productDatabase?: Product[];
    } = {}
  ): Promise<QuoteEnhancementResult> {
    const {
      enableMarketPrice = true,
      enableSimilarProducts = true,
      enableProductImages = false,
      enablePriceOptimization = true,
      productDatabase = [],
    } = options;

    Logger.info(`开始增强报价单，产品数量: ${products.length}`);

    const usedTools = {
      deepseek: false,
      webSearch: false,
      embedding: false,
      imageGeneration: false,
    };

    // 并行处理所有产品
    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        const enhanced: EnhancedProduct = { ...product };

        // 1. 获取市场价格（使用 Coze Web Search）
        if (
          enableMarketPrice &&
          cozeToolsService.getStatus().enabled &&
          cozeToolsService.getStatus().webSearchEnabled
        ) {
          const marketPrice = await this.getProductMarketPrice(product.name);
          if (marketPrice) {
            enhanced.marketPrice = marketPrice;
            usedTools.webSearch = true;

            // 计算基础价格调整建议
            enhanced.priceAdjustment = this.calculatePriceAdjustment(
              product.price,
              marketPrice.averagePrice
            );
          }
        }

        // 2. 推荐相似产品（使用 Coze Embedding）
        if (enableSimilarProducts && productDatabase.length > 0) {
          const similarProducts = await this.getSimilarProducts(product.name, productDatabase);
          if (similarProducts.length > 0) {
            enhanced.similarProducts = similarProducts;
            usedTools.embedding = true;
          }
        }

        // 3. 生成产品图（使用 Coze Image Generation）
        if (
          enableProductImages &&
          cozeToolsService.getStatus().enabled &&
          cozeToolsService.getStatus().imageGenerationEnabled
        ) {
          const productImage = await this.getProductImage(product.name, product.specs);
          if (productImage) {
            enhanced.productImage = productImage;
            usedTools.imageGeneration = true;
          }
        }

        return enhanced;
      })
    );

    // 4. 使用 DeepSeek 生成智能价格优化建议
    let priceOptimizations: PriceOptimizationSuggestion[] = [];
    if (enablePriceOptimization) {
      priceOptimizations = await this.generatePriceOptimizations(
        enhancedProducts,
        usedTools.webSearch
      );
      if (priceOptimizations.length > 0) {
        usedTools.deepseek = true;
      }
    }

    // 生成摘要
    const summary = this.generateSummary(enhancedProducts, priceOptimizations);

    Logger.info('报价单增强完成', {
      使用工具: usedTools,
      摘要: summary,
    });

    return {
      products: enhancedProducts,
      summary,
      priceOptimizations: priceOptimizations.length > 0 ? priceOptimizations : undefined,
      usedTools,
    };
  }

  /**
   * 获取产品市场价格（带缓存）
   */
  private async getProductMarketPrice(productName: string): Promise<MarketPriceInfo | null> {
    // 检查缓存
    if (this.productCache.has(productName)) {
      Logger.debug(`使用缓存的市场价格: ${productName}`);
      return this.productCache.get(productName)!;
    }

    // 调用Coze工具
    const marketPrice = await cozeToolsService.searchMarketPrice(productName);

    // 缓存结果
    if (marketPrice) {
      this.productCache.set(productName, marketPrice);
    }

    return marketPrice;
  }

  /**
   * 获取相似产品（带缓存）
   */
  private async getSimilarProducts(
    productName: string,
    productDatabase: Product[]
  ): Promise<SimilarProduct[]> {
    // 检查缓存
    if (this.similarProductsCache.has(productName)) {
      Logger.debug(`使用缓存的相似产品: ${productName}`);
      return this.similarProductsCache.get(productName)!;
    }

    // 调用Coze工具
    const similarProducts = await cozeToolsService.searchSimilarProducts(
      productName,
      productDatabase.map((p) => ({
        id: p.id || p.name,
        name: p.name,
        price: p.price,
        specs: p.specs || '',
      }))
    );

    // 缓存结果
    if (similarProducts.length > 0) {
      this.similarProductsCache.set(productName, similarProducts);
    }

    return similarProducts;
  }

  /**
   * 生成产品图
   */
  private async getProductImage(
    productName: string,
    specs?: string
  ): Promise<GeneratedImage | null> {
    // 检查缓存（简单实现，实际可以缓存到对象存储）
    return await cozeToolsService.generateProductImage(productName, specs);
  }

  /**
   * 计算价格调整建议
   */
  private calculatePriceAdjustment(
    currentPrice: number,
    marketAveragePrice: number
  ): EnhancedProduct['priceAdjustment'] {
    const difference = marketAveragePrice - currentPrice;
    const differencePercent = (difference / marketAveragePrice) * 100;

    // 差异超过10%时给出建议
    if (Math.abs(differencePercent) > 10) {
      if (differencePercent > 0) {
        return {
          type: 'increase',
          reason: `当前价格比市场均价低 ${Math.abs(differencePercent).toFixed(1)}%`,
          suggestedPrice: marketAveragePrice,
        };
      } else {
        return {
          type: 'decrease',
          reason: `当前价格比市场均价高 ${Math.abs(differencePercent).toFixed(1)}%`,
          suggestedPrice: marketAveragePrice,
        };
      }
    }

    return {
      type: 'keep',
      reason: '当前价格与市场均价基本一致',
      suggestedPrice: currentPrice,
    };
  }

  /**
   * 使用 DeepSeek 生成智能价格优化建议
   */
  private async generatePriceOptimizations(
    products: EnhancedProduct[],
    hasMarketData: boolean
  ): Promise<PriceOptimizationSuggestion[]> {
    Logger.info('[QuoteEnhancer] 使用 DeepSeek 生成智能价格优化建议');

    try {
      // 检查 DeepSeek 是否可用
      if (!process.env.DEEPSEEK_API_KEY) {
        Logger.warn('[QuoteEnhancer] DeepSeek API Key 未配置，跳过价格优化');
        return [];
      }

      // 准备产品数据
      const productsInfo = products.map((p) => ({
        name: p.name,
        currentPrice: p.price,
        marketPrice: p.marketPrice?.averagePrice,
        priceRange: p.marketPrice?.priceRange,
        quantity: p.quantity,
        specs: p.specs || '',
      }));

      // 构建 prompt
      const systemPrompt = `你是一个专业的污水处理设备价格优化专家。你的任务是分析产品报价，并提供智能的价格调整建议。

## 背景
- 当前正在为一个污水处理项目生成报价单
- ${hasMarketData ? '已获取部分产品的市场价格数据' : '暂无市场价格数据，基于行业经验分析'}
- 你需要提供专业、合理、有竞争力的价格建议

## 任务
分析以下产品列表，为每个产品提供价格优化建议。

## 输出格式（JSON）：
[
  {
    "product": "产品名称",
    "currentPrice": 当前价格,
    "suggestedPrice": 建议价格（数字）,
    "adjustmentType": "increase" | "decrease" | "keep",
    "adjustmentPercent": 调整百分比（正数）,
    "reason": "调整原因（简明扼要，20-50字）",
    "confidence": 0.8,
    "marketContext": "市场背景分析（50-100字）",
    "competitorAnalysis": "竞争分析（50-100字）"
  }
]

## 价格调整原则：
1. **increase（提价）**：
   - 产品技术领先，有独特优势
   - 市场供不应求
   - 服务/质量溢价明显

2. **decrease（降价）**：
   - 竞品价格更低
   - 市场竞争激烈
   - 需要提升竞争力

3. **keep（保持）**：
   - 价格与市场持平
   - 产品有差异化优势
   - 价格已经合理

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = JSON.stringify(productsInfo, null, 2);

      // 调用 DeepSeek
      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 2048,
      });

      // 解析响应
      let suggestions: PriceOptimizationSuggestion[] = [];
      try {
        // 提取 JSON（可能包含在代码块中）
        const jsonMatch =
          response.text.match(/```json\s*([\s\S]*?)\s*```/) || response.text.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          suggestions = JSON.parse(response.text);
        }

        // 确保解析结果是数组
        if (!Array.isArray(suggestions)) {
          suggestions = [];
        }

        // 验证数据格式
        suggestions = suggestions.filter(
          (s: any) =>
            s.product && typeof s.currentPrice === 'number' && typeof s.suggestedPrice === 'number'
        );

        Logger.info(`[QuoteEnhancer] DeepSeek 生成了 ${suggestions.length} 条价格优化建议`);
      } catch (parseError) {
        Logger.error('[QuoteEnhancer] 解析 DeepSeek 响应失败:', parseError);
        Logger.debug('[QuoteEnhancer] DeepSeek 原始响应:', response.text);
      }

      return suggestions;
    } catch (error) {
      Logger.error('[QuoteEnhancer] 生成价格优化建议失败:', error);
      return [];
    }
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    products: EnhancedProduct[],
    priceOptimizations: PriceOptimizationSuggestion[] = []
  ): QuoteEnhancementResult['summary'] {
    const totalProducts = products.length;
    const productsWithMarketPrice = products.filter((p) => p.marketPrice !== undefined).length;
    const productsWithSimilarProducts = products.filter(
      (p) => p.similarProducts && p.similarProducts.length > 0
    ).length;
    const productsWithImages = products.filter((p) => p.productImage !== undefined).length;
    const productsWithPriceOptimization = priceOptimizations.length;

    const totalValue = products.reduce((sum, p) => sum + p.total, 0);
    const marketTotalValue = products
      .filter((p) => p.marketPrice !== undefined)
      .reduce((sum, p) => sum + p.marketPrice!.averagePrice * p.quantity, 0);

    const summary: QuoteEnhancementResult['summary'] = {
      totalProducts,
      productsWithMarketPrice,
      productsWithSimilarProducts,
      productsWithImages,
      productsWithPriceOptimization,
      totalValue,
    };

    if (marketTotalValue > 0) {
      summary.marketTotalValue = marketTotalValue;
      summary.priceDifference = marketTotalValue - totalValue;
      summary.priceDifferencePercent = (summary.priceDifference / marketTotalValue) * 100;
    }

    return summary;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.productCache.clear();
    this.similarProductsCache.clear();
    Logger.info('缓存已清空');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      marketPriceCache: this.productCache.size,
      similarProductsCache: this.similarProductsCache.size,
    };
  }
}

// 导出单例实例
export const quoteEnhancer = new QuoteEnhancer();
