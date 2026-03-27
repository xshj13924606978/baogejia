/**
 * 用户字段配置 CRUD - 集合路由
 * GET  /api/admin/config/user-fields   - 字段列表
 * POST /api/admin/config/user-fields   - 创建字段
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const page_id = sp.get('page_id') || '';
    const keyword = sp.get('keyword') || '';
    const field_type = sp.get('field_type') || '';
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');

    const db = getSupabaseServiceClient();
    let query = db.from('user_fields').select('*, page:user_pages(id, page_key, name_zh)', { count: 'exact' });

    if (page_id) query = query.eq('page_id', page_id);
    if (keyword) query = query.or(`label_zh.ilike.%${keyword}%,field_key.ilike.%${keyword}%`);
    if (field_type) query = query.eq('field_type', field_type);

    const offset = (page - 1) * limit;
    const { data, error, count } = await query.order('sort_order', { ascending: true }).range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[UserFieldAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, sort_order, group_name, default_value, validation_rules, options_config, depends_on, config } = body;

    if (!page_id || !field_key || !label_zh) {
      return NextResponse.json({ success: false, error: 'page_id、field_key、label_zh 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      page_id,
      field_key,
      field_type: field_type || 'text',
      label_zh,
      is_visible: is_visible ?? true,
      is_editable: is_editable ?? true,
      is_required: is_required ?? false,
      sort_order: sort_order ?? 0,
      group_name: group_name || null,
      default_value: default_value ?? null,
      validation_rules: validation_rules || {},
      options_config: options_config ?? null,
      depends_on: depends_on ?? null,
      config: config || {},
    };

    const { data, error } = await db.from('user_fields').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: `field_key "${field_key}" 在该页面下已存在` }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_field', targetId: data.id, newValue: data, description: `创建用户字段: ${label_zh}` });

    return NextResponse.json({ success: true, message: '字段创建成功', data });
  } catch (error) {
    console.error('[UserFieldAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
