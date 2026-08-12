export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { listPendingUploads } from '@/lib/contributor/service';
import { UPLOAD_STATUS_LABELS, UploadStatus } from '@/lib/contributor/types';

/**
 * 管理接口：获取待审核资料列表
 * 支持 ?status=pending|approved|rejected 过滤
 * 需要管理员权限
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const status = (request.nextUrl.searchParams.get('status') as UploadStatus) || 'pending';
    const validStatuses = Object.keys(UPLOAD_STATUS_LABELS);
    const finalStatus = validStatuses.includes(status) ? status : 'pending';

    const uploads = await listPendingUploads(finalStatus);
    return NextResponse.json({ success: true, uploads });
  } catch (error) {
    console.error('[Admin] 获取待审核资料异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
