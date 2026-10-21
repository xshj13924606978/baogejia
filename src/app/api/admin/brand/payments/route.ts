// 管理端品牌付费记录列表 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getAdminBrandPayments } from '@/lib/brand-service';

async function listBrandPayments(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';
    const page = Number(searchParams.get('page') || 1);
    const pageSize = Number(searchParams.get('pageSize') || 20);

    const result = await getAdminBrandPayments({ status, page, pageSize });
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, payments: result.records, total: result.total });
  } catch (error) {
    console.error('[AdminBrandPayments GET] 获取付费记录失败:', error);
    return NextResponse.json({ success: false, error: '获取付费记录失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.brand.view' }, listBrandPayments);
