import { NextRequest, NextResponse } from 'next/server';
import { SearchClient, Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { productName, specifications } = await request.json();

    console.log('[MarketPrice] Search request:', { productName, specifications });

    if (!productName) {
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 }
      );
    }

    // 提取并转发请求头
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化搜索客户端
    const config = new Config();
    const client = new SearchClient(config, customHeaders);

    // 构建搜索查询 - 使用更简单的查询词
    let searchQuery = `${productName} 价格`;
    if (specifications) {
      searchQuery += ` ${specifications}`;
    }

    console.log('[MarketPrice] Search query:', searchQuery);

    // 使用advancedSearch搜索
    const response = await client.advancedSearch(searchQuery, {
      searchType: 'web',
      count: 15, // 增加搜索结果数量
      timeRange: '6m', // 扩大时间范围到6个月
      needSummary: true,
      needContent: true,
      needUrl: true,
    });

    console.log('[MarketPrice] Search results count:', response.web_items?.length || 0);

    // 准备搜索结果文本，用于LLM分析
    const searchResultsText = response.web_items?.map((item, index) => {
      return `【搜索结果${index + 1}】
标题：${item.title}
来源：${item.site_name || '未知'}
时间：${item.publish_time || '未知'}
摘要：${item.snippet || '无摘要'}`;
    }).join('\n\n') || '无搜索结果';

    console.log('[MarketPrice] Search results text length:', searchResultsText.length);

    // 使用LLM智能提取价格信息
    let llmExtractedPrices = [];
    if (response.web_items && response.web_items.length > 0) {
      try {
        const llmConfig = new Config();
        const llmClient = new LLMClient(llmConfig, customHeaders);

        const prompt = `请从以下搜索结果中提取产品"${productName}"${specifications ? `（规格：${specifications}）` : ''}的价格信息。

${searchResultsText}

请以JSON数组格式返回找到的价格信息，格式如下：
[
  {
    "source": "来源网站名称",
    "price": 价格数字,
    "priceText": "原始价格文本",
    "description": "简短描述（可选）"
  }
]

注意：
1. 只提取明确标注了价格的结果
2. 价格应该是该产品的单价，不是总价或其他费用
3. 如果没有找到价格，返回空数组[]
4. 确保返回的JSON格式正确，不要包含其他文本`;

        const llmResponse = await llmClient.invoke([
          { role: 'user', content: prompt }
        ], { temperature: 0.3 });

        console.log('[MarketPrice] LLM response:', llmResponse.content.substring(0, 500));

        // 尝试从LLM响应中提取JSON
        const jsonMatch = llmResponse.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          llmExtractedPrices = JSON.parse(jsonMatch[0]);
          console.log('[MarketPrice] LLM extracted prices:', llmExtractedPrices.length);
        }
      } catch (llmError) {
        console.error('[MarketPrice] LLM extraction failed:', llmError);
        // 继续使用正则表达式提取作为后备方案
      }
    }

    // 如果LLM提取失败或没有结果，使用正则表达式作为后备方案
    if (llmExtractedPrices.length === 0) {
      console.log('[MarketPrice] Using regex extraction as fallback');
      const regexPriceResults = processPriceResults(response.web_items || []);
      llmExtractedPrices = regexPriceResults.map(r => ({
        source: r.source,
        price: r.price,
        priceText: r.priceText,
        description: r.title
      }));
    }

    // 计算平均市场价格
    const marketPrices = llmExtractedPrices.map((r: any) => r.price);
    const avgMarketPrice = marketPrices.length > 0
      ? marketPrices.reduce((sum: number, price: number) => sum + price, 0) / marketPrices.length
      : null;

    const result = {
      productName,
      searchQuery,
      summary: response.summary,
      results: llmExtractedPrices,
      averageMarketPrice: avgMarketPrice,
      minPrice: marketPrices.length > 0 ? Math.min(...marketPrices) : null,
      maxPrice: marketPrices.length > 0 ? Math.max(...marketPrices) : null,
      sampleSize: marketPrices.length,
    };

    console.log('[MarketPrice] Final result:', {
      avgPrice: avgMarketPrice,
      minPrice: result.minPrice,
      maxPrice: result.maxPrice,
      sampleSize: result.sampleSize,
      resultsCount: llmExtractedPrices.length,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[MarketPrice] Search error:', error);
    return NextResponse.json(
      { error: 'Failed to search market price', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// 处理搜索结果，提取价格信息
function processPriceResults(items: any[]): Array<{
  source: string;
  title: string;
  url: string;
  price: number;
  priceText: string;
  publishTime?: string;
}> {
  const results: any[] = [];

  for (const item of items) {
    // 从标题和摘要中提取价格
    const priceText = extractPriceText(item.title) || extractPriceText(item.snippet) || extractPriceText(item.summary || '');

    if (priceText) {
      const price = parsePrice(priceText);
      if (price > 0) {
        results.push({
          source: item.site_name || 'Unknown',
          title: item.title,
          url: item.url,
          price: price,
          priceText: priceText,
          publishTime: item.publish_time,
        });
      }
    }
  }

  // 按价格排序
  return results.sort((a, b) => a.price - b.price);
}

// 从文本中提取价格字符串
function extractPriceText(text: string): string | null {
  if (!text) return null;

  // 匹配价格模式：¥123.45、123.45元、123.45、CNY 123.45、¥123等
  const pricePatterns = [
    /¥(\d+(?:,\d{3})*(?:\.\d{1,2})?)/,
    /(\d+(?:,\d{3})*(?:\.\d{1,2})?)元/,
    /CNY\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i,
    /人民币\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/,
    /价格[：:]\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/,
    /报价[：:]\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/,
    /售价[：:]\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/,
    /(\d{4,6})\s*元/, // 匹配 4-6位数的整数价格
    /¥(\d{4,6})/, // 匹配 ¥开头 4-6位数的整数价格
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// 解析价格字符串为数字
function parsePrice(priceText: string): number {
  // 移除千位分隔符
  const cleaned = priceText.replace(/,/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

// 从AI摘要中提取价格信息
function extractPriceFromSummary(summary: string): {
  min: number;
  max: number;
  avg: number;
  text: string;
} | null {
  if (!summary) return null;

  const priceText = extractPriceText(summary);
  if (priceText) {
    const price = parsePrice(priceText);
    return {
      min: price,
      max: price,
      avg: price,
      text: priceText,
    };
  }

  // 尝试提取价格范围（如：100-200元）
  const rangeMatch = summary.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-~到至]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (rangeMatch) {
    const minPrice = parsePrice(rangeMatch[1]);
    const maxPrice = parsePrice(rangeMatch[2]);
    return {
      min: minPrice,
      max: maxPrice,
      avg: (minPrice + maxPrice) / 2,
      text: `${rangeMatch[1]}-${rangeMatch[2]}`,
    };
  }

  return null;
}
