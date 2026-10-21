import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/permission-check';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * 仪表盘"快速操作"自定义
 *
 * GET  /api/admin/dashboard/quick-actions
 *   返回：
 *     {
 *       candidates: [ { action_key, action_type, label, route, icon, module_label } ... ],
 *         —— 来自 system_modules（带子页计入 module）+ system_pages
 *         —— 排除含动态参数（:id/:type 等）的子页（运行时无法直链）
 *         —— 与 admin sidebar 同源过滤避免显示已隐藏入口
 *       selected: [ { action_key, action_type, label, route, icon, sort_order, enabled } ... ]
 *     }
 *
 * POST /api/admin/dashboard/quick-actions
 *   Body: { items: Array<{ action_key, action_type, label, route, icon, sort_order, enabled }> }
 *   行为：原子替换当前用户的全部勾选项；快照存储 label/route/icon
 *         任意一项 enabled=true 时正常；enabled=false 时保留记录但展示置灰
 *
 * 关联：
 *   - system_modules / system_pages（菜单驱动，唯一数据源；无硬编码）
 *   - dashboard_quick_actions（用户偏好持久化）
 *   - users（user.id 取数基础）
 */

interface Candidate {
  action_key: string;
  action_type: 'module' | 'page';
  label: string;
  route: string;
  icon: string;
  module_key?: string;
  module_label?: string;
}

interface Selected {
  action_key: string;
  action_type: 'module' | 'page';
  label: string;
  route: string;
  icon: string;
  sort_order: number;
  enabled: boolean;
}

/**
 * 排除"模块级 + 同模块顶层 page_key" 的重复入口
 * - module 入口：跳到模块第一个可见子页（无子页则跳 route_path）
 * - page 入口：直跳页面
 * 同一用户同时勾选模块和模块下页时，仍允许两个都保存（前端可排序）
 */
