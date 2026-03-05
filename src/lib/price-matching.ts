import { ServerDatabaseUtils } from './server-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface PriceMatchResult {
  price: number;
  source: 'database' | 'knowledge' | 'estimate' | 'default' | 'market';
  confidence: number; // 0-100
  productName?: string;
  model?: string;
  sourceId?: string;
  sourceUrl?: string;
  marketPrice?: number; // 市场价兜底
  marketSource?: string; // 市场价来源
}

export interface ProductMatch {
  name: string;
  model?: string;
  category?: string;
  specifications?: string;
  quantity?: number;
  unit?: string;
}

export class PriceMatcher {
  /**
   * 多级价格匹配（优化版）
   * 1. 产品库优先（置信度 90-100）- 最高优先级
   * 2. 知识库次之（置信度 60-80）
   * 3. 市场价兜底（置信度 40-50）- 新增兜底
   * 4. 按类别估算（置信度 30-40）
   * 5. 默认兜底（置信度 20-30）
   */
  static async matchPrice(
    product: ProductMatch,
    userId?: string
  ): Promise<PriceMatchResult> {
    console.log('[PriceMatcher] ========== 开始价格匹配 ==========');
    console.log('[PriceMatcher] 产品信息:', product);

    // 第1级：产品库匹配（最高优先级）
    const dbResult = await this.matchFromDatabase(product);
    if (dbResult) {
      console.log('[PriceMatcher] ✅ 产品库匹配成功:', dbResult);
      return dbResult;
    }

    // 第2级：知识库匹配（历史报价、案例）
    const knowledgeResult = await this.matchFromKnowledge(product, userId);
    if (knowledgeResult) {
      console.log('[PriceMatcher] ✅ 知识库匹配成功:', knowledgeResult);
      return knowledgeResult;
    }

    // 第3级：市场价兜底（新增）
    const marketResult = await this.matchFromMarket(product);
    if (marketResult) {
      console.log('[PriceMatcher] ✅ 市场价兜底成功:', marketResult);
      return marketResult;
    }

    // 第4级：按类别估算
    const estimateResult = this.estimateByCategory(product);
    if (estimateResult) {
      console.log('[PriceMatcher] ⚠️ 使用类别估算:', estimateResult);
      return estimateResult;
    }

    // 第5级：默认兜底
    const defaultResult = this.getDefaultPrice();
    console.log('[PriceMatcher] ⚠️ 使用默认价格:', defaultResult);
    return defaultResult;
  }

  /**
   * 从产品库匹配（最高优先级）
   */
  private static async matchFromDatabase(
    product: ProductMatch
  ): Promise<PriceMatchResult | null> {
    try {
      // 构建搜索关键词
      const searchTerms = [product.name];
      if (product.model) searchTerms.push(product.model);
      
      // 尝试精确匹配
      for (const term of searchTerms) {
        const dbProducts = await ServerDatabaseUtils.searchProducts(
          term,
          '',
          product.model || ''
        );

        if (dbProducts && dbProducts.length > 0) {
          // 找到最佳匹配
          const bestMatch = this.findBestMatch(dbProducts, product);
          
          if (bestMatch) {
            // 计算匹配度
            let confidence = 90;
            if (bestMatch.verified) confidence += 5;
            if (bestMatch.source === 'verified') confidence += 5;
            
            // 如果型号完全匹配，增加置信度
            if (product.model && bestMatch.model === product.model) {
              confidence += 5;
            }
            
            // 如果名称高度匹配，增加置信度
            if (this.calculateSimilarity(product.name, bestMatch.name) > 0.8) {
              confidence += 5;
            }

            return {
              price: bestMatch.price,
              source: 'database',
              confidence: Math.min(confidence, 100),
              productName: bestMatch.name,
              model: bestMatch.model,
              sourceId: bestMatch.id
            };
          }
        }
      }

      // 如果没有精确匹配，尝试模糊搜索
      const fuzzyResults = await ServerDatabaseUtils.searchProducts(
        product.name,
        '',
        '',
        20 // 返回更多结果
      );

      if (fuzzyResults && fuzzyResults.length > 0) {
        const bestMatch = this.findBestMatch(fuzzyResults, product);
        if (bestMatch) {
          return {
            price: bestMatch.price,
            source: 'database',
            confidence: 70, // 模糊匹配置信度稍低
            productName: bestMatch.name,
            model: bestMatch.model,
            sourceId: bestMatch.id
          };
        }
      }
    } catch (error) {
      console.error('[PriceMatcher] 数据库匹配失败:', error);
    }
    return null;
  }

