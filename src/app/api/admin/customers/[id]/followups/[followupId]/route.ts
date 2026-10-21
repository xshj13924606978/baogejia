import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

type RouteContext = { params: Promise<{ id: string; followupId: string }> };

/**
 * 单条跟进记录管理后台 - 更新 / 删除
 *
 * PUT    /api/admin/customers/:id/followups/:followupId
 * DELETE /api/admin/customers/:id/followups/:followupId
 */

export async function PUT(request: NextRequest, context: RouteContext) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { id, followupId } = await context.params;
  if (!/^\d+$/.test(id) || !followupId) {
    return NextResponse.json({ success: false, error: '参数无效' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { followupType, content, nextFollowupDate, status } = body || {};

    const db = getSupabaseServiceClient();

    // 校验 followup 属于该客户
    const { data: existing, error: readErr } = await db
      .from('customer_followups')
      .select('id, customer_id')
      .eq('id', followupId)
      .eq('customer_id', Number(id))
      .single();
    if (readErr || !existing) {
      return NextResponse.json({ success: false, error: '跟进记录不存在' }, { status: 404 });
    }

    const validTypes = ['call', 'visit', 'email', 'wechat', 'meeting', 'other'];
    const validStatuses = ['pending', 'completed', 'cancelled'];

    const updateObj: Record<string, unknown> = {};
    if (followupType !== undefined) {
      updateObj.followup_type = validTypes.includes(followupType) ? followupType : 'call';
    }
    if (content !== undefined) {
      if (!String(content).trim()) {
        return NextResponse.json({ success: false, error: '跟进内容不能为空' }, { status: 400 });
      }
      updateObj.content = String(content).trim();
    }
    if (nextFollowupDate !== undefined) {
      updateObj.next_followup_date = nextFollowupDate
        ? new Date(nextFollowupDate).toISOString()
        : null;
    }
    if (status !== undefined) {
      updateObj.status = validStatuses.includes(status) ? status : 'pending';
    }

    if (Object.keys(updateObj).length === 0) {
      return NextResponse.json({ success: false, error: '没有可更新的字段' }, { status: 400 });
    }

    const { data, error } = await db
      .from('customer_followups')
      .update(updateObj)
      .eq('id', followupId)
      .select('*, user:users(id, username, full_name, email)')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[Admin Followups] PUT error:', e);
    return NextResponse.json({ success: false, error: '更新跟进记录失败' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { errorResponse } = await requireAdmin(_request);
  if (errorResponse) return errorResponse;

  const { id, followupId } = await context.params;
  if (!/^\d+$/.test(id) || !followupId) {
    return NextResponse.json({ success: false, error: '参数无效' }, { status: 400 });
  }

  const db = getSupabaseServiceClient();

  try {
    // 校验 followup 属于该客户
    const { data: existing, error: readErr } = await db
      .from('customer_followups')
      .select('id, customer_id')
      .eq('id', followupId)
      .eq('customer_id', Number(id))
      .single();
    if (readErr || !existing) {
      return NextResponse.json({ success: false, error: '跟进记录不存在' }, { status: 404 });
    }

    const { error } = await db
      .from('customer_followups')
      .delete()
      .eq('id', followupId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[Admin Followups] DELETE error:', e);
    return NextResponse.json({ success: false, error: '删除跟进记录失败' }, { status: 500 });
  }
}
