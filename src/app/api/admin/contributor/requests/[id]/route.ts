import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import {
  reviewProductUpdateRequest,
  reviewProductUpdateRequestsBySource,
} from '@/lib/contributor/service';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/contributor/requests/:id
 * 管理端获取单条/批次产品修改请求详情
 * 若该请求有 source_id，则返回同 source_id 下所有请求（items）用于汇总审批展示
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await context.params;
    const db = getSupabaseServiceClient();

    const { data: requestRow, error } = await db
      .from('product_update_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !requestRow) {
      return NextResponse.json({ error: '请求不存在' }, { status: 404 });
    }

    let items: any[] = [requestRow];
    if (requestRow.source_id) {
      const { data: batch } = await db
        .from('product_update_requests')
        .select('*')
        .eq('source_id', requestRow.source_id)
        .order('created_at', { ascending: true });
      if (batch && batch.length > 0) items = batch;
    }

    const productIds = [...new Set(items.map((r) => r.product_id))];
    const { data: products } = await db
      .from('products')
      .select('id, name, model, image_url, category, price')
      .in('id', productIds);
    const productMap = new Map((products || []).map((p) => [p.id, p]));

    return NextResponse.json({
      success: true,
      request: requestRow,
      items: items.map((r) => ({ ...r, product: productMap.get(r.product_id) || null })),
    });
  } catch (error) {
    console.error('[Admin] 获取产品修改请求详情异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/contributor/requests/:id
 * 管理端审批产品修改请求
 * body: { decision: 'approved' | 'rejected', comment?: string }
 *
 * 逻辑：
 * - 单条请求（无 source_id 或 source_id 为空）走单条审批
 * - 批量请求（有 source_id）按 source_id 批量审批
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '请求体无效' }, { status: 400 });
    }
    const decision = body.decision;
    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json({ error: 'decision 必须为 approved 或 rejected' }, { status: 400 });
    }

    // 先查 source_id 判断单条还是批量
    const db = getSupabaseServiceClient();
    const { data: requestRow, error: fetchError } = await db
      .from('product_update_requests')
      .select('id, source_id')
      .eq('id', id)
      .single();

    if (fetchError || !requestRow) {
      return NextResponse.json({ error: '请求不存在' }, { status: 404 });
    }

    let result;
    let message: string;
    if (requestRow.source_id) {
      result = await reviewProductUpdateRequestsBySource({
        sourceId: requestRow.source_id,
        reviewerId: user.id,
        decision,
        comment: typeof body.comment === 'string' ? body.comment : undefined,
      });
      message = decision === 'approved' ? `已通过，共更新 ${result.count || 0} 个产品` : `已拒绝该批次共 ${result.count || 0} 个请求`;
    } else {
      result = await reviewProductUpdateRequest({
        requestId: id,
        reviewerId: user.id,
        decision,
        comment: typeof body.comment === 'string' ? body.comment : undefined,
      });
      message = decision === 'approved' ? '已通过，产品数据已更新' : '已拒绝该请求';
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const payload: Record<string, unknown> = { success: true, message };
    if ('productId' in result && result.productId) {
      payload.productId = result.productId;
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Admin] 审批产品修改请求异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
