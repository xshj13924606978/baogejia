// 会员降级 API（用户端）
//
// #20260831-1600 P1-5
// POST body: { planId: string }
//   降级判定：目标套餐等级权重 < 当前等级权重 → 降级，退差额
//   退差额计算（真实数据，无硬编码）：
//     remainingValue = (旧套餐价 / 旧套餐天数) * remainingDays
//     refund         = remainingValue - 新套餐价      // >0 应退
//   差额以积分退回（points.membership_rate 汇率），并写 membership_level_changes 流水
//   新 end_date = now + 新套餐天数
// GET  ?planId=xxx  预览降级退差额（不写库）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import {
  changeMembershipPlan,
  previewMembershipChange,
  getMembershipPayConfig,
  LEVEL_WEIGHT,
} from '@/lib/membership-service';

export const dynamic = 'force-dynamic';

/** GET /api/membership/downgrade?planId=xxx - 预览降级退差额 */
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
    console.error('[MembershipDowngrade API] 预览降级异常:', error);
    return NextResponse.json({ success: false, error: '预览失败' }, { status: 500 });
  }
}

/** POST /api/membership/downgrade - 提交降级（立即生效，退差额以积分退回） */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const planId = body?.planId;
    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少目标套餐 ID' }, { status: 400 });
    }

    // 方向校验：必须是降级，升级请用 /api/membership/upgrade
    const preview = await previewMembershipChange(user.id, planId);
    if (!preview.success) {
      return NextResponse.json({ success: false, error: preview.reason }, { status: 400 });
    }
    if (!preview.preview.currentLevelCode) {
      return NextResponse.json(
        { success: false, error: '当前没有生效中的会员订阅，无法降级' },
        { status: 400 }
      );
    }
    const curWeight = LEVEL_WEIGHT[preview.preview.currentLevelCode] ?? 0;
    const tgtWeight = LEVEL_WEIGHT[preview.preview.targetLevelCode] ?? 0;
    if (tgtWeight >= curWeight) {
      return NextResponse.json(
        { success: false, error: '目标套餐等级不低于当前等级，请使用升级接口' },
        { status: 400 }
      );
    }

    // 降级无需支付：直接生效并退差额（内部按 points 退回）
    const result = await changeMembershipPlan(user.id, planId, { payMethod: 'points' });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      order: result.order,
      orderNo: result.orderNo,
      changeType: result.changeType,
      refundedPoints: result.refundedPoints ?? 0,
    });
  } catch (error) {
    console.error('[MembershipDowngrade API] 降级异常:', error);
    return NextResponse.json({ success: false, error: '降级失败，请稍后重试' }, { status: 500 });
  }
}
