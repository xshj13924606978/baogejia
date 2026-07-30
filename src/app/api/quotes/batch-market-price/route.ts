import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';

// 并发限制：最多同时 5 个请求
async function parallelLimit<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  concurrency: number = 5
): Promise<any[]> {
  const results: any[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then(result => {
      results.push(result);
    });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // 移除已完成的 Promise
      for (let i = executing.length - 1; i >= 0; i--) {
        if (results.length > 0) {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

export async function POST(request: NextRequest) {
  try {
    // 认证检查
    const authResult = await requireAuth(request);
    if (authResult.errorResponse) return authResult.errorResponse;

    const { products } = await request.json();


    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'Products array is required' }, { status: 400 });
    }

    // 并行查询所有产品的市场价格（限制并发 5 个）
    const results = await parallelLimit(products, async (product: any) => {
      try {
        // 安全地获取 origin
        const origin =
          request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';

        const response = await fetch(`${origin}/api/quotes/market-price`, {
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

    // 统计成功和失败的数量
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;


    return NextResponse.json({
      total: results.length,
      success: successCount,
      failed: failCount,
      data: results.filter((r) => r.success),
      errors: results.filter((r) => !r.success),
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
