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
  parameter_description?: string;
  quantity?: number;
  unit?: string;
}

export class PriceMatcher {
  // 跟踪已输出的错误，避免重复输出
  private static loggedErrors: Set<string> = new Set();
  
  private static shouldLogError(prefix: string, error: any): boolean {
    const errorKey = `${prefix}-${error.code}-${error.message}`;
    if (this.loggedErrors.has(errorKey)) {
      return false;
    }
    this.loggedErrors.add(errorKey);
    return true;
  }

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
   * 清理产品名称，移除规格描述，保留核心产品名称
   * 
   * 支持的清理规则（按优先级）：
   * 1. 容量规格（立方、立方米、m³等）
   * 2. 管径规格（DN、Φ等）
   * 3. 尺寸规格（长×宽×高）
   * 4. 常见规格关键词
   * 5. 括号内容
   */
  private static cleanProductName(name: string): string {
    if (!name) return name;

    let cleaned = name;

    // 1. 移除容量规格（最优先，避免干扰其他规则）
    // 支持：2立方、2立方米、2m³、2m3、2方、两立方、二立方等
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*(立方|立方米|m³|m3|方)\b/gi, '');
    cleaned = cleaned.replace(/[一两二三四五六七八九十百千万亿]+\s*立方(米)?\b/g, '');
    
    // 2. 移除管径规格（DN数字、Φ数字、英寸规格）
    cleaned = cleaned.replace(/\b(DN|Φ|inch|\")\s*\d+(\.\d+)?\b/gi, '');
    
    // 3. 移除尺寸规格（长×宽×高、长度单位）
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*[×x*]\s*\d+(\.\d+)?(\s*[×x*]\s*\d+(\.\d+)?)?/g, '');
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*(mm|cm|m|米|毫米|厘米)\b/gi, '');
    
    // 4. 移除材质描述（但保留材质作为产品名的一部分，如PVC管）
    // 不移除 PVC-U、FRP 等材质标识
    
    // 5. 移除常见规格关键词
    cleaned = cleaned.replace(/\b(重型|轻型|标准|加强|普通|防水|耐腐蚀|密封|C20|座|台|套|件|个|只|支)\b/gi, '');
    
