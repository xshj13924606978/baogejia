// 会员套餐列表 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getMembershipPlans } from '@/lib/membership-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const plans = await getMembershipPlans({ includeInactive: false });
    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error('[MembershipPlans API] 获取套餐失败:', error);
    return NextResponse.json({ success: false, error: '获取套餐列表失败' }, { status: 500 });
  }
}
