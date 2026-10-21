// 购买会员 API（用户端下单）
//
// #20260831-1600 P1-4：新增积分支付通道
// body: { planId: string, payMethod?: 'cash' | 'points' }
//   - cash  （默认）：返回 { codeUrl } 供前端生成微信支付二维码
//   - points        ：直接扣积分并立即激活，返回 { pointsUsed }
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { purchaseMembership } from '@/lib/membership-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const planId = body?.planId;
    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }

    const payMethod = body?.payMethod === 'points' ? 'points' : 'cash';

    const result = await purchaseMembership(user.id, planId, { payMethod });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      order: result.order,
      orderNo: result.orderNo,
      payMethod: result.payMethod,
      code_url: result.codeUrl,
      pointsUsed: result.pointsUsed ?? 0,
    });
  } catch (error) {
    console.error('[MembershipPurchase API] 购买会员异常:', error);
    return NextResponse.json({ success: false, error: '购买失败，请稍后重试' }, { status: 500 });
  }
}
