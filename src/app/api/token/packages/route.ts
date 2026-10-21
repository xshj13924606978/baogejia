// Token 套餐列表 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getTokenPackages } from '@/lib/token-purchase-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const packages = await getTokenPackages({ includeInactive: false });
    return NextResponse.json({ success: true, packages });
  } catch (error) {
    console.error('[TokenPackages API] 获取套餐失败:', error);
    return NextResponse.json({ success: false, error: '获取套餐列表失败' }, { status: 500 });
  }
}
