/**
 * 菜单树查询
 * GET /api/admin/config/query/menu
 *
 * 返回所有启用的模块及其子页面，用于侧边栏动态渲染
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';

export const GET = withAdmin(async (_req, user) => {
  try {
    const db = getSupabaseServiceClient();
    const isSuperAdmin = ['super_admin', 'Super_Admin', '超级管理员'].includes(user?.role || '');

    // 1. 查询所有启用的模块（排除功能模块，功能模块仅用于权限管控，不在菜单中显示）
    const { data: modules, error: modErr } = await db
      .from('system_modules')
      .select('id, module_key, name_zh, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label')
      .eq('is_enabled', true)
      .or('config->>type.is.null,config->>type.neq.feature')
      .order('sort_order', { ascending: true });

    if (modErr) return NextResponse.json({ success: false, error: modErr.message }, { status: 500 });
    if (!modules?.length) return NextResponse.json({ success: true, data: [] });

    // 2. 查询所有启用的页面
    const { data: pages, error: pageErr } = await db
      .from('system_pages')
      .select('id, page_key, name_zh, route_path, layout_template, is_enabled, module_id')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });

    if (pageErr) return NextResponse.json({ success: false, error: pageErr.message }, { status: 500 });

    // 3. 按模块 ID 分组页面
    const pagesByModule = new Map<string, any[]>();
    for (const p of pages || []) {
      const list = pagesByModule.get(p.module_id) || [];
      list.push(p);
      pagesByModule.set(p.module_id, list);
    }

    // 4. 构建模块映射
    const moduleMap = new Map<string, any>();
    for (const m of modules) {
      moduleMap.set(m.id, {
        ...m,
        children: pagesByModule.get(m.id) || [],
        sub_modules: [],
      });
    }

    // 5. 分离顶级模块和子模块，构建树
    //    超级管理员：不过滤 is_visible_in_menu；普通管理员：过滤不可见模块
    const tree: any[] = [];
    for (const m of modules) {
      if (m.parent_module_id && moduleMap.has(m.parent_module_id)) {
        if (isSuperAdmin || m.is_visible_in_menu !== false) {
          moduleMap.get(m.parent_module_id).sub_modules.push(moduleMap.get(m.id));
        }
      } else if (!m.parent_module_id) {
        tree.push(moduleMap.get(m.id));
      }
    }

    // 6. 过滤非菜单可见的顶级模块（超级管理员跳过此过滤）
    const visibleTree = isSuperAdmin ? tree : tree.filter(m => m.is_visible_in_menu !== false);

    return NextResponse.json({ success: true, data: visibleTree });
  } catch (error) {
    console.error('[QueryMenuAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
