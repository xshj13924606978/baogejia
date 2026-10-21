// 会员购买历史 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getMembershipHistory } from '@/lib/membership-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50));
    const history = await getMembershipHistory(user.id, limit);
    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error('[MembershipHistory API] 获取历史失败:', error);
    return NextResponse.json({ success: false, error: '获取购买历史失败' }, { status: 500 });
  }
}
