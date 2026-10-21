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
      const pagesByMenuId = new Map<string, any[]>();
      for (const p of pages || []) {
        const list = pagesByMenuId.get(p.menu_id) || [];
        list.push(p);
        pagesByMenuId.set(p.menu_id, list);
      }

      // 3.5 防御性去重：某些运行环境（如 029/040 迁移执行异常）可能产生同名 menu_key 的重复分组，
      //      导致菜单中出现两个「系统管理」。这里按 menu_key 合并分组并对子页面按 page_key 去重。
      //      子页面保留首次出现版本，确保 029 的正确 route_path 优先于 040 的异常数据。
      const menuByKey = new Map<string, any>();
      for (const m of menus) {
        if (!menuByKey.has(m.menu_key)) {
          menuByKey.set(m.menu_key, { ...m });
        }
      }
      const uniqueMenus = Array.from(menuByKey.values());

      const pagesByMenuKey = new Map<string, Map<string, any>>();
      for (const [menuId, pageList] of pagesByMenuId.entries()) {
        const menu = menus.find((m) => m.id === menuId);
        if (!menu) continue;
        const keyMap = pagesByMenuKey.get(menu.menu_key) || new Map<string, any>();
        for (const p of pageList) {
          if (!keyMap.has(p.page_key)) {
            keyMap.set(p.page_key, p);
          }
        }
        pagesByMenuKey.set(menu.menu_key, keyMap);
      }

      // 4. 构建树结构
      //    权限过滤由前端 useUserMenuConfig 基于 userMenus/userMenuPages 数据控制：
      //    迁移 052 已配置「管理后台」admin 页面非管理员不可见、管理员默认可见
      //    （#202608242100 移除 system_mgmt 硬编码过滤，恢复管理员菜单入口）
      const tree = uniqueMenus.map((m) => {
        const items = Array.from((pagesByMenuKey.get(m.menu_key) || new Map()).values())
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p) => {
            if (p.page_key === 'settings') {
              return {
                ...p,
                action_type: 'dialog',
                config: { ...p.config, dialogKey: 'settings' },
              };
            }
            // account_management 当前无独立页面（/account 与 /settings/account 均不存在），
            // 为避免 404 并与「个人资料」区分，改为打开「账户设置」对话框（#202608242100）
            if (p.page_key === 'account_management') {
              return {
                ...p,
                name_zh: '账户设置',
                action_type: 'dialog',
                route_path: null,
                config: { ...(p.config || {}), dialogKey: 'settings' },
              };
            }
            return p;
          });
        return { ...m, items };
      });

      return NextResponse.json({ success: true, data: tree });
    } catch (error) {
      console.error('[QueryUserMenuAPI] 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
