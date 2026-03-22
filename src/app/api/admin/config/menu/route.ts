/**
 * 完整菜单树
 * GET /api/admin/config/menu
 * 返回所有启用模块及其页面，用于侧边栏渲染
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const db = getSupabaseServiceClient();
    const sp = request.nextUrl.searchParams;
    const visibleOnly = sp.get('visible') !== 'false';  // 默认只返回侧边栏可见的

    // 1. 查询模块
    let moduleQuery = db
      .from('system_modules')
      .select('*')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });

    if (visibleOnly) {
      moduleQuery = moduleQuery.eq('is_visible_in_menu', true);
    }

    const { data: modules, error: modErr } = await moduleQuery;
    if (modErr) return NextResponse.json({ success: false, error: modErr.message }, { status: 500 });

    if (!modules || modules.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. 查询所有启用的页面
    const { data: pages, error: pageErr } = await db
      .from('system_pages')
      .select('*')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });

    if (pageErr) return NextResponse.json({ success: false, error: pageErr.message }, { status: 500 });

    // 3. 按模块分组
    const pageMap = new Map<string, any[]>();
    for (const p of pages || []) {
      const list = pageMap.get(p.module_id) || [];
      list.push(p);
      pageMap.set(p.module_id, list);
    }

    // 4. 构建树结构
    const moduleMap = new Map<string, any>();
    for (const m of modules) {
      moduleMap.set(m.id, { ...m, children: pageMap.get(m.id) || [] });
    }

    // 分离顶级和子模块
    const tree: any[] = [];
    const childModules: any[] = [];

    for (const m of modules) {
      if (m.parent_module_id && moduleMap.has(m.parent_module_id)) {
        childModules.push(m);
      } else {
        tree.push(moduleMap.get(m.id));
      }
    }

    // 将子模块挂载到父模块的 children 中
    for (const child of childModules) {
      const parent = moduleMap.get(child.parent_module_id);
      if (parent) {
        parent.children.push(moduleMap.get(child.id));
      }
    }

    return NextResponse.json({ success: true, data: tree });
  } catch (error) {
    console.error('[MenuAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
