export const dynamic = "force-dynamic";

/**
 * 菜单树查询
 * GET /api/admin/config/query/menu
 *
 * 返回所有启用的模块及其子页面，用于侧边栏动态渲染
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { isDatabaseConnectionError } from '@/lib/auth-utils';

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
    // 注意：产品列表内已集成新增/编辑弹窗，原「新增/编辑产品」菜单项冗余
    // 此处按 route_path 过滤移除（#[20260824-1716]），不影响数据库与路由文件
    const HIDDEN_PAGE_ROUTES = new Set(['/admin/products/new', '/admin/products/:id']);
    const pagesByModule = new Map<string, any[]>();
    for (const p of pages || []) {
      if (p.route_path && HIDDEN_PAGE_ROUTES.has(p.route_path)) {
        continue;
      }
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

    // 7. 调整菜单结构（数据层面仍保留原模块，仅在前端聚合展示）
    const productModule = visibleTree.find((m: any) => m.module_key === 'products');
    const knowledgeCenterModule = visibleTree.find((m: any) => m.module_key === 'knowledge-center');

    const remappedTree = visibleTree.filter((m: any) => {
      // 将导入日志合并到产品管理
      if (m.module_key === 'import-logs') {
        if (productModule) {
          productModule.children = [...productModule.children, ...m.children];
          productModule.sub_modules = [...productModule.sub_modules, ...m.sub_modules];
        }
        return false;
      }
      // 将知识库管理合并到资料中心
      if (m.module_key === 'knowledge') {
        if (knowledgeCenterModule) {
          knowledgeCenterModule.children = [...knowledgeCenterModule.children, ...m.children];
          knowledgeCenterModule.sub_modules = [...knowledgeCenterModule.sub_modules, ...m.sub_modules];
        }
        return false;
      }
      // 客户管理移到核心业务分组
      if (m.module_key === 'customer_management') {
        m.group_label = '核心业务';
      }
      return true;
    });

    return NextResponse.json({ success: true, data: remappedTree });
  } catch (error) {
    // 数据库连接/网络瞬断（DNS 解析失败、fetch 失败、超时等）：降级返回空菜单，
    // 避免管理后台控制台偶发 500 报警；前端本身已对失败静默处理
    if (isDatabaseConnectionError(error)) {
      console.warn('[QueryMenuAPI] 数据库连接失败，降级返回空菜单:', error instanceof Error ? error.message : error);
      return NextResponse.json({ success: true, data: [] });
    }
    console.error('[QueryMenuAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
