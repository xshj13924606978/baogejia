// 品牌付费历史 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getBrandPaymentHistory } from '@/lib/brand-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Number(searchParams.get('limit') || 20);
    const history = await getBrandPaymentHistory(user.id, limit);
    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error('[BrandHistory API] 获取付费历史失败:', error);
    return NextResponse.json({ success: false, error: '获取付费历史失败' }, { status: 500 });
  }
}
