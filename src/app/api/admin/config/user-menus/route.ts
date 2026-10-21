/**
 * 用户菜单分组 CRUD - 集合路由
 * GET  /api/admin/config/user-menus   - 菜单分组列表
 * POST /api/admin/config/user-menus   - 创建菜单分组
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const keyword = sp.get('keyword') || '';
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');
    const all = sp.get('all') === 'true';
    const withPageCount = sp.get('with_page_count') === 'true';

    const db = getSupabaseServiceClient();
    let query = db.from('user_menus').select('*', { count: 'exact' });

    if (keyword) {
      query = query.or(`name_zh.ilike.%${keyword}%,menu_key.ilike.%${keyword}%`);
    }

    const offset = (page - 1) * limit;

    let pageCountMap: Record<string, number> = {};
    if (withPageCount) {
      const { data: pageCounts } = await db
        .from('user_pages')
        .select('menu_id')
        .not('menu_id', 'is', null);
      if (pageCounts) {
        for (const p of pageCounts) {
          pageCountMap[p.menu_id] = (pageCountMap[p.menu_id] || 0) + 1;
        }
      }
    }

    if (all) {
      const { data, error } = await query.order('sort_order', { ascending: true });
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
      const result = (data || []).map((m: any) => ({ ...m, page_count: pageCountMap[m.id] || 0 }));
      return NextResponse.json({ success: true, data: result });
    }

    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    const result = (data || []).map((m: any) => ({ ...m, page_count: pageCountMap[m.id] || 0 }));
    return NextResponse.json({ success: true, data: result, total: count || 0, page, limit });
  } catch (error) {
    console.error('[UserMenuAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, permission_code } = body;

    if (!menu_key || !name_zh) {
      return NextResponse.json({ success: false, error: 'menu_key 和 name_zh 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      menu_key,
      name_zh,
      name_en: name_en || null,
      icon: icon || null,
      sort_order: sort_order ?? 0,
      is_enabled: is_enabled ?? true,
      is_visible: is_visible ?? true,
      description: description || null,
      permission_code: permission_code || null,
    };

    const { data, error } = await db.from('user_menus').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return NextResponse.json({ success: false, error: `menu_key "${menu_key}" 已存在` }, { status: 409 });
      }
      console.error('[UserMenuAPI] POST 失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_menu', targetId: data.id, newValue: data, description: `创建用户菜单分组: ${name_zh}` });

    return NextResponse.json({ success: true, message: '菜单分组创建成功', data });
  } catch (error) {
    console.error('[UserMenuAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
