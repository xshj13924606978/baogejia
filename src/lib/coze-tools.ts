/**
 * Coze 内置工具集成服务
 * 
 * 功能：
 * 1. 联网搜索 - 实时查询产品市场价格
 * 2. 向量大模型 - 语义化搜索产品库
 * 3. 生图大模型 - 生成产品展示图
 * 
 * 使用说明：
 * 1. 在 .env.local 中配置 COZE_API_KEY
 * 2. 设置 ENABLE_COZE_TOOLS=true 启用功能
 * 3. 调用对应方法使用工具
 */

import { SearchClient, ImageGenerationClient, EmbeddingClient } from 'coze-coding-dev-sdk';
import { Logger } from './logger';

// ============================================================================
// 类型定义
// ============================================================================

export interface WebSearchResult {
  title: string;
  url?: string;
  snippet: string;
  summary?: string;
  publishedDate?: string;
}

export interface MarketPriceInfo {
  productName: string;
  averagePrice: number;
  priceRange: { min: number; max: number };
  suppliers: string[];
  lastUpdated: Date;
  source: 'web_search' | 'database';
}

export interface ProductEmbedding {
  productId: string;
  productName: string;
  embedding: number[];
  category?: string;
}

export interface SimilarProduct {
  productId: string;
  productName: string;
  similarity: number;
  price: number;
  specs: string;
}

export interface GeneratedImage {
  imageUrl: string;
  productName: string;
  prompt: string;
  createdAt: Date;
}

// ============================================================================
// Coze 工具服务类
// ============================================================================

export class CozeToolsService {
  private enabled: boolean;
  private webSearchEnabled: boolean;
  private embeddingEnabled: boolean;
  private imageGenerationEnabled: boolean;
  
  // 客户端实例（懒加载）
  private searchClient: SearchClient | null = null;
  private embeddingClient: EmbeddingClient | null = null;
  private imageGenerationClient: ImageGenerationClient | null = null;

  constructor() {
    this.enabled = process.env.ENABLE_COZE_TOOLS === 'true';
    this.webSearchEnabled = process.env.ENABLE_COZE_WEB_SEARCH === 'true' && this.enabled;
    this.embeddingEnabled = process.env.ENABLE_COZE_EMBEDDING === 'true' && this.enabled;
    this.imageGenerationEnabled = process.env.ENABLE_COZE_IMAGE_GENERATION === 'true' && this.enabled;
    
    this.logStatus();
  }

  private logStatus() {
    Logger.info('Coze工具服务状态:', {
      总开关: this.enabled ? '✅ 已启用' : '⚪ 未启用（等待配置API Key）',
      联网搜索: this.webSearchEnabled ? '✅ 已启用' : '⚪ 未启用',
      向量大模型: this.embeddingEnabled ? '✅ 已启用' : '⚪ 未启用',
      生图大模型: this.imageGenerationEnabled ? '✅ 已启用' : '⚪ 未启用',
    });
  }

  // 获取客户端实例（懒加载）
  private getSearchClient(): SearchClient {
    if (!this.searchClient) {
      this.searchClient = new SearchClient();
    }
    return this.searchClient;
  }

  private getEmbeddingClient(): EmbeddingClient {
    if (!this.embeddingClient) {
      this.embeddingClient = new EmbeddingClient();
    }
    return this.embeddingClient;
  }

  private getImageGenerationClient(): ImageGenerationClient {
    if (!this.imageGenerationClient) {
      this.imageGenerationClient = new ImageGenerationClient();
    }
    return this.imageGenerationClient;
  }

  // ============================================================================
  // 1. 联网搜索功能
  // ============================================================================

