// 积分商城兑换/购买 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { exchangeMallProduct } from '@/lib/mall-service';

export const dynamic = 'force-dynamic';

/** POST /api/mall/exchange
 * body: {
 *   productId: string,
 *   quantity?: number,
 *   mode?: 'points'|'cash',
 *   remark?: string,
 *   shippingAddress?: { receiver, phone, province, city, district?, detail, zip_code? }  // 实物商品必填
 * }
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { productId, quantity, mode, remark, shippingAddress } = body;
    if (!productId) {
      return NextResponse.json({ success: false, error: '缺少商品 ID' }, { status: 400 });
    }

    const result = await exchangeMallProduct(user.id, productId, {
      quantity: Number(quantity) || 1,
      mode: mode === 'cash' ? 'cash' : 'points',
      remark: remark || null,
      // #20260831-1600 P1-8：实物商品收货地址
      shippingAddress: shippingAddress || null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[MallExchange] 兑换失败:', error);
    return NextResponse.json({ success: false, error: '兑换失败' }, { status: 500 });
  }
}
