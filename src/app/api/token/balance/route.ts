// Token 余额 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getTokenBalance } from '@/lib/token-purchase-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const result = await getTokenBalance(user.id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 500 });
    }
    return NextResponse.json({ success: true, balance: result.balance, pointsBalance: result.pointsBalance });
  } catch (error) {
    console.error('[TokenBalance API] 获取余额失败:', error);
    return NextResponse.json({ success: false, error: '获取余额失败' }, { status: 500 });
  }
}
