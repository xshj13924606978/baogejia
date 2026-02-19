import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { products } = await request.json();

    console.log('[BatchMarketPrice] Batch search request:', { productCount: products?.length || 0 });

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'Products array is required' },
        { status: 400 }
      );
    }

    // 并行查询所有产品的市场价格
    const promises = products.map(async (product: any) => {
      try {
        const response = await fetch(`${request.nextUrl.origin}/api/quotes/market-price`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productName: product.name,
            specifications: product.specifications || '',
          }),
        });

        const result = await response.json();

        if (response.ok && result.averageMarketPrice) {
          return {
            originalIndex: product.originalIndex,
            productName: product.name,
            averageMarketPrice: result.averageMarketPrice,
            minPrice: result.minPrice,
            maxPrice: result.maxPrice,
            sampleSize: result.sampleSize,
            success: true,
          };
        } else {
          return {
            originalIndex: product.originalIndex,
            productName: product.name,
            success: false,
            error: result.error || 'No market price found',
          };
        }
      } catch (error) {
        console.error(`[BatchMarketPrice] Error for product ${product.name}:`, error);
        return {
          originalIndex: product.originalIndex,
          productName: product.name,
          success: false,
          error: 'Search failed',
        };
      }
    });

    // 等待所有查询完成
    const results = await Promise.all(promises);

    // 统计成功和失败的数量
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('[BatchMarketPrice] Batch search completed:', {
      total: results.length,
      success: successCount,
      failed: failCount,
    });

    return NextResponse.json({
      total: results.length,
      success: successCount,
      failed: failCount,
      data: results.filter(r => r.success),
      errors: results.filter(r => !r.success),
    });
  } catch (error) {
    console.error('[BatchMarketPrice] Batch search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to batch search market prices',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
