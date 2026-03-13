import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { SearchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

/**
 * 市场价查询接口
 *
 * 功能：
 * - 接收产品名称列表
 * - 从数据库查询或返回模拟市场价
 * - 返回每个产品的市场参考价
 */

/**
 * 模拟市场价数据（用于演示）
 */
const mockMarketPrices: Record<string, { price: number; range: string; source: string }> = {
  二氧化氯发生器: { price: 12000, range: '10000-15000', source: '行业均价' },
  计量泵: { price: 800, range: '600-1200', source: '行业均价' },
  离心泵: { price: 1500, range: '1200-2000', source: '行业均价' },
  搅拌机: { price: 2200, range: '1800-3000', source: '行业均价' },
  曝气机: { price: 3500, range: '3000-4500', source: '行业均价' },
  压滤机: { price: 18000, range: '15000-22000', source: '行业均价' },
  反应釜: { price: 25000, range: '20000-35000', source: '行业均价' },
  储罐: { price: 8000, range: '6000-12000', source: '行业均价' },
  过滤器: { price: 1200, range: '800-2000', source: '行业均价' },
  冷却塔: { price: 5000, range: '4000-7000', source: '行业均价' },
  风机: { price: 2800, range: '2000-4000', source: '行业均价' },
  压缩机: { price: 8500, range: '7000-12000', source: '行业均价' },
  管道: { price: 50, range: '30-80', source: '市场价（米）' },
  阀门: { price: 150, range: '80-300', source: '市场价（个）' },
  仪表: { price: 600, range: '400-1000', source: '市场价' },
  控制器: { price: 3500, range: '2000-5000', source: '市场价' },
  电机: { price: 1200, range: '800-2000', source: '市场价' },
  钢材: { price: 5000, range: '4500-6000', source: '市场价（吨）' },
  不锈钢管: { price: 80, range: '60-120', source: '市场价（米）' },
  水泵: { price: 950, range: '700-1500', source: '行业均价' }};

/**
 * 根据产品名称计算模拟价格
 */
function calculateMockPrice(productName: string): { price: number; range: string; source: string } {
  const name = productName.trim().toLowerCase();

  // 尝试精确匹配
  for (const [key, value] of Object.entries(mockMarketPrices)) {
    if (key.toLowerCase() === name || name.includes(key.toLowerCase())) {
      return value;
    }
  }

  // 关键词匹配
  const keywords: Record<string, number> = {
    罐: 8000,
    泵: 1200,
    机: 3500,
    器: 2000,
    搅拌: 2200,
    电机: 1200,
    钢材: 5000,
    管道: 50,
    装置: 15000,
    系统: 25000,
    设备: 10000,
    仪: 600,
    阀: 150,
    板: 300,
    管: 80,
    箱: 4000,
    柜: 5000,
    压缩机: 8500,
    风机: 2800,
    冷却塔: 5000,
    压滤机: 18000,
    反应釜: 25000,
    过滤器: 1200,
    曝气机: 3500,
    计量泵: 800,
    控制器: 3500};

  for (const [keyword, price] of Object.entries(keywords)) {
    if (name.includes(keyword)) {
      const minPrice = Math.round(price * 0.7);
      const maxPrice = Math.round(price * 1.4);
      return {
        price,
        range: `${minPrice}-${maxPrice}`,
        source: '估算价'};
    }
  }

  // 默认价格（基于产品名称长度和字符）
  const basePrice = Math.max(500, productName.length * 100);
  const minPrice = Math.round(basePrice * 0.6);
  const maxPrice = Math.round(basePrice * 1.8);
  return {
    price: basePrice,
    range: `${minPrice}-${maxPrice}`,
    source: '估算价'};
}

/**
 * 从搜索结果中提取价格信息
 */
async function searchMarketPrice(
  productName: string,
  model?: string
): Promise<{ price: number; range: string; source: string } | null> {
  try {
    console.log('[MarketPrice] 正在搜索市场价格:', productName);

    // 构建搜索查询
    const searchQuery = model
      ? `${productName} ${model} 价格 市场价 报价`
      : `${productName} 价格 市场价 报价`;

    // 提取转发头信息
    const customHeaders = HeaderUtils.extractForwardHeaders({} as any);

    // 创建搜索客户端
    const config = new Config();
    const client = new SearchClient(config, customHeaders);

    // 执行搜索
    const response = await client.webSearch(searchQuery, 5, true);

    if (!response.web_items || response.web_items.length === 0) {
      console.log('[MarketPrice] 搜索结果为空');
      return null;
    }

    console.log('[MarketPrice] 搜索到', response.web_items.length, '条结果');

    // 优先从 AI 摘要中提取价格
    if (response.summary) {
      const prices = extractPricesFromText(response.summary);
      if (prices.length > 0) {
        const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        const minPrice = Math.round(Math.min(...prices));
        const maxPrice = Math.round(Math.max(...prices));
        console.log('[MarketPrice] 从摘要中提取价格:', avgPrice);
        return {
          price: avgPrice,
          range: `${minPrice}-${maxPrice}`,
          source: '市场搜索价'};
      }
    }

    // 从搜索结果中提取价格
    const allPrices: number[] = [];
    for (const item of response.web_items) {
      const prices = extractPricesFromText(item.snippet || '');
      allPrices.push(...prices);
      if (item.summary) {
        const summaryPrices = extractPricesFromText(item.summary);
        allPrices.push(...summaryPrices);
      }
    }

    if (allPrices.length > 0) {
      // 过滤掉异常价格（过大或过小）
      const validPrices = allPrices.filter((p) => p >= 10 && p <= 10000000);

      if (validPrices.length > 0) {
        const avgPrice = Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length);
        const minPrice = Math.round(Math.min(...validPrices));
        const maxPrice = Math.round(Math.max(...validPrices));
        console.log(
          '[MarketPrice] 从搜索结果中提取价格:',
          avgPrice,
          '（样本数:',
          validPrices.length,
          '）'
        );
        return {
          price: avgPrice,
          range: `${minPrice}-${maxPrice}`,
          source: '市场搜索价'};
      }
    }

    console.log('[MarketPrice] 未能从搜索结果中提取到有效价格');
    return null;
  } catch (error) {
    console.error('[MarketPrice] 搜索市场价格失败:', error);
    return null;
  }
}

