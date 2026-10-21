import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { submitProductUpdateRequest, mergeProductData } from '@/lib/contributor/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tables/products/overwrite-requests
 * 批量导入「覆盖更新」：对检测到的重复产品提交覆盖审批请求
 * body: { items: [{ productId, newData }], reason, requesterName }
 * - 非管理员：创建 import 审批请求，由管理员审核通过后生效
 * - 管理员：直接合并覆盖更新（立即生效）
 */
export async function POST(request: NextRequest) {
  const ctx = await resolveAuthContext(request);
  if (!ctx.isAuthenticated || !ctx.currentUserId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: '请求体无效' }, { status: 400 });
  }
  const items: Array<{ productId: string; newData: Record<string, unknown> }> = Array.isArray(body.items)
    ? body.items
    : [];
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const requesterName = typeof body.requesterName === 'string' ? body.requesterName : '';

  if (items.length === 0) {
    return NextResponse.json({ error: '没有需要覆盖的产品' }, { status: 400 });
  }

  const isAdmin = ctx.effectiveRole === 'admin' || ctx.effectiveRole === 'super_admin';
  const db = getSupabaseServiceClient();

  let submittedCount = 0;
  let directCount = 0;
  const errors: string[] = [];

  for (const item of items) {
    const { productId, newData } = item || {};
    if (!productId || !newData || typeof newData !== 'object') {
      errors.push('存在无效条目，已跳过');
      continue;
    }

    // 读取完整快照（含敏感字段），作为审核对比与保留原值
    const { data: existing } = await db.from('products').select('*').eq('id', productId).single();
    if (!existing) {
      errors.push(`产品 ${productId} 不存在，已跳过`);
      continue;
    }

    if (isAdmin) {
      const finalData = mergeProductData(existing, newData);
      const { error } = await db.from('products').update(finalData).eq('id', productId);
      if (error) {
        errors.push(`更新失败: ${error.message}`);
      } else {
        directCount++;
      }
    } else {
      const result = await submitProductUpdateRequest({
        productId,
        originalData: existing,
        newData,
        reason,
        requestType: 'import',
        requesterId: ctx.currentUserId,
        requesterName,
      });
      if (result.success) {
        submittedCount++;
      } else {
        errors.push(`覆盖申请提交失败: ${result.error}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    submittedCount,
    directCount,
    errors: errors.length > 0 ? errors : undefined,
    message: isAdmin
      ? `已直接覆盖更新 ${directCount} 条产品`
      : `已提交 ${submittedCount} 条覆盖申请，等待管理员审核通过后生效`,
  });
}
