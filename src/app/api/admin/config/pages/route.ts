/**
 * 页面配置 CRUD - 集合路由
 * GET  /api/admin/config/pages - 页面列表（支持按模块筛选）
 * POST /api/admin/config/pages - 创建页面
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const module_id = sp.get('module_id') || '';
    const keyword = sp.get('keyword') || '';
    const template = sp.get('layout_template') || '';
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');

    const db = getSupabaseServiceClient();
    let query = db.from('system_pages').select('*, module:system_modules(id, module_key, name_zh, icon)', { count: 'exact' });

    if (module_id) query = query.eq('module_id', module_id);
    if (keyword) query = query.or(`name_zh.ilike.%${keyword}%,page_key.ilike.%${keyword}%`);
    if (template) query = query.eq('layout_template', template);

    const offset = (page - 1) * limit;
    const { data, error, count } = await query.order('sort_order', { ascending: true }).range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[PageAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { module_id, page_key, name_zh, route_path, layout_template, is_enabled, config } = body;

    if (!module_id || !page_key || !name_zh) {
      return NextResponse.json({ success: false, error: 'module_id、page_key、name_zh 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      module_id,
      page_key,
      name_zh,
      route_path: route_path || null,
      layout_template: layout_template || 'default',
      is_enabled: is_enabled ?? true,
      config: config || {},
    };

    const { data, error } = await db.from('system_pages').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: `page_key "${page_key}" 在该模块下已存在` }, { status: 409 });
      }
      if (error.message?.includes('foreign key')) {
        return NextResponse.json({ success: false, error: '所属模块不存在' }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'page', targetId: data.id, newValue: data, description: `创建页面: ${name_zh}` });

    return NextResponse.json({ success: true, message: '页面创建成功', data });
  } catch (error) {
    console.error('[PageAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
