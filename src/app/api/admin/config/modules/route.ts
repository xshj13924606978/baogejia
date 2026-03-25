/**
 * 模块配置 CRUD - 集合路由
 * GET  /api/admin/config/modules   - 模块列表（支持分页、搜索、筛选）
 * POST /api/admin/config/modules   - 创建模块
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';
import { mapModuleToFrontend, mapModuleToDb } from '@/lib/config-field-map';

export const GET = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const sp = request.nextUrl.searchParams;
    const keyword = sp.get('keyword') || '';
    const parentKey = sp.get('parent') || '';     // 按 parent_module_id 的 module_code 筛选
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');
    const all = sp.get('all') === 'true';          // 不分页，返回全部
    const withPageCount = sp.get('with_page_count') === 'true';

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

    // 获取页面计数（按模块分组）
    let pageCountMap: Record<string, number> = {};
    if (withPageCount) {
      const { data: pageCounts } = await db
        .from('system_pages')
        .select('module_id')
        .not('module_id', 'is', null);
      if (pageCounts) {
        for (const p of pageCounts) {
          pageCountMap[p.module_id] = (pageCountMap[p.module_id] || 0) + 1;
        }
      }
    }

    if (all) {
      const { data, error } = await query.order('sort_order', { ascending: true });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      const result = (data || []).map((m: any) => ({ ...mapModuleToFrontend(m), page_count: pageCountMap[m.id] || 0 }));
      return NextResponse.json({ success: true, data: result });
    }

    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    const result = (data || []).map((m: any) => ({ ...mapModuleToFrontend(m), page_count: pageCountMap[m.id] || 0 }));
    return NextResponse.json({ success: true, data: result, total: count || 0, page, limit });
  } catch (error) {
    console.error('[ModuleAPI] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { module_key, name_zh, name_en, icon, sort_order, is_enabled, route_path, description, permission_code } = body;

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
      is_enabled: is_enabled ?? true,
      route_path: route_path || null,
      description: description || null,
      permission_code: permission_code || null,
    };

    const { data, error } = await db.from('system_modules').insert(insertData).select().single();

    if (error) {
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return NextResponse.json({ success: false, error: `module_key "${module_key}" 已存在` }, { status: 409 });
      }
      console.error('[ModuleAPI] POST 失败:', error);
    }

    await logConfigChange({ adminId: getAdminId(request, user), targetType: 'module', targetId: data.id, newValue: data, description: `创建模块: ${name_zh}` });

    return NextResponse.json({ success: true, message: '模块创建成功', data });
  } catch (error) {
    console.error('[ModuleAPI] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
