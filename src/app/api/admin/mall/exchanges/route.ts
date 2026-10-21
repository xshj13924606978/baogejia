// 管理端商城兑换记录 API（列表）
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getAdminExchanges } from '@/lib/mall-service';

async function handleGET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    const page = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('pageSize') || '20');

    const result = await getAdminExchanges({ status, page, pageSize });
    return NextResponse.json({
      success: true,
      records: result.records,
      total: result.total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[AdminMallExchanges] 查询失败:', error);
    return NextResponse.json({ success: false, error: '获取兑换记录失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.mall.view' }, handleGET);
