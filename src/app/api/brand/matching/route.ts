// 匹配推荐品牌 API（公开，询价/查价时优先匹配）
import { NextRequest, NextResponse } from 'next/server';
import { getMatchingBrands } from '@/lib/brand-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || undefined;
    const limit = Number(searchParams.get('limit') || 10);

    const brands = await getMatchingBrands({ category, limit });
    return NextResponse.json({ success: true, brands });
  } catch (error) {
    console.error('[BrandMatching API] 获取匹配品牌失败:', error);
    return NextResponse.json({ success: false, error: '获取匹配品牌失败' }, { status: 500 });
  }
}
