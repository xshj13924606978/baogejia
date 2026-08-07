export const dynamic = "force-dynamic";

/**
 * 用户菜单树查询（前端渲染用）
 * GET /api/admin/config/query/user-menu
 *
 * 返回所有启用的菜单分组及其子菜单项，用于用户端下拉菜单动态渲染
 * 不需要 admin 权限，普通用户也可调用（因为菜单是用户端用的）
 */

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheck } from '@/lib/permission-check';

export const GET = withPermissionCheck(
  { requiresAuth: false },
  async () => {
    try {
      const db = getSupabaseServiceClient();

      // 1. 查询所有启用且可见的菜单分组
      const { data: menus, error: menuErr } = await db
        .from('user_menus')
        .select('id, menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, config')
        .eq('is_enabled', true)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });

      if (menuErr) return NextResponse.json({ success: false, error: menuErr.message }, { status: 500 });
      if (!menus?.length) return NextResponse.json({ success: true, data: [] });

      // 2. 查询所有启用且可见的菜单项
      const { data: pages, error: pageErr } = await db
        .from('user_pages')
        .select('id, page_key, name_zh, icon, route_path, action_type, sort_order, badge_text, badge_type, is_enabled, is_visible, menu_id, config')
        .eq('is_enabled', true)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });

      if (pageErr) return NextResponse.json({ success: false, error: pageErr.message }, { status: 500 });

      // 3. 按菜单分组 ID 归类
      const pagesByMenu = new Map<string, any[]>();
      for (const p of pages || []) {
        const list = pagesByMenu.get(p.menu_id) || [];
        list.push(p);
        pagesByMenu.set(p.menu_id, list);
      }

      // 4. 构建树结构（过滤掉系统管理分组，其账户管理功能与个人资料重复）
      const tree = menus
        .filter((m) => m.menu_key !== 'system_mgmt')
        .map((m) => ({
          ...m,
          items: (pagesByMenu.get(m.id) || []).map((p) => {
            if (p.page_key === 'settings') {
              return {
                ...p,
                action_type: 'dialog',
                config: { ...p.config, dialogKey: 'settings' },
              };
            }
            return p;
          }),
        }));

      return NextResponse.json({ success: true, data: tree });
    } catch (error) {
      console.error('[QueryUserMenuAPI] 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
