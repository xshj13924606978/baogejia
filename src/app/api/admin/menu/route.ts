/**
 * 菜单配置接口 - 完整菜单树
 * GET /api/admin/menu
 *
 * 返回所有活跃模块及其页面，用于管理后台侧边栏渲染。
 * 支持通过用户权限过滤可见模块和页面。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';

interface MenuItem {
  id: number;
  module_code: string;
  module_name: string;
  module_name_en: string | null;
  icon: string | null;
  path: string | null;
  description: string | null;
  sort_order: number;
  permission_code: string | null;
  children: PageItem[];
}

interface PageItem {
  id: number;
  page_code: string;
  page_name: string;
  page_name_en: string | null;
  path: string | null;
  page_type: string;
  description: string | null;
  sort_order: number;
  permission_code: string | null;
}

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // 1. 查询所有模块
    let moduleQuery = db
      .from('system_modules')
      .select('id, module_code, module_name, module_name_en, icon, path, description, sort_order, permission_code, is_active')
      .order('sort_order', { ascending: true });

    if (!includeInactive) {
      moduleQuery = moduleQuery.eq('is_active', true);
    }

    const { data: modules, error: moduleError } = await moduleQuery;

    if (moduleError) {
      console.error('[MenuAPI] 查询模块失败:', moduleError.message);
      return NextResponse.json(
        { success: false, error: '查询模块失败', details: moduleError.message },
        { status: 500 }
      );
    }

    if (!modules || modules.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. 查询所有页面（按模块分组）
    let pageQuery = db
      .from('system_pages')
      .select('id, module_id, page_code, page_name, page_name_en, path, page_type, description, sort_order, permission_code, is_active')
      .order('sort_order', { ascending: true });

    if (!includeInactive) {
      pageQuery = pageQuery.eq('is_active', true);
    }

    const { data: pages, error: pageError } = await pageQuery;

    if (pageError) {
      console.error('[MenuAPI] 查询页面失败:', pageError.message);
      return NextResponse.json(
        { success: false, error: '查询页面失败', details: pageError.message },
        { status: 500 }
      );
    }

    // 3. 组装菜单树
    const pageMap = new Map<number, PageItem[]>();
    for (const page of pages || []) {
      const pageItem: PageItem = {
        id: page.id,
        page_code: page.page_code,
        page_name: page.page_name,
        page_name_en: page.page_name_en,
        path: page.path,
        page_type: page.page_type,
        description: page.description,
        sort_order: page.sort_order,
        permission_code: page.permission_code,
      };
      const existing = pageMap.get(page.module_id) || [];
      existing.push(pageItem);
      pageMap.set(page.module_id, existing);
    }

    const menuTree: MenuItem[] = modules.map((mod) => ({
      id: mod.id,
      module_code: mod.module_code,
      module_name: mod.module_name,
      module_name_en: mod.module_name_en,
      icon: mod.icon,
      path: mod.path,
      description: mod.description,
      sort_order: mod.sort_order,
      permission_code: mod.permission_code,
      children: pageMap.get(mod.id) || [],
    }));

    return NextResponse.json({ success: true, data: menuTree });
  } catch (error) {
    console.error('[MenuAPI] 获取菜单树失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
