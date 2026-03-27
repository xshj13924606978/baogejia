/**
 * 用户菜单项 CRUD - 集合路由
 * GET  /api/admin/config/user-pages   - 菜单项列表（支持按分组筛选）
 * POST /api/admin/config/user-pages   - 创建菜单项
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const menu_id = sp.get('menu_id') || '';
    const keyword = sp.get('keyword') || '';
    const action_type = sp.get('action_type') || '';
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');

    const db = getSupabaseServiceClient();
    let query = db.from('user_pages').select('*, menu:user_menus(id, menu_key, name_zh, icon)', { count: 'exact' });

    if (menu_id) query = query.eq('menu_id', menu_id);
    if (keyword) query = query.or(`name_zh.ilike.%${keyword}%,page_key.ilike.%${keyword}%`);
    if (action_type) query = query.eq('action_type', action_type);

    const offset = (page - 1) * limit;
    const { data, error, count } = await query.order('sort_order', { ascending: true }).range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[UserPageAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, badge_text, badge_type, config } = body;

    if (!menu_id || !page_key || !name_zh) {
      return NextResponse.json({ success: false, error: 'menu_id、page_key、name_zh 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      menu_id,
      page_key,
      name_zh,
      icon: icon || null,
      route_path: route_path || null,
      action_type: action_type || 'navigate',
      is_enabled: is_enabled ?? true,
      is_visible: is_visible ?? true,
      sort_order: sort_order ?? 0,
      badge_text: badge_text || null,
      badge_type: badge_type || null,
      config: config || {},
    };

    const { data, error } = await db.from('user_pages').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: `page_key "${page_key}" 在该分组下已存在` }, { status: 409 });
      }
      if (error.message?.includes('foreign key')) {
        return NextResponse.json({ success: false, error: '所属菜单分组不存在' }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_page', targetId: data.id, newValue: data, description: `创建用户菜单项: ${name_zh}` });

    return NextResponse.json({ success: true, message: '菜单项创建成功', data });
  } catch (error) {
    console.error('[UserPageAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
