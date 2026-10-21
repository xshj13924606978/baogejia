import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { listProductUpdateRequests } from '@/lib/contributor/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/contributor/requests?status=pending
 * 管理端获取产品修改审批请求列表
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const requests = await listProductUpdateRequests(status as any);
    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error('[Admin] 获取产品修改请求异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
