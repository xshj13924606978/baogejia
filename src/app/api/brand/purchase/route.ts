// 购买品牌推广套餐 API（用户端下单）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { purchaseBrandPackage } from '@/lib/brand-service';

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const brandId = body?.brandId;
    const packageId = body?.packageId;
    if (!brandId || !packageId || typeof brandId !== 'string' || typeof packageId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少品牌 ID 或套餐 ID' }, { status: 400 });
    }

    const result = await purchaseBrandPackage(user.id, brandId, packageId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      order: result.order,
      orderNo: result.orderNo,
      code_url: result.codeUrl,
    });
  } catch (error) {
    console.error('[BrandPurchase API] 购买套餐异常:', error);
    return NextResponse.json({ success: false, error: '购买失败，请稍后重试' }, { status: 500 });
  }
}
