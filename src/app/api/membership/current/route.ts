// 当前会员状态 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getCurrentMembership } from '@/lib/membership-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const membership = await getCurrentMembership(user.id);
    return NextResponse.json({ success: true, membership });
  } catch (error) {
    console.error('[MembershipCurrent API] 获取当前会员失败:', error);
    return NextResponse.json({ success: false, error: '获取会员状态失败' }, { status: 500 });
  }
}
