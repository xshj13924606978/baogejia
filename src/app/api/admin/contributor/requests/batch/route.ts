import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import {
  reviewProductUpdateRequest,
  reviewProductUpdateRequestsBySource,
} from '@/lib/contributor/service';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 批量审批/删除产品修改/导入覆盖请求（#[20260822-1000]-2）
 * 支持价格库导入与资料贡献中心上传产生的 product_update_requests 统一处理。
 * 对有 source_id 的批次使用按 source_id 批量审批，避免同一批次重复操作；
 * 无 source_id 的 oldId 按单条处理。
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
    const { error } = await db
      .from('product_update_requests')
      .delete()
      .in('id', ids);
    if (error) {
      failedCount = ids.length;
      errors.push(error.message);
    } else {
      successCount = ids.length;
    }
  } else {
    const decision = action === 'approve' ? 'approved' : 'rejected';
    const db = getSupabaseServiceClient();

    // 先查询选中请求的状态与 source_id，按 source_id 分组以高效处理同批次
    const { data: requests, error: fetchError } = await db
      .from('product_update_requests')
      .select('id, source_id')
      .in('id', ids)
      .eq('status', 'pending');

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: `查询请求失败: ${fetchError.message}` },
        { status: 500 }
      );
    }

    const bySource = new Map<string | null, string[]>();
    for (const r of requests || []) {
      const key = r.source_id || null;
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key)!.push(r.id);
    }

    for (const [sourceId, requestIds] of bySource.entries()) {
      if (sourceId && requestIds.length > 0) {
        // 同一 source_id 批次一次性审批
        const result = await reviewProductUpdateRequestsBySource({
          sourceId,
          reviewerId: admin.id,
          decision,
          comment,
        });
        if (result.success) {
          successCount += result.count || requestIds.length;
        } else {
          failedCount += requestIds.length;
          if (result.error) errors.push(result.error);
        }
      } else {
        // 无 source_id（旧数据或单条导入）逐条审批
        for (const id of requestIds) {
          try {
            const result = await reviewProductUpdateRequest({
              requestId: id,
              reviewerId: admin.id,
              decision,
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
    }
  }

  return NextResponse.json({
    success: failedCount === 0,
    successCount,
    failedCount,
    errors: errors.slice(0, 5),
  });
}
