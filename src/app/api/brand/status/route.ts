// 品牌状态 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getBrandByUserId } from '@/lib/brand-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const brand = await getBrandByUserId(user.id);
    return NextResponse.json({ success: true, brand });
  } catch (error) {
    console.error('[BrandStatus API] 获取品牌状态失败:', error);
    return NextResponse.json({ success: false, error: '获取品牌状态失败' }, { status: 500 });
  }
}