/**
 * 从文本中提取所有价格数字
 */
function extractPricesFromText(text: string): number[] {
  const prices: number[] = [];

  // 匹配各种价格格式
  // 格式：1234, 1,234, 1,234.56, ￥1234, ¥1234, $1234, 1234元, 1234万元
  const pricePatterns = [
    /(?:￥|¥|\$|CNY)?\s*([1-9]\d{0,2}(?:,\d{3})*(?:\.\d{1,2})?)(?:元|万|万)?/g,
    /(\d+(?:\.\d{1,2})?)\s*(?:元|万|万)/g,
  ];

  for (const pattern of pricePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let priceStr = match[1].replace(/,/g, '');
      const price = parseFloat(priceStr);

      // 检查是否是"万元"
      if (text.includes('万') && match.index < text.indexOf('万') + 10) {
        prices.push(price * 10000);
      } else {
        prices.push(price);
      }
    }
  }

  return prices;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 支持两种格式：{ products: [...] } 或 { productName, specifications }
    let products: any[] = [];
    if (body.products && Array.isArray(body.products)) {
      products = body.products;
    } else if (body.productName) {
      // 单个产品格式
      products = [{ name: body.productName, specifications: body.specifications || '' }];
    }

    console.log('[MarketPrice] ========== 查询市场价 ==========');
    console.log('[MarketPrice] 产品数量:', products.length);

    if (products.length === 0) {
      return NextResponse.json(
        { success: false, error: '无效的请求参数，需要产品列表' },
        { status: 400 }
      );
    }

    const results: any[] = [];
    const db = getSupabaseClient();

    for (const product of products) {
      const productName = product.name || product;
      const model = product.model || '';
      const specs = product.specs || '';

      console.log('[MarketPrice] 查询产品:', productName);

      try {
        let priceData = null;

        // 第1级：优先从数据库查询知识库价格
        if (!priceData) {
          try {
            const { data } = await db
              .from('products')
              .select('price, name, model')
              .ilike('name', `%${productName.split(' ')[0]}%`)
              .limit(1)
              .single();

            if (data && data.price) {
              const price = parseFloat(data.price);
              priceData = {
                price: price,
                source: '知识库价格库',
                range: `${Math.round(price * 0.8)}-${Math.round(price * 1.2)}`};
              console.log('[MarketPrice] 从知识库获取价格:', priceData);
            }
          } catch (dbError) {
            console.error('[MarketPrice] 知识库查询失败:', dbError);
          }
        }

        // 第2级：从网络搜索市场价格
        if (!priceData) {
          try {
            const marketPriceData = await searchMarketPrice(productName, model);
            if (marketPriceData) {
              priceData = marketPriceData;
              console.log('[MarketPrice] 从网络搜索获取价格:', priceData);
            }
          } catch (searchError) {
            console.error('[MarketPrice] 网络搜索失败:', searchError);
          }
        }

        // 第3级：使用模拟价格兜底
        if (!priceData) {
          priceData = calculateMockPrice(productName);
          console.log('[MarketPrice] 使用模拟价格兜底:', priceData);
        }

        // 解析价格范围
        const rangeMatch = priceData.range.match(/(\d+)-(\d+)/);
        const minPrice = rangeMatch ? parseInt(rangeMatch[1]) : Math.round(priceData.price * 0.8);
        const maxPrice = rangeMatch ? parseInt(rangeMatch[2]) : Math.round(priceData.price * 1.2);

        results.push({
          name: productName,
          model: model,
          specs: specs,
          // 旧格式（保持兼容）
          marketPrice: priceData.price,
          priceRange: priceData.range,
          source: priceData.source,
          // 新格式（批量查价需要）
          averageMarketPrice: priceData.price,
          minPrice: minPrice,
          maxPrice: maxPrice,
          sampleSize: 1});

        console.log('[MarketPrice] 结果:', {
          name: productName,
          price: priceData.price,
          source: priceData.source});
      } catch (error) {
        console.error('[MarketPrice] 查询产品失败:', productName, error);
        // 即使失败也返回估算价
        const fallbackPrice = calculateMockPrice(productName);
        const rangeMatch = fallbackPrice.range.match(/(\d+)-(\d+)/);
        const minPrice = rangeMatch
          ? parseInt(rangeMatch[1])
          : Math.round(fallbackPrice.price * 0.8);
        const maxPrice = rangeMatch
          ? parseInt(rangeMatch[2])
          : Math.round(fallbackPrice.price * 1.2);

        results.push({
          name: productName,
          model: model,
          specs: specs,
          marketPrice: fallbackPrice.price,
          priceRange: fallbackPrice.range,
          source: fallbackPrice.source + ' (查询失败)',
          averageMarketPrice: fallbackPrice.price,
          minPrice: minPrice,
          maxPrice: maxPrice,
          sampleSize: 1});
      }
    }

    console.log('[MarketPrice] ========== 查询完成 ==========');
    console.log('[MarketPrice] 成功:', results.length, '个产品');

    // 如果是单个产品查询，返回单个结果
    if (products.length === 1) {
      return NextResponse.json({
        success: true,
        ...results[0]});
    }

    return NextResponse.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()});
  } catch (error) {
    console.error('[MarketPrice] 接口错误:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: '市场价查询接口已就绪',
    endpoints: {
      POST: {
        description: '批量查询产品市场价',
        body: {
          products: [{ name: '产品名称', model: '型号', specs: '规格' }]}}}});
}
