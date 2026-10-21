// 管理端品牌列表 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getAdminBrandVendors } from '@/lib/brand-service';

async function listBrandVendors(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';
    const keyword = searchParams.get('keyword') || undefined;
    const page = Number(searchParams.get('page') || 1);
    const pageSize = Number(searchParams.get('pageSize') || 20);

    const result = await getAdminBrandVendors({ status, keyword, page, pageSize });
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, brands: result.records, total: result.total });
  } catch (error) {
    console.error('[AdminBrandVendors GET] 获取品牌列表失败:', error);
    return NextResponse.json({ success: false, error: '获取品牌列表失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.brand.view' }, listBrandVendors);
