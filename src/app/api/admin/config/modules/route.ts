/**
 * 模块配置 CRUD - 集合路由
 * GET  /api/admin/config/modules   - 模块列表（支持分页、搜索、筛选）
 * POST /api/admin/config/modules   - 创建模块
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';

export const GET = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const sp = request.nextUrl.searchParams;
    const keyword = sp.get('keyword') || '';
    const parentKey = sp.get('parent') || '';     // 按 parent_module_id 的 module_key 筛选
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');
    const all = sp.get('all') === 'true';          // 不分页，返回全部

    const db = getSupabaseServiceClient();
    let query = db.from('system_modules').select('*', { count: 'exact' });

    if (keyword) {
      query = query.or(`name_zh.ilike.%${keyword}%,module_key.ilike.%${keyword}%`);
    }
    if (parentKey) {
      const { data: parent } = await db.from('system_modules').select('id').eq('module_key', parentKey).single();
      if (parent) {
        query = query.eq('parent_module_id', parent.id);
      }
    }

    const offset = (page - 1) * limit;

    if (all) {
      const { data, error } = await query.order('sort_order', { ascending: true });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: data || [] });
    }

    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[ModuleAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { module_key, name_zh, name_en, icon, sort_order, parent_module_id, is_enabled, is_visible_in_menu, route_path, config } = body;

    if (!module_key || !name_zh) {
      return NextResponse.json({ success: false, error: 'module_key 和 name_zh 不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const insertData: Record<string, any> = {
      module_key,
      name_zh,
      name_en: name_en || null,
      icon: icon || null,
      sort_order: sort_order ?? 0,
      parent_module_id: parent_module_id || null,
      is_enabled: is_enabled ?? true,
      is_visible_in_menu: is_visible_in_menu ?? true,
      route_path: route_path || null,
      config: config || {},
    };

    const { data, error } = await db.from('system_modules').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return NextResponse.json({ success: false, error: `module_key "${module_key}" 已存在` }, { status: 409 });
      }
      if (error.message?.includes('foreign key')) {
        return NextResponse.json({ success: false, error: '父模块不存在' }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'module', targetId: data.id, newValue: data, description: `创建模块: ${name_zh}` });

    return NextResponse.json({ success: true, message: '模块创建成功', data });
  } catch (error) {
    console.error('[ModuleAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
