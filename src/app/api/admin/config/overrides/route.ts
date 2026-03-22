/**
 * 用户级字段覆盖 CRUD - 集合路由
 * GET  /api/admin/config/overrides - 覆盖规则列表
 * POST /api/admin/config/overrides - 创建覆盖规则
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const user_id = sp.get('user_id') || '';
    const field_id = sp.get('field_id') || '';

    const db = getSupabaseServiceClient();
    let query = db.from('user_field_overrides').select('*, field:system_fields(id, field_key, label_zh, field_type, page_id)', { count: 'exact' });

    if (user_id) query = query.eq('user_id', user_id);
    if (field_id) query = query.eq('field_id', field_id);

    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');
    const offset = (page - 1) * limit;

    const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[OverrideAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { user_id, field_id, field_value, is_visible, is_editable } = body;

    if (!user_id || !field_id) {
      return NextResponse.json({ success: false, error: 'user_id 和 field_id 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      user_id,
      field_id,
      field_value: field_value ?? null,
      is_visible: is_visible ?? null,
      is_editable: is_editable ?? null,
    };

    const { data, error } = await db.from('user_field_overrides').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: '该用户该字段已有覆盖规则，请使用 PUT 更新' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_override', targetId: data.id, newValue: data, description: `创建用户字段覆盖: user=${user_id}, field=${field_id}` });

    return NextResponse.json({ success: true, message: '覆盖规则创建成功', data });
  } catch (error) {
    console.error('[OverrideAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
