// 管理端提现申请列表 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getAdminWithdrawList, getWithdrawStats } from '@/lib/withdraw-service';

async function handleGET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    const page = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('pageSize') || '20');

    const [list, stats] = await Promise.all([
      getAdminWithdrawList({ status, page, pageSize }),
      getWithdrawStats(),
    ]);

    return NextResponse.json({
      success: true,
      records: list.records,
      total: list.total,
      page,
      pageSize,
      stats,
    });
  } catch (error) {
    console.error('[AdminWithdrawList] 查询失败:', error);
    return NextResponse.json({ success: false, error: '获取提现列表失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.withdraw.view' }, handleGET);
