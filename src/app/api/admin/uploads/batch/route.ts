import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { reviewUpload } from '@/lib/contributor/service';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 批量审批/删除待审核资料（#[20260822-1000]-2）
 * 支持价格库导入与资料贡献中心上传产生的资料统一处理。
 */
export async function POST(req: NextRequest) {
  const { user: admin, errorResponse } = await requireAdmin(req);
  if (errorResponse || !admin) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  const action =
    body.action === 'approve'
      ? 'approve'
      : body.action === 'reject'
        ? 'reject'
        : body.action === 'delete'
          ? 'delete'
          : null;
  const comment = typeof body.comment === 'string' ? body.comment : '';

  if (!action || ids.length === 0) {
    return NextResponse.json(
      { success: false, error: '缺少必要参数' },
      { status: 400 }
    );
  }

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  if (action === 'delete') {
    const db = getSupabaseServiceClient();
    const { error } = await db.from('contributor_uploads').delete().in('id', ids);
    if (error) {
      failedCount = ids.length;
      errors.push(error.message);
    } else {
      successCount = ids.length;
    }
  } else {
    const status = action === 'approve' ? 'approved' : 'rejected';
    for (const id of ids) {
      try {
        const result = await reviewUpload({
          uploadId: id,
          reviewerId: admin.id,
          status,
          comment,
        });
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          if (result.error) errors.push(result.error);
        }
      } catch (e) {
        failedCount++;
        errors.push(e instanceof Error ? e.message : '未知错误');
      }
    }
  }

  return NextResponse.json({
    success: failedCount === 0,
    successCount,
    failedCount,
    errors: errors.slice(0, 5),
  });
}
