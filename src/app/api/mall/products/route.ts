// 积分商城商品列表 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getMallProducts } from '@/lib/mall-service';

export const dynamic = 'force-dynamic';

/** GET /api/mall/products?category=xxx - 获取在售商品列表 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || undefined;
    const products = await getMallProducts({ includeInactive: false, category });
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('[MallProducts] 查询失败:', error);
    return NextResponse.json({ success: false, error: '获取商品列表失败' }, { status: 500 });
  }
}
