// 购买 Token API（用户端下单）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { purchaseToken } from '@/lib/token-purchase-service';

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const packageId = body?.packageId;
    if (!packageId || typeof packageId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }

    const result = await purchaseToken(user.id, packageId);
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
    console.error('[TokenPurchase API] 购买 Token 异常:', error);
    return NextResponse.json({ success: false, error: '购买失败，请稍后重试' }, { status: 500 });
  }
}
