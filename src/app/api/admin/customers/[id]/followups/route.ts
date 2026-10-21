import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 跟进记录管理后台 - 列表 + 新增
 *
 * GET  /api/admin/customers/:id/followups  → 某客户全部跟进记录（含跟进人）
 * POST /api/admin/customers/:id/followups  → 新增跟进（user_id 记录当前管理员）
 */

export async function GET(_request: NextRequest, context: RouteContext) {
  const { errorResponse } = await requireAdmin(_request);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  const db = getSupabaseServiceClient();

  try {
    // 校验客户存在且未删除
    const { data: customer, error: custErr } = await db
      .from('customers')
      .select('id')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (custErr || !customer) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }

    const { data: followups, error } = await db
      .from('customer_followups')
      .select('*, user:users(id, username, full_name, email)')
      .eq('customer_id', Number(id))
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ success: true, data: followups || [] });
  } catch (e) {
    console.error('[Admin Followups] GET error:', e);
    return NextResponse.json({ success: false, error: '查询跟进记录失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { followupType, content, nextFollowupDate, status } = body || {};

    if (!content || !String(content).trim()) {
      return NextResponse.json({ success: false, error: '跟进内容不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 校验客户存在
    const { data: customer, error: custErr } = await db
      .from('customers')
      .select('id')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (custErr || !customer) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }

    const validTypes = ['call', 'visit', 'email', 'wechat', 'meeting', 'other'];
    const validStatuses = ['pending', 'completed', 'cancelled'];

    const payload = {
      customer_id: Number(id),
      user_id: user.id,
      followup_type: validTypes.includes(followupType) ? followupType : 'call',
      content: String(content).trim(),
      next_followup_date: nextFollowupDate ? new Date(nextFollowupDate).toISOString() : null,
      status: validStatuses.includes(status) ? status : 'pending',
    };

    const { data, error } = await db
      .from('customer_followups')
      .insert(payload)
      .select('*, user:users(id, username, full_name, email)')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    console.error('[Admin Followups] POST error:', e);
    return NextResponse.json({ success: false, error: '创建跟进记录失败' }, { status: 500 });
  }
}