function dedupeCandidates(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of items) {
    const key = `${c.action_type}::${c.action_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * 提取"动态参数路由"（如 /admin/products/:id）：不可作为快捷入口
 */
function hasDynamicParam(route: string | null | undefined): boolean {
  if (!route) return false;
  return /\/:\w+/.test(route);
}

export const GET = withAdmin(async (_req, user) => {
  try {
    const db = getSupabaseServiceClient();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: '用户未识别' }, { status: 401 });
    }

    // 1) 拉取启用的 modules（排除 feature config->>type=feature 的功能模块，
    //    与 /api/admin/config/query/menu 同源；保证用户看到的选项就是侧边栏已有的）
    const { data: modules, error: modErr } = await db
      .from('system_modules')
      .select('id, module_key, name_zh, icon, route_path, sort_order, is_enabled, is_visible_in_menu, parent_module_id, config, group_label')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });
    if (modErr) {
      console.error('[dashboard/quick-actions] modules 查询失败:', modErr);
      return NextResponse.json({ success: false, error: '查询模块失败' }, { status: 500 });
    }

    // 2) 拉取启用的 pages（含 module_id，便于分类展示）
    const { data: pages, error: pageErr } = await db
      .from('system_pages')
      .select('id, page_key, name_zh, route_path, is_enabled, module_id, sort_order')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });
    if (pageErr) {
      console.error('[dashboard/quick-actions] pages 查询失败:', pageErr);
      return NextResponse.json({ success: false, error: '查询页面失败' }, { status: 500 });
    }

    // 3) 模块一级入口：仅顶级模块（parent_module_id 为空）可作为模块级快捷入口
    //    含动态参数 route 的模块同样跳过；dashboard 自身不作为快捷入口（避免跳回自己）
    //    若模块 route 指向 /admin（无独立页面，只有子页面），则跳转到其第一个可见子页面
    const moduleIdByKey = new Map<string, any>();
    for (const m of modules || []) moduleIdByKey.set(m.module_key, m);

    // 子页面 first-route 映射（同一模块下按 sort_order 取第一个可直链子页面）
    const firstChildRouteByModule = new Map<string, string>();
    for (const p of pages || []) {
      if (!p.module_id || hasDynamicParam(p.route_path)) continue;
      if (!firstChildRouteByModule.has(p.module_id)) {
        firstChildRouteByModule.set(p.module_id, p.route_path || '/admin');
      }
    }

    const moduleCandidates: Candidate[] = (modules || [])
      .filter((m: any) => !m.parent_module_id && m.module_key !== 'dashboard' && !hasDynamicParam(m.route_path))
      .map((m: any): Candidate => {
        let route = m.route_path || '/admin';
        // 无独立路由的模块 → 跳到第一个可直链子页面
        if (!route || route === '/admin') {
          route = firstChildRouteByModule.get(m.id) || '/admin';
        }
        return {
          action_type: 'module',
          action_key: m.module_key,
          label: m.name_zh,
          route,
          icon: m.icon || 'LayoutGrid',
          module_key: m.module_key,
          module_label: m.group_label || '其他',
        };
      })
      .filter((c: Candidate) => c.route !== '/admin'); // 仍然指向仪表盘自身的跳过

    // 4) 页面级入口：过滤动态参数路由、仪表盘自身（/admin）与 /admin 开头动态页
    const moduleNameById = new Map<string, string>();
    for (const m of modules || []) moduleNameById.set(m.id, m.name_zh);

    const moduleKeyById = new Map<string, string>();
    for (const m of modules || []) moduleKeyById.set(m.id, m.module_key);

    const pageCandidates: Candidate[] = (pages || [])
      .filter((p: any) => (p.route_path || '').trim() !== '/admin' && !hasDynamicParam(p.route_path))
      .map((p: any): Candidate => ({
        action_type: 'page',
        action_key: p.page_key,
        label: p.name_zh,
        route: p.route_path || '/admin',
        icon: guessPageIcon(p.page_key, p.route_path),
        module_key: moduleKeyById.get(p.module_id),
        module_label: '子页面', // 标记二级入口，便于用户辨认
      }));

    const candidates = dedupeCandidates([...moduleCandidates, ...pageCandidates]);

    // 5) 用户已勾选
    const { data: selected, error: selErr } = await db
      .from('dashboard_quick_actions')
      .select('action_type, action_key, action_label, action_route, action_icon, sort_order, enabled')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (selErr) {
      console.error('[dashboard/quick-actions] selected 查询失败:', selErr);
      return NextResponse.json({ success: false, error: '查询用户偏好失败' }, { status: 500 });
    }

    const selectedNormalized: Selected[] = (selected || []).map((row: any) => ({
      action_type: row.action_type as 'module' | 'page',
      action_key: row.action_key,
      label: row.action_label,
      route: row.action_route,
      icon: row.action_icon,
      sort_order: row.sort_order,
      enabled: row.enabled,
    }));

    return NextResponse.json({ success: true, data: { candidates, selected: selectedNormalized } });
  } catch (error: any) {
    console.error('[dashboard/quick-actions] GET 异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user) => {
  try {
    const db = getSupabaseServiceClient();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: '用户未识别' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.items)) {
      return NextResponse.json({ success: false, error: '请求格式错误，需要 items 数组' }, { status: 400 });
    }

    // 单次上限保护：仪表盘快操作合理不会超过 24
    const MAX = 24;
    const items = body.items.slice(0, MAX);
    if (body.items.length > MAX) {
      return NextResponse.json({ success: false, error: `最多 ${MAX} 个快捷入口` }, { status: 400 });
    }

    // 校验 schema
    for (const it of items) {
      if (!it || typeof it.action_key !== 'string' || typeof it.action_type !== 'string') {
        return NextResponse.json({ success: false, error: 'items 内含无效项' }, { status: 400 });
      }
      if (!['module', 'page'].includes(it.action_type)) {
        return NextResponse.json({ success: false, error: 'action_type 必须为 module 或 page' }, { status: 400 });
      }
    }

    // 原子替换：先删后插（用户级别，互不影响）
    const { error: delErr } = await db
      .from('dashboard_quick_actions')
      .delete()
      .eq('user_id', userId);
    if (delErr) {
      console.error('[dashboard/quick-actions] delete 失败:', delErr);
      return NextResponse.json({ success: false, error: '保存失败（清理旧数据）' }, { status: 500 });
    }

    if (items.length > 0) {
      const rows = items.map((it: any, idx: number) => ({
        user_id: userId,
        action_type: it.action_type,
        action_key: it.action_key,
        action_label: String(it.label || it.action_key),
        action_route: String(it.route || '/admin'),
        action_icon: String(it.icon || 'Box'),
        sort_order: typeof it.sort_order === 'number' ? it.sort_order : idx,
        enabled: it.enabled !== false,
      }));
      const { error: insErr } = await db
        .from('dashboard_quick_actions')
        .insert(rows);
      if (insErr) {
        console.error('[dashboard/quick-actions] insert 失败:', insErr);
        return NextResponse.json({ success: false, error: '保存失败（写入新数据）' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: { count: items.length },
    });
  } catch (error: any) {
    console.error('[dashboard/quick-actions] POST 异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

/**
 * 根据 page_key / route 推断 lucide 图标
 * 命中常见关键词；未命中时返回 Box 占位
 * 规则纯粹为前端展示服务的派生，不影响数据一致性
 */
function guessPageIcon(pageKey: string, route?: string | null): string {
  const key = `${pageKey || ''} ${route || ''}`.toLowerCase();
  if (/product|产品/.test(key)) return 'Package';
  if (/quote|报价/.test(key)) return 'FileText';
  if (/user|用户|member|会员/.test(key)) return 'Users';
  if (/knowledge|知识|资料|library/.test(key)) return 'BookOpen';
  if (/audit|审核/.test(key)) return 'ShieldCheck';
  if (/role|权限|permission/.test(key)) return 'KeyRound';
  if (/stat|统计|分析/.test(key)) return 'BarChart3';
  if (/upload|上传|file/.test(key)) return 'UploadCloud';
  if (/billing|订单|payment|收款|套餐/.test(key)) return 'Receipt';
  if (/email|mail|消息|message/.test(key)) return 'Mail';
  if (/setting|config|配置/.test(key)) return 'Settings';
  if (/level|等级|point|积分/.test(key)) return 'Award';
  if (/brand|品牌/.test(key)) return 'Tag';
  if (/customer|客户/.test(key)) return 'Briefcase';
  if (/help|帮助|faq/.test(key)) return 'HelpCircle';
  if (/dashboard|仪表盘/.test(key)) return 'LayoutDashboard';
  if (/media|image|图/.test(key)) return 'Image';
  return 'Box';
}
