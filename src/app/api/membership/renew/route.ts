// 会员续费 API（用户端）
//
// #20260831-1600 P1-5 / P1-6
// POST body: { payMethod?: 'cash' | 'points' }
//   - 续费当前生效中的套餐，有效期在原有基础上累加（未过期则顺延，已过期则从今天起算）
//   - points：直接扣积分立即生效；cash：返回微信支付二维码，回调后激活
// GET  ?planId=xxx  预览续费差价（不写库）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import {
  renewMembership,
  previewMembershipChange,
  getMembershipPayConfig,
} from '@/lib/membership-service';

export const dynamic = 'force-dynamic';

/** GET /api/membership/renew?planId=xxx - 预览续费差价（默认预览当前套餐） */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const planId = request.nextUrl.searchParams.get('planId');
    if (!planId) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const result = await previewMembershipChange(user.id, planId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    const payConfig = await getMembershipPayConfig();
    return NextResponse.json({ success: true, preview: result.preview, payConfig });
  } catch (error) {
    console.error('[MembershipRenew API] 预览续费异常:', error);
    return NextResponse.json({ success: false, error: '预览失败' }, { status: 500 });
  }
}

/** POST /api/membership/renew - 提交续费 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const payMethod = body?.payMethod === 'points' ? 'points' : 'cash';

    const result = await renewMembership(user.id, { payMethod });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      order: result.order,
      orderNo: result.orderNo,
      changeType: result.changeType,
      code_url: result.codeUrl,
      pointsUsed: result.pointsUsed ?? 0,
      refundedPoints: result.refundedPoints ?? 0,
    });
  } catch (error) {
    console.error('[MembershipRenew API] 续费异常:', error);
    return NextResponse.json({ success: false, error: '续费失败，请稍后重试' }, { status: 500 });
  }
}
