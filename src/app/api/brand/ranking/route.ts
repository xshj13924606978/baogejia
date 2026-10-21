// 品牌排行列表 API（公开）
import { NextRequest, NextResponse } from 'next/server';
import { getBrandRankingList } from '@/lib/brand-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || undefined;
    const limit = Number(searchParams.get('limit') || 20);

    const brands = await getBrandRankingList({ category, limit });
    return NextResponse.json({ success: true, brands });
  } catch (error) {
    console.error('[BrandRanking API] 获取排行失败:', error);
    return NextResponse.json({ success: false, error: '获取品牌排行失败' }, { status: 500 });
  }
}