  /**
   * 搜索产品市场价格
   * @param productName 产品名称
   * @returns 市场价格信息
   */
  async searchMarketPrice(productName: string): Promise<MarketPriceInfo | null> {
    if (!this.webSearchEnabled) {
      Logger.warn('联网搜索未启用，请配置 COZE_API_KEY');
      return null;
    }

    try {
      Logger.info(`开始搜索产品价格: ${productName}`);
      
      const searchQuery = `${productName} 价格 厂家 报价 批发`;
      const client = this.getSearchClient();
      const response = await client.webSearch(searchQuery, 5, false);

      if (!response.web_items || response.web_items.length === 0) {
        Logger.warn('未找到价格信息');
        return null;
      }

      // 解析价格信息（简化版，实际可以使用更复杂的正则匹配）
      const prices: number[] = [];
      const suppliers: string[] = [];

      response.web_items.forEach((item) => {
        // 提取价格（简单实现）
        const priceMatch = item.snippet?.match(/(\d+(\.\d+)?)/g);
        if (priceMatch) {
          const price = parseFloat(priceMatch[0]);
          if (price > 0 && price < 1000000) { // 过滤异常价格
            prices.push(price);
          }
        }
        
        // 提取供应商名称（简单实现）
        if (item.title) {
          suppliers.push(item.title);
        }
      });

      if (prices.length === 0) {
        Logger.warn('未能从搜索结果中提取价格');
        return null;
      }

      const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      const marketInfo: MarketPriceInfo = {
        productName,
        averagePrice: Math.round(averagePrice),
        priceRange: {
          min: minPrice,
          max: maxPrice,
        },
        suppliers: suppliers.slice(0, 3),
        lastUpdated: new Date(),
        source: 'web_search',
      };

      Logger.info(`搜索完成，平均价格: ${averagePrice} 元`);
      return marketInfo;

    } catch (error) {
      Logger.error('联网搜索失败:', error);
      return null;
    }
  }

  /**
   * 批量搜索多个产品的市场价格
   * @param productNames 产品名称数组
   * @returns 价格信息映射
   */
  async batchSearchMarketPrices(productNames: string[]): Promise<Map<string, MarketPriceInfo>> {
    const resultMap = new Map<string, MarketPriceInfo>();

    for (const productName of productNames) {
      const priceInfo = await this.searchMarketPrice(productName);
      if (priceInfo) {
        resultMap.set(productName, priceInfo);
      }
      // 避免请求过于频繁
      await this.delay(1000);
    }

    return resultMap;
  }