    // 6. 移除括号内的内容（规格说明）
    cleaned = cleaned.replace(/（[^）]*）/g, '');
    cleaned = cleaned.replace(/\([^)]*\)/g, '');
    
    // 7. 清理多余空格和符号
    cleaned = cleaned.trim()
      .replace(/\s+/g, ' ')
      .replace(/[，,、；;。]/g, '');

    return cleaned;
  }

  /**
   * 标准化型号，将各种型号表达统一为标准格式
   * 
   * 支持的标准化规则：
   * 1. 移除容量单位（保留数字）
   * 2. 移除长度单位（保留数字）
   * 3. 统一格式（去除空格、特殊字符）
   */
  private static normalizeModel(model: string | undefined): string | undefined {
    if (!model) return undefined;

    let normalized = model;

    // 移除容量单位，只保留数字
    const unitPattern = /(立方|立方米|m³|m3|方|吨|升|L|ML)/i;
    if (unitPattern.test(normalized)) {
      const numberMatch = normalized.match(/(\d+(\.\d+)?)/);
      if (numberMatch) {
        normalized = numberMatch[1];
      }
    }

    // 移除长度单位，只保留数字
    const lengthPattern = /(mm|厘米|cm|m|米)/i;
    if (lengthPattern.test(normalized)) {
      const numberMatch = normalized.match(/(\d+(\.\d+)?)/);
      if (numberMatch) {
        normalized = numberMatch[1];
      }
    }

    // 清理多余空格和特殊字符
    normalized = normalized.trim()
      .replace(/\s+/g, '')
      .replace(/[()-]/g, '');

    return normalized || undefined;
  }

  /**
   * 从产品库匹配（最高优先级）
   * 
   * 多级匹配策略：
   * 级别1：标准化后的名称和型号精确匹配
   * 级别2：标准化后的名称包含 + 型号精确匹配
   * 级别3：标准化后的名称包含 + 型号包含
   * 级别4：仅名称匹配，忽略型号（回退策略）
   * 级别5：仅型号匹配（如果有型号，作为最后回退）
   */
  private static async matchFromDatabase(
    product: ProductMatch
  ): Promise<PriceMatchResult | null> {
    try {
      console.log('[PriceMatcher] ====== 开始产品库匹配 ======');
      console.log('[PriceMatcher] 原始产品名称:', product.name);
      console.log('[PriceMatcher] 原始产品型号:', product.model);

      // 清理产品名称，移除规格描述
      const cleanedName = this.cleanProductName(product.name);
      console.log('[PriceMatcher] 清理后产品名称:', cleanedName);

      // 标准化型号
      const normalizedModel = this.normalizeModel(product.model);
      console.log('[PriceMatcher] 标准化后型号:', normalizedModel);

      // 直接使用 Supabase 进行查询
      const supabase = getSupabaseClient();

      // 调试：查看数据库中相关产品（使用CAST正确提取price值）
      const debugQuery = supabase
        .from('products')
        .select('id, name, model, price::text as price, parameter_description, description')
        .ilike('name', `%${cleanedName}%`)
        .limit(20);
      
      const { data: debugProducts, error: debugError } = await debugQuery;
      if (!debugError && debugProducts && debugProducts.length > 0) {
        console.log('[PriceMatcher] 数据库中包含"' + cleanedName + '"的产品:', debugProducts.map(p => ({
          name: p.name,
          model: p.model,
          price: p.price
        })));
      }
      
      // ========== 级别1：名称和型号都精确匹配 ==========
      console.log('[PriceMatcher] ========== 级别1：名称和型号精确匹配 ==========');
      if (normalizedModel && cleanedName) {
        // 尝试多种匹配方式，以适应不同的数据类型
        
        // 方式1：字符串精确匹配（model 作为字符串）
        const exactMatchQuery = supabase
          .from('products')
          .select('id, name, model, price::text as price, parameter_description, description')
          .ilike('name', cleanedName)
          .eq('model', normalizedModel)
          .limit(10);
        
        const { data: exactMatches } = await exactMatchQuery;
        console.log('[PriceMatcher] 级别1-方式1（字符串精确）查询结果数量:', exactMatches?.length || 0);
        
        if (exactMatches && exactMatches.length > 0) {
          const bestMatch = this.findBestMatch(exactMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别1-方式1匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 95);
          }
        }

        // 方式2：数字精确匹配（model 作为数字）
        const modelNum = parseFloat(normalizedModel);
        if (!isNaN(modelNum)) {
          const exactMatchNumQuery = supabase
            .from('products')
            .select('*')
            .ilike('name', cleanedName)
            .eq('model', modelNum)
            .limit(10);
          
          const { data: exactMatchesNum } = await exactMatchNumQuery;
          console.log('[PriceMatcher] 级别1-方式2（数字精确）查询结果数量:', exactMatchesNum?.length || 0);
          
          if (exactMatchesNum && exactMatchesNum.length > 0) {
            const bestMatch = this.findBestMatch(exactMatchesNum, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别1-方式2匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 95);
            }
          }
        }

        // 方式3：型号包含匹配（字符串）
        const exactMatchFuzzyQuery = supabase
          .from('products')
          .select('*')
          .ilike('name', cleanedName)
          .ilike('model', `%${normalizedModel}%`)
          .limit(10);
        
        const { data: exactMatchesFuzzy } = await exactMatchFuzzyQuery;
        console.log('[PriceMatcher] 级别1-方式3（型号包含）查询结果数量:', exactMatchesFuzzy?.length || 0);
        
        if (exactMatchesFuzzy && exactMatchesFuzzy.length > 0) {
          const bestMatch = this.findBestMatch(exactMatchesFuzzy, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别1-方式3匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 90);
          }
        }
      }

      // ========== 级别2：名称包含 + 型号精确匹配 ==========
      console.log('[PriceMatcher] ========== 级别2：名称包含 + 型号精确匹配 ==========');
      if (normalizedModel && cleanedName) {
        // 方式1：字符串精确匹配
        const nameMatchQuery = supabase
          .from('products')
          .select('*')
          .ilike('name', `%${cleanedName}%`)
          .eq('model', normalizedModel)
          .limit(10);
        
        const { data: nameMatches } = await nameMatchQuery;
        console.log('[PriceMatcher] 级别2-方式1查询结果数量:', nameMatches?.length || 0);
        
        if (nameMatches && nameMatches.length > 0) {
          const bestMatch = this.findBestMatch(nameMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别2-方式1匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 85);
          }
        }

        // 方式2：数字精确匹配
        const modelNum = parseFloat(normalizedModel);
        if (!isNaN(modelNum)) {
          const nameMatchNumQuery = supabase
            .from('products')
            .select('*')
            .ilike('name', `%${cleanedName}%`)
            .eq('model', modelNum)
            .limit(10);
          
          const { data: nameMatchesNum } = await nameMatchNumQuery;
          console.log('[PriceMatcher] 级别2-方式2查询结果数量:', nameMatchesNum?.length || 0);
          
          if (nameMatchesNum && nameMatchesNum.length > 0) {
            const bestMatch = this.findBestMatch(nameMatchesNum, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别2-方式2匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 85);
            }
          }
        }
      }

      // ========== 级别3：名称包含 + 型号包含（模糊匹配）==========
      console.log('[PriceMatcher] ========== 级别3：名称包含 + 型号包含 ==========');
      if (normalizedModel && cleanedName) {
        const fuzzyMatchQuery = supabase
          .from('products')
          .select('*')
          .ilike('name', `%${cleanedName}%`)
          .ilike('model', `%${normalizedModel}%`)
          .limit(10);
        
        const { data: fuzzyMatches } = await fuzzyMatchQuery;
        console.log('[PriceMatcher] 级别3查询结果数量:', fuzzyMatches?.length || 0);
        
        if (fuzzyMatches && fuzzyMatches.length > 0) {
          const bestMatch = this.findBestMatch(fuzzyMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别3匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 75);
          }
        }
      }

      // ========== 级别4：仅名称匹配（忽略型号）==========
      console.log('[PriceMatcher] ========== 级别4：仅名称匹配 ==========');
      if (cleanedName) {
        const nameOnlyQuery = supabase
          .from('products')
          .select('*')
          .ilike('name', `%${cleanedName}%`)
          .limit(10);
        
        const { data: nameOnlyMatches } = await nameOnlyQuery;
        console.log('[PriceMatcher] 级别4查询结果数量:', nameOnlyMatches?.length || 0);
        
        if (nameOnlyMatches && nameOnlyMatches.length > 0) {
          // 如果有多个匹配，尝试找到最接近的（考虑型号）
          let bestMatch = nameOnlyMatches[0];
          if (normalizedModel) {
            bestMatch = this.findBestMatch(nameOnlyMatches, product);
          }
          console.log('[PriceMatcher] ✅ 级别4匹配成功:', bestMatch.name, bestMatch.model);
          return this.buildPriceResult(bestMatch, 60);
        }
      }

      // ========== 级别5：仅型号匹配（回退策略）==========
      console.log('[PriceMatcher] ========== 级别5：仅型号匹配 ==========');
      if (normalizedModel) {
        const modelOnlyQuery = supabase
          .from('products')
          .select('*')
          .ilike('model', `%${normalizedModel}%`)
          .limit(10);
        
        const { data: modelOnlyMatches } = await modelOnlyQuery;
        console.log('[PriceMatcher] 级别5查询结果数量:', modelOnlyMatches?.length || 0);
        
        if (modelOnlyMatches && modelOnlyMatches.length > 0) {
          const bestMatch = this.findBestMatch(modelOnlyMatches, product);
          console.log('[PriceMatcher] ✅ 级别5匹配成功:', bestMatch.name, bestMatch.model);
          return this.buildPriceResult(bestMatch, 40);
        }
      }
      
      console.log('[PriceMatcher] ❌ 所有匹配级别都失败，未找到匹配项');
    } catch (error) {
      // 只在第一次遇到此错误时输出，避免重复
      if (this.shouldLogError('database-match', error)) {
        console.log('[PriceMatcher] 数据库匹配失败:', error);
      }
    }
    return null;
  }

  /**
   * 构建价格结果
   * 修复：使用正确的price值提取逻辑
   */
  private static buildPriceResult(product: any, confidence: number): PriceMatchResult {
    // 尝试从description字段解析JSON数据，获取min_price
    let finalPrice = product.price;
    let costPrice = null;
    let minPrice = null;
    
    try {
      if (product.description && typeof product.description === 'string' && product.description.startsWith('{')) {
        const extraFields = JSON.parse(product.description);
        minPrice = extraFields.min_price;
        costPrice = extraFields.cost_price;
        // 优先返回最低售价
        if (minPrice && minPrice > 0) {
          finalPrice = minPrice;
        }
      }
    } catch (e) {
      // 解析失败，使用默认price
      console.log('[PriceMatcher] 解析description失败，使用默认price');
    }
    
    // 确保price是数字类型
    if (typeof finalPrice === 'string') {
      finalPrice = parseFloat(finalPrice);
      if (isNaN(finalPrice)) {
        console.error('[PriceMatcher] 价格转换失败:', product.price);
        finalPrice = 0;
      }
    }
    
    console.log('[PriceMatcher] 匹配产品详情:', JSON.stringify({
      name: product.name,
      model: product.model,
      price: product.price,
      min_price: minPrice,
      cost_price: costPrice,
      final_price: finalPrice
    }));
    
    return {
      price: finalPrice,
      source: 'database',
      confidence,
      productName: product.name,
      model: product.model,
      sourceId: product.id
    };
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

      // 使用清理后的产品名称进行搜索
      const cleanedName = this.cleanProductName(product.name);
      const searchText = `${cleanedName} ${product.model || ''}`.trim();
      console.log('[PriceMatcher] 知识库搜索文本:', searchText);
      
      if (searchText) {
        query = query.textSearch('title', searchText, {
          config: 'chinese'
        });
      }

      const { data: entries, error } = await query
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // 只在第一次遇到此错误时输出，避免重复
        if (this.shouldLogError('knowledge-query', error)) {
          console.log('[PriceMatcher] 知识库查询失败:', error);
        }
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
      // 只在第一次遇到此错误时输出，避免重复
      if (this.shouldLogError('knowledge-match', error)) {
        console.log('[PriceMatcher] 知识库匹配失败:', error);
      }
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
      
      // 在服务端构建正确的 URL
      const baseUrl = typeof window === 'undefined' 
        ? 'http://localhost:5000' 
        : window.location.origin;
      
      const apiUrl = `${baseUrl}/api/quotes/market-price`;
      
      // 调用市场价API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{
            name: product.name,
            model: product.model || '',
            specs: product.parameter_description || product.model || '',
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
      // 只输出错误消息，避免输出完整堆栈
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('[PriceMatcher] 市场价兜底失败:', errorMessage);
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

    // 清理目标产品名称
    const cleanedTargetName = this.cleanProductName(target.name);
    
    // 标准化目标型号（统一转换为字符串）
    const normalizedTargetModel = this.normalizeModel(target.model);

    for (const product of products) {
      let score = 0;

      // 名称匹配（使用清理后的名称）
      if (product.name) {
        const cleanedProductName = this.cleanProductName(product.name);
        const nameSimilarity = this.calculateSimilarity(
          cleanedTargetName.toLowerCase(),
          cleanedProductName.toLowerCase()
        );
        score += nameSimilarity * 60; // 名称权重60%
      }

      // 型号匹配（增强：支持数字和字符串的比较）
      if (normalizedTargetModel && product.model !== null && product.model !== undefined) {
        // 标准化数据库中的型号
        let normalizedProductModel = String(product.model).trim();
        
        // 如果数据库中的型号是数字字符串，转换为标准格式
        const numMatch = normalizedProductModel.match(/^\d+(\.\d+)?$/);
        if (numMatch) {
          // 如果是纯数字字符串，标准化为数字（去除前导零）
          const num = parseFloat(normalizedProductModel);
          if (!isNaN(num)) {
            normalizedProductModel = String(num);
          }
        }
        
        // 比较型号
        if (normalizedProductModel === normalizedTargetModel) {
          score += 30; // 完全匹配型号加30分
          console.log('[PriceMatcher] 型号完全匹配:', normalizedTargetModel, '=', normalizedProductModel);
        } else if (normalizedProductModel.includes(normalizedTargetModel) || normalizedTargetModel.includes(normalizedProductModel)) {
          score += 15; // 部分匹配加15分
          console.log('[PriceMatcher] 型号部分匹配:', normalizedTargetModel, '~', normalizedProductModel);
        } else {
          // 尝试将两者都转换为数字进行比较
          const targetNum = parseFloat(normalizedTargetModel);
          const productNum = parseFloat(normalizedProductModel);
          if (!isNaN(targetNum) && !isNaN(productNum) && targetNum === productNum) {
            score += 25; // 数字匹配加25分（略低于完全匹配）
            console.log('[PriceMatcher] 型号数字匹配:', targetNum, '=', productNum);
          }
        }
      }

      // 规格匹配
      if (target.parameter_description && product.parameter_description) {
        const specSimilarity = this.calculateSimilarity(
          target.parameter_description.toLowerCase(),
          product.parameter_description.toLowerCase()
        );
        score += specSimilarity * 10; // 规格权重10%
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    console.log('[PriceMatcher] 最佳匹配得分:', bestScore);
    console.log('[PriceMatcher] 最佳匹配产品:', bestMatch?.name);
    
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
    const specs = (product.parameter_description || '').toLowerCase();

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
