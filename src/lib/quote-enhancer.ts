/**
 * 智能报价增强器
 * 
 * 功能：
 * 1. 使用联网搜索获取市场价格
 * 2. 使用向量模型推荐相似产品
 * 3. 使用生图模型生成产品图
 * 
 * 集成到报价生成流程中
 */

import { cozeTools, MarketPriceInfo, SimilarProduct, GeneratedImage } from './coze-tools';
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

export interface QuoteEnhancementResult {
  products: EnhancedProduct[];
  summary: {
    totalProducts: number;
    productsWithMarketPrice: number;
    productsWithSimilarProducts: number;
    productsWithImages: number;
    totalValue: number;
    marketTotalValue?: number;
    priceDifference?: number;
    priceDifferencePercent?: number;
  };
  usedTools: {
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
      productDatabase?: Product[];
    } = {}
  ): Promise<QuoteEnhancementResult> {
    const {
      enableMarketPrice = true,
      enableSimilarProducts = true,
      enableProductImages = false,
      productDatabase = [],
    } = options;

    Logger.info(`开始增强报价单，产品数量: ${products.length}`);

    const usedTools = {
      webSearch: false,
      embedding: false,
      imageGeneration: false,
    };

    // 并行处理所有产品
    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        const enhanced: EnhancedProduct = { ...product };

        // 1. 获取市场价格
        if (enableMarketPrice && cozeTools.isAvailable()) {
          const marketPrice = await this.getProductMarketPrice(product.name);
          if (marketPrice) {
            enhanced.marketPrice = marketPrice;
            usedTools.webSearch = true;
            
            // 计算价格调整建议
            enhanced.priceAdjustment = this.calculatePriceAdjustment(
              product.price,
              marketPrice.averagePrice
            );
          }
        }

        // 2. 推荐相似产品
        if (enableSimilarProducts && productDatabase.length > 0) {
          const similarProducts = await this.getSimilarProducts(
            product.name,
            productDatabase
          );
          if (similarProducts.length > 0) {
            enhanced.similarProducts = similarProducts;
            usedTools.embedding = true;
          }
        }

        // 3. 生成产品图
        if (enableProductImages && cozeTools.isAvailable()) {
          const productImage = await this.getProductImage(
            product.name,
            product.specs
          );
          if (productImage) {
            enhanced.productImage = productImage;
            usedTools.imageGeneration = true;
          }
        }

        return enhanced;
      })
    );

    // 生成摘要
    const summary = this.generateSummary(enhancedProducts);

    Logger.info('报价单增强完成', {
      使用工具: usedTools,
      摘要: summary,
    });

    return {
      products: enhancedProducts,
      summary,
      usedTools,
    };
  }

  /**
   * 获取产品市场价格（带缓存）
   */
  private async getProductMarketPrice(
    productName: string
  ): Promise<MarketPriceInfo | null> {
    // 检查缓存
    if (this.productCache.has(productName)) {
      Logger.debug(`使用缓存的市场价格: ${productName}`);
      return this.productCache.get(productName)!;
    }

    // 调用Coze工具
    const marketPrice = await cozeTools.searchMarketPrice(productName);
    
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
    const similarProducts = await cozeTools.searchSimilarProducts(
      productName,
      productDatabase.map(p => ({
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
    return await cozeTools.generateProductImage(productName, specs);
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
   * 生成摘要
   */
  private generateSummary(products: EnhancedProduct[]): QuoteEnhancementResult['summary'] {
    const totalProducts = products.length;
    const productsWithMarketPrice = products.filter(
      p => p.marketPrice !== undefined
    ).length;
    const productsWithSimilarProducts = products.filter(
      p => p.similarProducts && p.similarProducts.length > 0
    ).length;
    const productsWithImages = products.filter(
      p => p.productImage !== undefined
    ).length;

    const totalValue = products.reduce((sum, p) => sum + p.total, 0);
    const marketTotalValue = products
      .filter(p => p.marketPrice !== undefined)
      .reduce((sum, p) => sum + (p.marketPrice!.averagePrice * p.quantity), 0);

    const summary: QuoteEnhancementResult['summary'] = {
      totalProducts,
      productsWithMarketPrice,
      productsWithSimilarProducts,
      productsWithImages,
      totalValue,
    };

    if (marketTotalValue > 0) {
      summary.marketTotalValue = marketTotalValue;
      summary.priceDifference = marketTotalValue - totalValue;
      summary.priceDifferencePercent = (
        (summary.priceDifference / marketTotalValue) * 100
      );
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

// ============================================================================
// 导出单例实例
// ============================================================================

export const quoteEnhancer = new QuoteEnhancer();

// 导出类型
export type {
  Product,
  EnhancedProduct,
  QuoteEnhancementResult,
};
