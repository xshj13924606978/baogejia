// 会员升级 API（用户端）
//
// #20260831-1600 P1-5
// POST body: { planId: string, payMethod?: 'cash' | 'points' }
//   升级判定：目标套餐等级权重 > 当前等级权重 → 升级，需补差价
//   差价计算（真实数据，无硬编码）：
//     remainingDays  = max(0, ceil((end_date - now) / 1天))
//     remainingValue = (旧套餐价 / 旧套餐天数) * remainingDays
//     priceDiff      = 新套餐价 - remainingValue        // >0 需补
//   新 end_date = now + 新套餐天数
// GET  ?planId=xxx  预览升级差价（不写库）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import {
  changeMembershipPlan,
  previewMembershipChange,
  getMembershipPayConfig,
  LEVEL_WEIGHT,
} from '@/lib/membership-service';

export const dynamic = 'force-dynamic';

/** GET /api/membership/upgrade?planId=xxx - 预览升级差价 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const planId = request.nextUrl.searchParams.get('planId');
    if (!planId) {
      return NextResponse.json({ success: false, error: '缺少目标套餐 ID' }, { status: 400 });
    }
    const result = await previewMembershipChange(user.id, planId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    const payConfig = await getMembershipPayConfig();
    return NextResponse.json({ success: true, preview: result.preview, payConfig });
  } catch (error) {
    console.error('[MembershipUpgrade API] 预览升级异常:', error);
    return NextResponse.json({ success: false, error: '预览失败' }, { status: 500 });
  }
}

/** POST /api/membership/upgrade - 提交升级 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const planId = body?.planId;
    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少目标套餐 ID' }, { status: 400 });
    }
    const payMethod = body?.payMethod === 'points' ? 'points' : 'cash';

    // 方向校验：必须是升级（或新购），降级请用 /api/membership/downgrade
    const preview = await previewMembershipChange(user.id, planId);
    if (!preview.success) {
      return NextResponse.json({ success: false, error: preview.reason }, { status: 400 });
    }
    const curWeight = preview.preview.currentLevelCode
      ? LEVEL_WEIGHT[preview.preview.currentLevelCode] ?? 0
      : 0;
    const tgtWeight = LEVEL_WEIGHT[preview.preview.targetLevelCode] ?? 0;
    if (preview.preview.currentLevelCode && tgtWeight < curWeight) {
      return NextResponse.json(
        { success: false, error: '目标套餐等级低于当前等级，请使用降级接口' },
        { status: 400 }
      );
    }

    const result = await changeMembershipPlan(user.id, planId, { payMethod });
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
    console.error('[MembershipUpgrade API] 升级异常:', error);
    return NextResponse.json({ success: false, error: '升级失败，请稍后重试' }, { status: 500 });
  }
}
