// 积分商城商品详情 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getMallProductById } from '@/lib/mall-service';

export const dynamic = 'force-dynamic';

/** GET /api/mall/products/[id] - 获取商品详情 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const product = await getMallProductById(params.id);
    if (!product) {
      return NextResponse.json({ success: false, error: '商品不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('[MallProductDetail] 查询失败:', error);
    return NextResponse.json({ success: false, error: '获取商品详情失败' }, { status: 500 });
  }
}
