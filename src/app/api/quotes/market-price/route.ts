import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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
  '二氧化氯发生器': { price: 12000, range: '10000-15000', source: '行业均价' },
  '计量泵': { price: 800, range: '600-1200', source: '行业均价' },
  '离心泵': { price: 1500, range: '1200-2000', source: '行业均价' },
  '搅拌机': { price: 2200, range: '1800-3000', source: '行业均价' },
  '曝气机': { price: 3500, range: '3000-4500', source: '行业均价' },
  '压滤机': { price: 18000, range: '15000-22000', source: '行业均价' },
  '反应釜': { price: 25000, range: '20000-35000', source: '行业均价' },
  '储罐': { price: 8000, range: '6000-12000', source: '行业均价' },
  '过滤器': { price: 1200, range: '800-2000', source: '行业均价' },
  '冷却塔': { price: 5000, range: '4000-7000', source: '行业均价' },
  '风机': { price: 2800, range: '2000-4000', source: '行业均价' },
  '压缩机': { price: 8500, range: '7000-12000', source: '行业均价' },
  '管道': { price: 50, range: '30-80', source: '市场价（米）' },
  '阀门': { price: 150, range: '80-300', source: '市场价（个）' },
  '仪表': { price: 600, range: '400-1000', source: '市场价' },
  '控制器': { price: 3500, range: '2000-5000', source: '市场价' },
  '电机': { price: 1200, range: '800-2000', source: '市场价' },
  '钢材': { price: 5000, range: '4500-6000', source: '市场价（吨）' },
  '不锈钢管': { price: 80, range: '60-120', source: '市场价（米）' },
  '水泵': { price: 950, range: '700-1500', source: '行业均价' },
};

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
    '罐': 8000,
    '泵': 1200,
    '机': 3500,
    '器': 2000,
    '搅拌': 2200,
    '电机': 1200,
    '钢材': 5000,
    '管道': 50,
    '装置': 15000,
    '系统': 25000,
    '设备': 10000,
    '仪': 600,
    '阀': 150,
    '板': 300,
    '管': 80,
    '箱': 4000,
    '柜': 5000,
    '压缩机': 8500,
    '风机': 2800,
    '冷却塔': 5000,
    '压滤机': 18000,
    '反应釜': 25000,
    '过滤器': 1200,
    '曝气机': 3500,
    '计量泵': 800,
    '控制器': 3500,
  };

  for (const [keyword, price] of Object.entries(keywords)) {
    if (name.includes(keyword)) {
      const minPrice = Math.round(price * 0.7);
      const maxPrice = Math.round(price * 1.4);
      return {
        price,
        range: `${minPrice}-${maxPrice}`,
        source: '估算价',
      };
    }
  }

  // 默认价格（基于产品名称长度和字符）
  const basePrice = Math.max(500, productName.length * 100);
  const minPrice = Math.round(basePrice * 0.6);
  const maxPrice = Math.round(basePrice * 1.8);
  return {
    price: basePrice,
    range: `${minPrice}-${maxPrice}`,
    source: '估算价',
  };
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
        // 优先从数据库查询
        let dbPrice = null;
        try {
          const { data } = await db
            .from('products')
            .select('price, name, model')
            .ilike('name', `%${productName.split(' ')[0]}%`)
            .limit(1)
            .single();

          if (data && data.price) {
            const price = parseFloat(data.price);
            dbPrice = {
              price: price,
              source: '价格库',
              range: `${Math.round(price * 0.8)}-${Math.round(price * 1.2)}`,
            };
          }
        } catch (dbError) {
          console.error('[MarketPrice] 数据库查询失败:', dbError);
        }

        // 使用数据库价格或模拟价格
        const priceData = dbPrice || calculateMockPrice(productName);

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
          sampleSize: 1,
        });

        console.log('[MarketPrice] 结果:', {
          name: productName,
          price: priceData.price,
          source: priceData.source
        });

      } catch (error) {
        console.error('[MarketPrice] 查询产品失败:', productName, error);
        // 即使失败也返回估算价
        const fallbackPrice = calculateMockPrice(productName);
        const rangeMatch = fallbackPrice.range.match(/(\d+)-(\d+)/);
        const minPrice = rangeMatch ? parseInt(rangeMatch[1]) : Math.round(fallbackPrice.price * 0.8);
        const maxPrice = rangeMatch ? parseInt(rangeMatch[2]) : Math.round(fallbackPrice.price * 1.2);

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
          sampleSize: 1,
        });
      }
    }

    console.log('[MarketPrice] ========== 查询完成 ==========');
    console.log('[MarketPrice] 成功:', results.length, '个产品');

    // 如果是单个产品查询，返回单个结果
    if (products.length === 1) {
      return NextResponse.json({
        success: true,
        ...results[0],
      });
    }

    return NextResponse.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[MarketPrice] 接口错误:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: '市场价查询接口已就绪',
    endpoints: {
      POST: {
        description: '批量查询产品市场价',
        body: {
          products: [
            { name: '产品名称', model: '型号', specs: '规格' }
          ]
        }
      }
    }
  });
}