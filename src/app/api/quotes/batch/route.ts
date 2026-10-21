import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

const EDITABLE_STATUS = 'draft';

type BatchAction = 'delete' | 'send';

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  let body: { ids?: string[]; action?: BatchAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求体解析失败' }, { status: 400 });
  }

  const { ids, action } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ success: false, error: '请选择至少一条记录' }, { status: 400 });
  }

  if (!action || !['delete', 'send'].includes(action)) {
    return NextResponse.json({ success: false, error: '不支持的批量操作' }, { status: 400 });
  }

  const db = getSupabaseServiceClient();

  try {
    // 先查询可见记录，校验归属与状态
    let query = db
      .from('quotes')
      .select('id, user_id, status, issued_at, version')
      .in('id', ids)
      .is('deleted_at', null);

    if (!isAdminRole(user.role)) {
      query = query.eq('user_id', user.id);
    }

    const { data: rows, error: queryError } = await query;

    if (queryError) {
      console.error('[Quotes Batch] 查询失败:', queryError);
      return NextResponse.json({ success: false, error: '查询报价单失败' }, { status: 500 });
    }

    const visibleIds = new Set((rows || []).map((r) => r.id));
    const notFoundIds = ids.filter((id) => !visibleIds.has(id));

    if (notFoundIds.length > 0) {
      return NextResponse.json(
        { success: false, error: `部分报价单不存在或无权限：${notFoundIds.join(', ')}` },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const invalid: string[] = [];

    if (action === 'delete') {
      for (const row of rows || []) {
        if (row.status !== EDITABLE_STATUS) {
          invalid.push(row.id);
        }
      }

      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: '仅「草稿」状态的报价单可批量删除' },
          { status: 400 }
        );
      }

      const { error: updateError } = await db
        .from('quotes')
        .update({ deleted_at: now })
        .in('id', ids);

      if (updateError) {
        console.error('[Quotes Batch] 删除失败:', updateError);
        return NextResponse.json({ success: false, error: '批量删除失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `已成功删除 ${ids.length} 条报价单`,
        deletedCount: ids.length,
      });
    }

    if (action === 'send') {
      for (const row of rows || []) {
        if (row.status !== EDITABLE_STATUS) {
          invalid.push(row.id);
        }
      }

      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: '仅「草稿」状态的报价单可批量发送' },
          { status: 400 }
        );
      }

      // 分两步原子更新，避免行级条件导致多次往返
      const { error: sendError } = await db
        .from('quotes')
        .update({ status: 'sent', updated_at: now })
        .in('id', ids);

      if (sendError) {
        console.error('[Quotes Batch] 发送失败:', sendError);
        return NextResponse.json({ success: false, error: '批量发送失败' }, { status: 500 });
      }

      // 仅对尚未设置 issued_at 的记录补录签发时间
      const needIssuedAtIds = (rows || []).filter((row) => !row.issued_at).map((row) => row.id);
      if (needIssuedAtIds.length > 0) {
        const { error: issuedError } = await db
          .from('quotes')
          .update({ issued_at: now })
          .in('id', needIssuedAtIds);

        if (issuedError) {
          console.error('[Quotes Batch] 记录签发时间失败:', issuedError);
          // 状态已更新成功，仅记录时间失败，仍返回可感知的成功
        }
      }

      return NextResponse.json({
        success: true,
        message: `已成功发送 ${ids.length} 条报价单`,
        sentCount: ids.length,
      });
    }

    return NextResponse.json({ success: false, error: '不支持的批量操作' }, { status: 400 });
  } catch (error: any) {
    console.error('[Quotes Batch] 异常:', error);
    return NextResponse.json({ success: false, error: '批量操作失败' }, { status: 500 });
  }
}
