import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

type RouteContext = { params: Promise<{ id: string; followupId: string }> };

async function getUserId(request: NextRequest): Promise<string | null> {
  const xUserId = request.headers.get('x-user-id');
  if (xUserId) return xUserId;
  try {
    const { getCurrentUser } = await import('@/lib/auth-utils');
    const user = await getCurrentUser(request);
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * 用户端单条跟进记录 - 更新 / 删除
 *
 * PUT    /api/customers/:id/followups/:followupId
 * DELETE /api/customers/:id/followups/:followupId
 *
 * 校验：客户归属 + followup 属于该客户
 */

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id, followupId } = await context.params;
  if (!/^\d+$/.test(id) || !followupId) {
    return NextResponse.json({ success: false, error: '参数无效' }, { status: 400 });
  }

  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '未认证' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  try {
    const body = await request.json();
    const { followupType, content, nextFollowupDate, status } = body || {};

    // 校验 followup 存在且属于该客户
    const { data: followup, error: readErr } = await supabase
      .from('customer_followups')
      .select('id, customer_id')
      .eq('id', followupId)
      .single();
    if (readErr || !followup) {
      return NextResponse.json({ success: false, error: '跟进记录不存在' }, { status: 404 });
    }
    if (followup.customer_id !== Number(id)) {
      return NextResponse.json(
        { success: false, error: '跟进记录与客户不匹配' },
        { status: 400 }
      );
    }

    // 校验客户归属
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, metadata')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (custErr || !customer || customer.metadata?.user_id !== userId) {
      return NextResponse.json({ success: false, error: '无权操作该客户' }, { status: 403 });
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

    const { data, error } = await supabase
      .from('customer_followups')
      .update(updateObj)
      .eq('id', followupId)
      .select('*, user:users(id, username, full_name, email)')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[User Followups] PUT error:', e);
    return NextResponse.json(
      { success: false, error: e.message || '更新跟进记录失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, followupId } = await context.params;
  if (!/^\d+$/.test(id) || !followupId) {
    return NextResponse.json({ success: false, error: '参数无效' }, { status: 400 });
  }

  const userId = await getUserId(_request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '未认证' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  try {
    // 校验 followup 存在且属于该客户
    const { data: followup, error: readErr } = await supabase
      .from('customer_followups')
      .select('id, customer_id')
      .eq('id', followupId)
      .single();
    if (readErr || !followup) {
      return NextResponse.json({ success: false, error: '跟进记录不存在' }, { status: 404 });
    }
    if (followup.customer_id !== Number(id)) {
      return NextResponse.json(
        { success: false, error: '跟进记录与客户不匹配' },
        { status: 400 }
      );
    }

    // 校验客户归属
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, metadata')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (custErr || !customer || customer.metadata?.user_id !== userId) {
      return NextResponse.json({ success: false, error: '无权操作该客户' }, { status: 403 });
    }

    const { error } = await supabase
      .from('customer_followups')
      .delete()
      .eq('id', followupId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[User Followups] DELETE error:', e);
    return NextResponse.json(
      { success: false, error: e.message || '删除跟进记录失败' },
      { status: 500 }
    );
  }
}
