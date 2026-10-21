import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

type RouteContext = { params: Promise<{ id: string }> };

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
 * 用户端跟进记录 - 列表 + 新增
 *
 * GET  /api/customers/:id/followups  → 客户全部跟进（与列表可见性一致：owner + legacy）
 * POST /api/customers/:id/followups  → 新增跟进（严格归属校验：必须 owner）
 */

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  const userId = await getUserId(request);
  const supabase = getSupabaseClient();

  try {
    // 校验客户存在、未删除、且当前用户可访问（owner 或 legacy 无 user_id）
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, metadata')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (custErr || !customer) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }
    const ownerId = customer.metadata?.user_id;
    if (ownerId && (!userId || ownerId !== userId)) {
      return NextResponse.json({ success: false, error: '无权访问该客户' }, { status: 403 });
    }

    const { data: followups, error } = await supabase
      .from('customer_followups')
      .select('*, user:users(id, username, full_name, email)')
      .eq('customer_id', Number(id))
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ success: true, data: followups || [] });
  } catch (e: any) {
    console.error('[User Followups] GET error:', e);
    return NextResponse.json(
      { success: false, error: e.message || '查询跟进记录失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '未认证' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  try {
    const body = await request.json();
    const { followupType, content, nextFollowupDate, status } = body || {};

    if (!content || !String(content).trim()) {
      return NextResponse.json({ success: false, error: '跟进内容不能为空' }, { status: 400 });
    }

    // 严格归属校验：客户必须属于当前用户
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, metadata')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (custErr || !customer) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }
    if (customer.metadata?.user_id !== userId) {
      return NextResponse.json({ success: false, error: '无权操作该客户' }, { status: 403 });
    }

    const validTypes = ['call', 'visit', 'email', 'wechat', 'meeting', 'other'];
    const validStatuses = ['pending', 'completed', 'cancelled'];

    const payload = {
      customer_id: Number(id),
      user_id: userId,
      followup_type: validTypes.includes(followupType) ? followupType : 'call',
      content: String(content).trim(),
      next_followup_date: nextFollowupDate ? new Date(nextFollowupDate).toISOString() : null,
      status: validStatuses.includes(status) ? status : 'pending',
    };

    const { data, error } = await supabase
      .from('customer_followups')
      .insert(payload)
      .select('*, user:users(id, username, full_name, email)')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e: any) {
    console.error('[User Followups] POST error:', e);
    return NextResponse.json(
      { success: false, error: e.message || '创建跟进记录失败' },
      { status: 500 }
    );
  }
}