  /**
   * 从知识库匹配（历史报价、案例）
   */
  private static async matchFromKnowledge(
    product: ProductMatch,
    userId?: string
  ): Promise<PriceMatchResult | null> {
    try {
      const supabase = getSupabaseClient();

      // 构建搜索查询
      let query = supabase
        .from('knowledge_entries')
        .select('*')
        .eq('status', 'approved')
        .in('type', ['quote', 'case']); // 只从报价和案例中搜索

      // 添加文本搜索
      const searchText = `${product.name} ${product.model || ''}`.trim();
      if (searchText) {
        query = query.textSearch('title', searchText, {
          config: 'chinese'
        });
      }

      const { data: entries, error } = await query
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[PriceMatcher] 知识库查询失败:', error);
        return null;
      }

      if (entries && entries.length > 0) {
        // 尝试从metadata中提取价格
        for (const entry of entries) {
          // 检查是否有直接价格
          if (entry.metadata?.price) {
            return {
              price: entry.metadata.price,
              source: 'knowledge',
              confidence: 75,
              productName: entry.title,
              sourceId: entry.id,
              sourceUrl: entry.file_url
            };
          }
          
          // 检查是否有估算价格
          if (entry.metadata?.estimatedPrice) {
            return {
              price: entry.metadata.estimatedPrice,
              source: 'knowledge',
              confidence: 65,
              productName: entry.title,
              sourceId: entry.id,
              sourceUrl: entry.file_url
            };
          }
          
          // 检查是否有市场价格
          if (entry.metadata?.marketPrice) {
            return {
              price: entry.metadata.marketPrice,
              source: 'knowledge',
              confidence: 70,
              productName: entry.title,
              sourceId: entry.id,
              sourceUrl: entry.file_url
            };
          }
        }

        // 如果没有直接的价格，使用第一个匹配项的均价（如果有）
        if (entries[0].metadata?.averagePrice) {
          return {
            price: entries[0].metadata.averagePrice,
            source: 'knowledge',
            confidence: 60,
            productName: entries[0].title,
            sourceId: entries[0].id,
            sourceUrl: entries[0].file_url
          };
        }
      }
    } catch (error) {
      console.error('[PriceMatcher] 知识库匹配失败:', error);
    }
    return null;
  }

  /**
   * 从市场价兜底（新增）
   */
  private static async matchFromMarket(
    product: ProductMatch
  ): Promise<PriceMatchResult | null> {
    try {
      console.log('[PriceMatcher] 尝试市场价兜底:', product.name);
      
      // 调用市场价API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/quotes/market-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{
            name: product.name,
            model: product.model || '',
            specs: product.specifications || product.model || '',
          }]
        }),
      });

      if (!response.ok) {
        console.log('[PriceMatcher] 市场价API调用失败:', response.status);
        return null;
      }

      const result = await response.json();
      console.log('[PriceMatcher] 市场价API响应:', result);

      // 提取市场价
      const marketData = result.data?.[0] || result;
      const marketPrice = marketData.averageMarketPrice ||
                         marketData.price ||
                         marketData.marketPrice ||
                         marketData.value ||
                         marketData.unitPrice ||
                         0;

      if (marketPrice > 0) {
        // 获取市场价来源
        let marketSource = '市场参考价';
        if (marketData.source) {
          marketSource = marketData.source;
        } else if (marketData.provider) {
          marketSource = marketData.provider;
        }

        return {
          price: marketPrice,
          source: 'market',
          confidence: 45, // 市场价置信度适中
          productName: marketData.productName || product.name,
          model: marketData.model || product.model,
          sourceId: marketData.id,
          marketPrice: marketPrice,
          marketSource: marketSource
        };
      }
    } catch (error) {
      console.error('[PriceMatcher] 市场价兜底失败:', error);
    }
    return null;
  }

  /**
   * 按类别估算价格
   */
  private static estimateByCategory(product: ProductMatch): PriceMatchResult | null {
    const category = this.inferCategory(product);
    const price = this.getCategoryBasePrice(category);
    
    if (price > 0) {
      return {
        price,
        source: 'estimate',
        confidence: 35,
        productName: product.name
      };
    }
    return null;
  }

  /**
   * 获取默认价格
   */
  private static getDefaultPrice(): PriceMatchResult {
    return {
      price: 1000,
      source: 'default',
      confidence: 20
    };
  }

  /**
   * 查找最佳匹配产品
   */
  private static findBestMatch(products: any[], target: ProductMatch): any | null {
    if (!products || products.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const product of products) {
      let score = 0;

      // 名称匹配
      if (product.name) {
        const nameSimilarity = this.calculateSimilarity(
          target.name.toLowerCase(),
          product.name.toLowerCase()
        );
        score += nameSimilarity * 60; // 名称权重60%
      }

      // 型号匹配
      if (target.model && product.model) {
        if (product.model === target.model) {
          score += 30; // 完全匹配型号加30分
        } else if (product.model.includes(target.model) || target.model.includes(product.model)) {
          score += 15; // 部分匹配加15分
        }
      }

      // 规格匹配
      if (target.specifications && product.specifications) {
        const specSimilarity = this.calculateSimilarity(
          target.specifications.toLowerCase(),
          product.specifications.toLowerCase()
        );
        score += specSimilarity * 10; // 规格权重10%
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    return bestMatch;
  }

  /**
   * 计算字符串相似度（简单的Levenshtein实现）
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);
    
    // 如果字符串包含关系
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }

    // 简单计算共同词的数量
    const words1 = str1.split(/[\s,，、\-_]/);
    const words2 = str2.split(/[\s,，、\-_]/);
    
    let commonWords = 0;
    for (const word of words1) {
      if (word.length > 1 && words2.includes(word)) {
        commonWords++;
      }
    }

    const totalUniqueWords = new Set([...words1, ...words2]).size;
    return totalUniqueWords > 0 ? commonWords / totalUniqueWords : 0;
  }

  /**
   * 推断产品类别
   */
  static inferCategory(product: ProductMatch): string {
    const name = product.name.toLowerCase();
    const model = (product.model || '').toLowerCase();
    const specs = (product.specifications || '').toLowerCase();

    // 关键词映射到类别（扩展版）
    const categoryMap: Record<string, string[]> = {
      '搅拌设备': ['搅拌罐', '搅拌系统', '反应釜', '混合机', '搅拌器', '搅拌机', '搅拌装置'],
      '泵类': ['泵', '离心泵', '螺杆泵', '隔膜泵', '齿轮泵', '柱塞泵', '潜水泵', '排污泵'],
      '阀门': ['阀', '蝶阀', '球阀', '闸阀', '截止阀', '止回阀', '安全阀', '调节阀'],
      '管道': ['管', '管道', '法兰', '弯头', '三通', '接头', '管件', '波纹管'],
      '电机': ['电机', '电动机', '减速机', '马达', '变频电机', '防爆电机'],
      '仪表': ['仪表', '传感器', '变送器', '控制器', 'PLC', '流量计', '压力表', '温度计'],
      '过滤设备': ['过滤器', '滤芯', '滤袋', '滤网', '压滤机', '过滤机'],
      '换热设备': ['换热器', '冷凝器', '冷却器', '加热器', '散热器'],
      '风机': ['风机', '鼓风机', '引风机', '轴流风机', '离心风机'],
      '压缩机': ['压缩机', '空压机', '空气压缩机'],
      '环保设备': ['除尘器', '脱硫', '脱硝', '污水处理', '废气处理'],
      '电气设备': ['配电箱', '配电柜', '开关柜', '控制柜', '变频柜']
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
      for (const keyword of keywords) {
        if (name.includes(keyword) || model.includes(keyword) || specs.includes(keyword)) {
          return category;
        }
      }
    }

    return '其他';
  }

  /**
   * 获取类别基准价格（扩展版）
   */
  static getCategoryBasePrice(category: string): number {
    const priceMap: Record<string, number> = {
      '搅拌设备': 8000,
      '泵类': 3500,
      '阀门': 850,
      '管道': 500,
      '电机': 2200,
      '仪表': 1200,
      '过滤设备': 1500,
      '换热设备': 5000,
      '风机': 4000,
      '压缩机': 6000,
      '环保设备': 10000,
      '电气设备': 3000,
      '其他': 1000
    };
    return priceMap[category] || 1000;
  }

  /**
   * 批量匹配价格（优化版）
   */
  static async matchPrices(
    products: ProductMatch[],
    userId?: string
  ): Promise<PriceMatchResult[]> {
    console.log('[PriceMatcher] 开始批量价格匹配，数量:', products.length);
    
    const results: PriceMatchResult[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`[PriceMatcher] 匹配第 ${i + 1}/${products.length} 个产品:`, product.name);
      
      const result = await this.matchPrice(product, userId);
      results.push(result);
    }

    // 统计匹配结果
    const stats = {
      total: results.length,
      database: results.filter(r => r.source === 'database').length,
      knowledge: results.filter(r => r.source === 'knowledge').length,
      market: results.filter(r => r.source === 'market').length,
      estimate: results.filter(r => r.source === 'estimate').length,
      default: results.filter(r => r.source === 'default').length
    };
    
    console.log('[PriceMatcher] 批量匹配完成，统计:', stats);

    return results;
  }

  /**
   * 获取价格区间（用于显示）
   */
  static getPriceRange(price: number, confidence: number): {
    min: number;
    max: number;
    suggested: number;
  } {
    let range = 0.2; // 默认±20%
    
    if (confidence >= 90) {
      range = 0.1; // 高置信度 ±10%
    } else if (confidence >= 70) {
      range = 0.15; // 中置信度 ±15%
    } else if (confidence >= 50) {
      range = 0.2; // 低置信度 ±20%
    } else {
      range = 0.3; // 极低置信度 ±30%
    }

    return {
      min: Math.round(price * (1 - range)),
      max: Math.round(price * (1 + range)),
      suggested: price
    };
  }

  /**
   * 格式化价格显示
   */
  static formatPriceWithSource(result: PriceMatchResult): string {
    const sourceMap = {
      'database': '📦 价格库',
      'knowledge': '📚 知识库',
      'market': '💰 市场价',
      'estimate': '📊 估算价',
      'default': '⚡ 默认价'
    };

    const sourceText = sourceMap[result.source] || result.source;
    let resultStr = `¥${result.price.toFixed(2)} (${sourceText}, 置信度${result.confidence}%)`;
    
    if (result.marketPrice && result.source !== 'market') {
      resultStr += ` [市场价: ¥${result.marketPrice.toFixed(2)}]`;
    }
    
    return resultStr;
  }

  /**
   * 获取匹配建议
   */
  static getMatchAdvice(result: PriceMatchResult): string {
    if (result.confidence >= 80) {
      return '✅ 推荐使用此价格';
    } else if (result.confidence >= 60) {
      return '⚠️ 建议人工复核';
    } else {
      return '❌ 仅供参考，请核实';
    }
  }
}
