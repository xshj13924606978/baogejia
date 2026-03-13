/**
 * Coze 工具 API 接口
 *
 * 提供以下接口：
 * - GET /api/coze/status - 获取工具状态
 * - POST /api/coze/search-market-price - 搜索市场价格
 * - POST /api/coze/generate-product-image - 生成产品图
 * - POST /api/coze/search-similar-products - 搜索相似产品
 * - POST /api/coze/enhance-quote - 增强报价单
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  cozeToolsService,
  MarketPriceInfo,
  GeneratedImage,
  SimilarProduct,
} from '@/lib/coze-tools';
import { quoteEnhancer, QuoteEnhancementResult, Product } from '@/lib/quote-enhancer';
import { Logger } from '@/lib/logger';

// ============================================================================
// GET - 获取工具状态
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const status = cozeToolsService.getStatus();

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        message: status.enabled
          ? 'Coze工具已启用'
          : 'Coze工具未启用，请在 .env.local 中配置 COZE_API_KEY 并设置 ENABLE_COZE_TOOLS=true',
        configuration: {
          hasApiKey:
            !!process.env.COZE_API_KEY && process.env.COZE_API_KEY !== 'your_coze_api_key_here',
          webSearchEnabled: process.env.ENABLE_COZE_WEB_SEARCH === 'true',
          embeddingEnabled: process.env.ENABLE_COZE_EMBEDDING === 'true',
          imageGenerationEnabled: process.env.ENABLE_COZE_IMAGE_GENERATION === 'true',
        },
      },
    });
  } catch (error: any) {
    Logger.error('获取工具状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '获取工具状态失败',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - 搜索市场价格
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // 路由到不同的处理器
    switch (action) {
      case 'search-market-price':
        return await handleSearchMarketPrice(body);
      case 'generate-product-image':
        return await handleGenerateProductImage(body);
      case 'search-similar-products':
        return await handleSearchSimilarProducts(body);
      case 'enhance-quote':
        return await handleEnhanceQuote(body);
      default:
        return NextResponse.json(
          {
            success: false,
            error: '未知的操作类型',
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    Logger.error('Coze API 请求失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '请求处理失败',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// 处理器函数
// ============================================================================

/**
 * 处理市场价格搜索
 */
async function handleSearchMarketPrice(body: any) {
  const { productName, productNames } = body;

  if (!productName && !productNames) {
    return NextResponse.json(
      {
        success: false,
        error: '请提供 productName 或 productNames',
      },
      { status: 400 }
    );
  }

  const status = cozeToolsService.getStatus();
  if (!status.enabled) {
    return NextResponse.json({
      success: false,
      error: 'Coze工具未启用，请配置 API Key',
      data: {
        message: '请在 .env.local 中配置 COZE_API_KEY 并设置 ENABLE_COZE_TOOLS=true',
        status,
      },
    });
  }

  try {
    let result;

    if (productNames && Array.isArray(productNames)) {
      // 批量搜索
      const resultMap = await cozeToolsService.batchSearchMarketPrices(productNames);
      result = Array.from(resultMap.entries());
    } else {
      // 单个搜索
      result = await cozeToolsService.searchMarketPrice(productName);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    Logger.error('搜索市场价格失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '搜索失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 处理产品图生成
 */
async function handleGenerateProductImage(body: any) {
  const { productName, specs, theme, type } = body;

  if (!productName) {
    return NextResponse.json(
      {
        success: false,
        error: '请提供 productName',
      },
      { status: 400 }
    );
  }

  const status = cozeToolsService.getStatus();
  if (!status.enabled || !status.imageGenerationEnabled) {
    return NextResponse.json({
      success: false,
      error: 'Coze生图工具未启用，请配置 API Key 并启用图片生成',
    });
  }

  try {
    // 生成产品图
    const result = await cozeToolsService.generateProductImage(productName, specs);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    Logger.error('生成产品图失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '生成失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 处理相似产品搜索
 */
async function handleSearchSimilarProducts(body: any) {
  const { query, products } = body;

  if (!query) {
    return NextResponse.json(
      {
        success: false,
        error: '请提供 query（搜索查询）',
      },
      { status: 400 }
    );
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: '请提供 products（产品库）',
      },
      { status: 400 }
    );
  }

  const status = cozeToolsService.getStatus();
  if (!status.enabled || !status.embeddingEnabled) {
    return NextResponse.json({
      success: false,
      error: 'Coze向量搜索工具未启用，请配置 API Key 并启用嵌入功能',
    });
  }

  try {
    const result = await cozeToolsService.searchSimilarProducts(query, products);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    Logger.error('搜索相似产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '搜索失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 处理报价单增强
 */
async function handleEnhanceQuote(body: any) {
  const { products, options } = body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: '请提供 products（产品列表）',
      },
      { status: 400 }
    );
  }

  const status = cozeToolsService.getStatus();
  if (!status.enabled) {
    return NextResponse.json({
      success: false,
      error: 'Coze工具未启用，请配置 API Key',
      data: {
        message: '即使未启用，也会使用基础功能进行处理',
        status,
      },
    });
  }

  try {
    const result = await quoteEnhancer.enhanceQuote(products, options);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    Logger.error('增强报价单失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '增强失败',
      },
      { status: 500 }
    );
  }
}
