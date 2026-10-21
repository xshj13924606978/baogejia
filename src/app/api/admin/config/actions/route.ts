/**
 * 操作按钮配置 CRUD - 集合路由
 * GET  /api/admin/config/actions - 按钮列表
 * POST /api/admin/config/actions - 创建按钮
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const page_id = sp.get('page_id') || '';

    const db = getSupabaseServiceClient();
    let query = db.from('system_actions').select('*, page:system_pages(id, page_key, name_zh)', { count: 'exact' });

    if (page_id) query = query.eq('page_id', page_id);

    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '100');
    const offset = (page - 1) * limit;

    const { data, error, count } = await query.order('sort_order', { ascending: true }).range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[ActionAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config } = body;

    if (!page_id || !action_key || !name_zh) {
      return NextResponse.json({ success: false, error: 'page_id、action_key、name_zh 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      page_id,
      action_key,
      name_zh,
      api_endpoint: api_endpoint || null,
      http_method: http_method || 'POST',
      is_visible: is_visible ?? true,
      permission_required: permission_required || null,
      sort_order: sort_order ?? 0,
      config: config || {},
    };

    const { data, error } = await db.from('system_actions').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: `action_key "${action_key}" 在该页面下已存在` }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'action', targetId: data.id, newValue: data, description: `创建按钮: ${name_zh}` });

    return NextResponse.json({ success: true, message: '按钮创建成功', data });
  } catch (error) {
    console.error('[ActionAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
