import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { countPendingUploads, countPendingProductRequests } from '@/lib/contributor/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/contributor/pending-count
 * 管理端待审核总计数（资料审核 + 产品修改审批），供首页/导航角标使用
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const [uploadPending, requestPending] = await Promise.all([
      countPendingUploads(),
      countPendingProductRequests(),
    ]);
    return NextResponse.json({
      success: true,
      uploadPending,
      requestPending,
      total: uploadPending + requestPending,
    });
  } catch (error) {
    console.error('[Admin] 获取待审核计数异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