  /**
   * 搜索竞争对手报价
   * @param productName 产品名称
   * @returns 竞争对手报价信息
   */
  async searchCompetitorQuotes(productName: string): Promise<WebSearchResult[]> {
    if (!this.webSearchEnabled) {
      Logger.warn('联网搜索未启用');
      return [];
    }

    try {
      Logger.info(`搜索竞争对手报价: ${productName}`);
      
      const searchQuery = `${productName} 报价单 对比 供应商`;
      const client = this.getSearchClient();
      const response = await client.webSearch(searchQuery, 3, false);

      if (!response.web_items || response.web_items.length === 0) {
        Logger.warn('未找到竞争对手报价信息');
        return [];
      }

      const results: WebSearchResult[] = response.web_items.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        summary: item.summary,
        publishedDate: item.publish_time,
      }));

      Logger.info(`找到 ${results.length} 个竞争对手报价信息`);
      return results;

    } catch (error) {
      Logger.error('搜索竞争对手报价失败:', error);
      return [];
    }
  }

  // ============================================================================
  // 2. 向量大模型功能
  // ============================================================================

  /**
   * 为产品生成向量嵌入
   * @param product 产品信息
   * @returns 向量嵌入
   */
  async generateProductEmbedding(product: {
    id: string;
    name: string;
    brand?: string;
    specs?: string;
    category?: string;
  }): Promise<ProductEmbedding | null> {
    if (!this.embeddingEnabled) {
      Logger.warn('向量大模型未启用');
      return null;
    }

    try {
      // 组合文本特征
      const textFeatures = [
        product.name,
        product.brand || '',
        product.specs || '',
        product.category || '',
      ].filter(Boolean).join(' ');

      Logger.info(`生成产品向量: ${product.name}`);
      
      const client = this.getEmbeddingClient();
      const embedding = await client.embedText(textFeatures);

      const productEmbedding: ProductEmbedding = {
        productId: product.id,
        productName: product.name,
        embedding,
        category: product.category,
      };

      Logger.info('向量生成成功');
      return productEmbedding;

    } catch (error) {
      Logger.error('生成产品向量失败:', error);
      return null;
    }
  }

  /**
   * 语义搜索相似产品
   * @param query 查询文本
   * @param products 产品库（需要包含向量嵌入）
   * @returns 相似产品列表
   */
  async searchSimilarProducts(
    query: string,
    products: Array<{ id: string; name: string; embedding?: number[]; price: number; specs: string }>
  ): Promise<SimilarProduct[]> {
    if (!this.embeddingEnabled) {
      Logger.warn('向量大模型未启用，使用文本匹配');
      return this.textBasedSimilaritySearch(query, products);
    }

    try {
      Logger.info(`语义搜索: ${query}`);
      
      // 生成查询向量
      const client = this.getEmbeddingClient();
      const queryEmbedding = await client.embedText(query);

      // 计算余弦相似度
      const similarities = products
        .filter(p => p.embedding && p.embedding.length > 0)
        .map(product => {
          const similarity = this.cosineSimilarity(queryEmbedding, product.embedding!);
          return {
            productId: product.id,
            productName: product.name,
            similarity,
            price: product.price,
            specs: product.specs,
          };
        })
        .filter(s => s.similarity > 0.6) // 相似度阈值
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5); // 返回Top 5

      Logger.info(`找到 ${similarities.length} 个相似产品`);
      return similarities;

    } catch (error) {
      Logger.error('语义搜索失败:', error);
      // 降级到文本匹配
      return this.textBasedSimilaritySearch(query, products);
    }
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * 基于文本的相似度搜索（降级方案）
   */
  private textBasedSimilaritySearch(
    query: string,
    products: Array<{ id: string; name: string; price: number; specs: string }>
  ): SimilarProduct[] {
    const queryLower = query.toLowerCase();
    
    const results = products
      .map(product => {
        let score = 0;
        
        // 名称匹配
        if (product.name.toLowerCase().includes(queryLower)) {
          score += 0.8;
        }
        
        // 规格匹配
        if (product.specs.toLowerCase().includes(queryLower)) {
          score += 0.5;
        }
        
        // 关键词匹配
        const keywords = queryLower.split(/\s+/);
        keywords.forEach(keyword => {
          if (keyword.length > 1 && product.name.toLowerCase().includes(keyword)) {
            score += 0.3;
          }
        });
        
        return {
          productId: product.id,
          productName: product.name,
          similarity: Math.min(score, 1),
          price: product.price,
          specs: product.specs,
        };
      })
      .filter(s => s.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return results;
  }

  // ============================================================================
  // 3. 生图大模型功能
  // ============================================================================

  /**
   * 生成产品展示图
   * @param productName 产品名称
   * @param specs 产品规格（可选）
   * @returns 生成的图片信息
   */
  async generateProductImage(
    productName: string,
    specs?: string
  ): Promise<GeneratedImage | null> {
    if (!this.imageGenerationEnabled) {
      Logger.warn('生图大模型未启用');
      return null;
    }

    try {
      Logger.info(`生成产品图: ${productName}`);
      
      // 构建提示词
      const prompt = `专业的${productName}产品摄影图${specs ? `，${specs}` : ''}，白色背景，高清细节，商业摄影风格，专业打光，4K分辨率`;
      
      const client = this.getImageGenerationClient();
      const response = await client.generate({
        prompt,
        size: '2048x2048',
        watermark: false,
        responseFormat: 'url',
      });

      if (!response.data || response.data.length === 0) {
        Logger.warn('图片生成失败');
        return null;
      }

      const firstImage = response.data[0];
      if (!firstImage.url) {
        Logger.warn('图片生成成功但未返回URL');
        return null;
      }

      const imageInfo: GeneratedImage = {
        imageUrl: firstImage.url,
        productName,
        prompt,
        createdAt: new Date(),
      };

      Logger.info('图片生成成功');
      return imageInfo;

    } catch (error) {
      Logger.error('生成产品图失败:', error);
      return null;
    }
  }

  /**
   * 批量生成产品图片
   * @param products 产品列表
   * @returns 生成的图片列表
   */
  async batchGenerateProductImages(
    products: Array<{ name: string; specs?: string }>
  ): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];

    for (const product of products) {
      const image = await this.generateProductImage(product.name, product.specs);
      if (image) {
        results.push(image);
      }
      // 避免请求过于频繁
      await this.delay(2000);
    }

    return results;
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      enabled: this.enabled,
      webSearchEnabled: this.webSearchEnabled,
      embeddingEnabled: this.embeddingEnabled,
      imageGenerationEnabled: this.imageGenerationEnabled,
    };
  }
}

// ============================================================================
// 单例模式
// ============================================================================

export const cozeToolsService = new CozeToolsService();
