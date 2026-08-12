export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { reviewUpload } from '@/lib/contributor/service';
import { UploadStatus } from '@/lib/contributor/types';

/**
 * 管理接口：审核资料（通过/拒绝）
 * 需要管理员权限
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status, comment } = body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: '无效的审核状态' }, { status: 400 });
    }

    const result = await reviewUpload({
      uploadId: id,
      reviewerId: user.id,
      status: status as UploadStatus,
      comment,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || '审核失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: '审核完成' });
  } catch (error) {
    console.error('[Admin] 审核资料异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
