'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Settings,
  BarChart3,
  FileText,
  Database,
  Bell,
  LogOut,
  Home,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Building2,
  Star,
  Coins,
  Briefcase,
  ClipboardList,
  BookOpen,
  SlidersHorizontal,
  Trophy,
  FolderOpen,
  TrendingUp,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// 注意：管理员角色列表已不再硬编码。改为调用 `/api/admin/my-permissions`
// 端点实时从数据库 roles 表读取。管理员/超管状态由后端统一判定。

// ====== 图标映射 ======
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Building2, CheckCircle, Database, FileText,
  Star, Coins, BarChart3, TrendingUp, FolderOpen, BookOpen, Settings,
  SlidersHorizontal, ClipboardList, Trophy, Briefcase,
};

const getIcon = (name: string, size = 'h-5 w-5'): React.ReactNode => {
  const Icon = ICON_MAP[name] || CircleDot;
  return <Icon className={size} />;
};

// ====== 分组配置（默认图标映射，新增分组时在此注册） ======
const GROUP_ICON_MAP: Record<string, LucideIcon> = {
  '核心业务': Briefcase,
  '运营管理': Trophy,
  '内容管理': FolderOpen,
  '系统管理': Settings,
};

const getGroupIcon = (label: string): LucideIcon => GROUP_ICON_MAP[label] || CircleDot;

interface MenuItem {
  id: string;
  module_key: string;
  name_zh: string;
  icon: string;
  route_path: string | null;
  sort_order: number;
  is_visible_in_menu: boolean;
  group_label: string;
  menu_pages: { page_key: string; name_zh: string; route_path: string }[];
  children?: any[];
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, logout } = useUser();
  const [isAdminState, setIsAdminState] = useState<boolean>(false);
  const [isSuperAdminState, setIsSuperAdminState] = useState<boolean>(false);
  const adminCheckDoneRef = useRef(false);

  // ====== 权限检查：从数据库读取 ======
  // 通过 /api/admin/my-permissions 接口拿到 user 是否为 admin/super_admin
  // 完全数据库驱动，无硬编码角色数组。roles 表修改后无需重新发布代码即可生效
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // 已在 DB 端鉴权后，用接口确认 admin/super_admin 状态
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/my-permissions', { credentials: 'include' });
        if (!res.ok) {
          if (adminCheckDoneRef.current && !cancelled) {
            toast({
              title: '权限不足',
              description: `您当前角色为 ${user.role || '普通用户'}，没有访问管理后台的权限`,
              variant: 'destructive',
            });
            router.push('/');
          }
          return;
        }
        const data = await res.json();
        const isAdmin = !!data?.data?.is_admin;
        const isSuperAdminInner = !!data?.data?.is_super_admin;
        if (cancelled) return;
        setIsAdminState(isAdmin);
        setIsSuperAdminState(isSuperAdminInner);
        adminCheckDoneRef.current = true;
        if (!isAdmin) {
          toast({
            title: '权限不足',
            description: `您当前角色为 ${user.role || '普通用户'}，没有访问管理后台的权限`,
            variant: 'destructive',
          });
          router.push('/');
        }
      } catch (e) {
        console.warn('[admin layout] 权限检查失败，使用兜底（token.role）:', e);
        if (!cancelled) {
          // 网络/服务故障时的兜底：用 token 中 user.role 简单判断；
          // 任何问题以业务后端 /api/admin/* 的 403 兜底（最终一致性靠后端）
          setIsAdminState(Boolean(user.role));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, toast]);

  // 已通过 useEffect 判定权限；isAdminState 与 isSuperAdminState 已成为唯一来源
  const isSuperAdmin = isSuperAdminState;

  // ====== 菜单数据 ======
  const [menuModules, setMenuModules] = useState<MenuItem[]>([]);

  useEffect(() => {
    async function fetchMenu() {
      try {
        const res = await fetch('/api/admin/config/query/menu');
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setMenuModules(data.data);
        }
      } catch { /* 静默失败，使用空菜单 */ }
    }
    fetchMenu();
  }, []);

  // 转换 API 数据为菜单项
  const menuItems = useMemo(() => {
    return menuModules.map(m => {
      // 过滤掉含动态参数的详情页（:id, :type 等）
      const menuPages = (m.children || [])
        .filter((p: any) => !(p.route_path as string).includes(':'))
        .map((p: any) => ({ page_key: p.page_key, name_zh: p.name_zh, route_path: p.route_path }));

      return {
        id: m.id,
        module_key: m.module_key,
        name_zh: m.name_zh,
        icon: m.icon,
        route_path: m.route_path,
        sort_order: m.sort_order,
        is_visible_in_menu: m.is_visible_in_menu,
        group_label: m.group_label || '其他',
        menu_pages: menuPages,
        children: (m as any).children || [],
      };
    });
  }, [menuModules]);

  // 按 group_label 动态分组（从菜单数据中提取分组，无需硬编码分组列表）
  const navGroups = useMemo(() => {
    const groupOrder = ['核心业务', '运营管理', '内容管理', '系统管理'];
    const grouped = new Map<string, MenuItem[]>();

    // 按 group_label 收集模块
    for (const item of menuItems) {
      const label = item.group_label || '其他';
      const list = grouped.get(label) || [];
      list.push(item);
      grouped.set(label, list);
    }

    // 按预定义顺序排列已知分组，其余按出现顺序追加
    const groups: { label: string; icon: LucideIcon; items: MenuItem[] }[] = [];
    const added = new Set<string>();

    for (const label of groupOrder) {
      if (grouped.has(label)) {
        groups.push({ label, icon: getGroupIcon(label), items: grouped.get(label)! });
        added.add(label);
      }
    }
    for (const [label, items] of grouped) {
      if (!added.has(label)) {
        groups.push({ label, icon: getGroupIcon(label), items });
      }
    }

    return groups;
  }, [menuItems]);

  // ====== 审核未读计数 ======
  const [pendingAuditCount, setPendingAuditCount] = useState<number>(0);
  const [pendingContributorCount, setPendingContributorCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [knowledgeRes, contributorRes] = await Promise.all([
          fetch('/api/admin/knowledge?status=pending&limit=1'),
          fetch('/api/admin/contributor/pending-count'),
        ]);
        const [knowledgeData, contributorData] = await Promise.all([
          knowledgeRes.json(),
          contributorRes.json(),
        ]);
        if (knowledgeData.success) setPendingAuditCount(knowledgeData.total || 0);
        if (contributorData.success) {
          // 资料贡献管理包含「资料审核 + 产品修改请求」两类待审核
          setPendingContributorCount(
            (contributorData.uploadPending || 0) + (contributorData.requestPending || 0)
          );
        }
      } catch { /* 静默失败 */ }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, []);

  // ====== 当前页面标题 ======
  const currentPageTitle = useMemo(() => {
    for (const m of menuItems) {
      // 检查模块 route_path
      if (m.route_path && pathname === m.route_path) return m.name_zh;
      // 检查子页面（包括详情页）
      for (const c of m.children || []) {
        // 精确匹配
        if (c.route_path === pathname) return c.name_zh;
        // 前缀匹配详情页 (如 /admin/users/123 匹配 /admin/users/:id)
        const cleanPath = c.route_path.replace(/\/:[^/]+/g, '');
        if (cleanPath && pathname.startsWith(cleanPath)) return c.name_zh;
      }
    }
    return '管理后台';
  }, [menuItems, pathname]);

  // ====== 分组折叠 ======
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ====== 判断模块是否为直接链接 ======
  const isDirectLink = (item: MenuItem) => {
    if (item.menu_pages.length === 0) return false;
    // 只有一个页面且 route_path 与模块路径相同（如仪表盘）
    const singlePage = item.menu_pages.length === 1;
    const matchesModuleRoute = item.route_path && item.menu_pages[0].route_path === item.route_path;
    return singlePage && matchesModuleRoute;
  };

  const handleBackToApp = () => router.push('/');
  const handleLogout = () => logout();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) return null;

  // 过滤可见模块（非超管隐藏 is_visible_in_menu=false 的模块）
  const visibleGroups = isSuperAdmin
    ? navGroups
    : navGroups.map(g => ({ ...g, items: g.items.filter(i => i.is_visible_in_menu !== false) }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* 移动端左侧边缘触控热区：触边展开抽屉菜单 */}
      <div
        className="lg:hidden fixed inset-y-0 left-0 z-40 w-3"
        onClick={() => setMobileMenuOpen(true)}
        onTouchStart={() => setMobileMenuOpen(true)}
        aria-label="展开管理菜单"
        role="button"
      >
        <div className="h-full w-full bg-gradient-to-r from-gray-200/40 to-transparent dark:from-gray-700/40" />
      </div>

      {/* 移动端遮罩：点击收回抽屉 */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/30"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 侧边栏 */}
      <div
        className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-200 ease-in-out flex flex-col
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        ${sidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-64'}
      `}
      >
        {/* 侧边栏头部 */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">报</span>
            </div>
            <span className="font-semibold text-lg">管理后台</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex"
          >
            <ChevronLeft className={`h-5 w-5 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
          </Button>
        </div>

        {/* 返回主应用 */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleBackToApp}
          >
            <Home className="h-4 w-4" />
            返回主应用
          </Button>
        </div>

        {/* 导航菜单 */}
        <ScrollArea className="flex-1 overflow-y-auto px-3 scrollbar-thin">
          <div className="py-3">
            {visibleGroups.map((group, groupIndex) => (
              <div
                key={group.label}
                className={groupIndex > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/60' : ''}
              >
                <Collapsible
                  open={!collapsedGroups[group.label]}
                  onOpenChange={() => toggleGroup(group.label)}
                >
                  {/* 分组标题 */}
                  <div className="flex items-center gap-2 px-3 pb-2">
                    <span className="text-gray-400 dark:text-gray-500">
                      <group.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-[13px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      {group.label}
                    </span>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5">
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition-transform duration-200 text-gray-400 ${
                            !collapsedGroups[group.label] ? 'rotate-90' : ''
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>

                  {/* 菜单项 */}
                  <CollapsibleContent>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        // 直接链接（如仪表盘）
                        if (isDirectLink(item)) {
                          const href = item.menu_pages[0]?.route_path || item.route_path || '#';
                          const active = pathname === href;
                          const badge =
                            item.module_key === 'contributor' && pendingContributorCount > 0
                              ? String(pendingContributorCount)
                              : (item.module_key === 'audit' || item.module_key === 'knowledge-center') &&
                                  pendingAuditCount > 0
                                ? String(pendingAuditCount)
                                : undefined;
                          return (
                            <Link
                              key={item.id}
                              href={href}
                              className={`
                                flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                                ${active
                                  ? 'bg-blue-50/80 text-blue-600 font-semibold dark:bg-blue-950/60 dark:text-blue-400'
                                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                }
                              `}
                              onClick={() => setMobileMenuOpen(false)}
                            >
                              {getIcon(item.icon)}
                              <span className="flex-1 text-[12px] font-medium">{item.name_zh}</span>
                              {badge && (
                                <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0 mr-1">{badge}</Badge>
                              )}
                            </Link>
                          );
                        }

                        // 有多个子页面：可折叠菜单
                        const hasActive = item.menu_pages.some(p => pathname === p.route_path);
                        const badge = (item.module_key === 'audit' || item.module_key === 'knowledge-center') && pendingAuditCount > 0
                          ? String(pendingAuditCount)
                          : item.module_key === 'contributor' && pendingContributorCount > 0
                            ? String(pendingContributorCount)
                            : undefined;

                        return (
                          <Collapsible key={item.id} defaultOpen={hasActive}>
                            <CollapsibleTrigger asChild>
                              <button className={
                                `w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${
                                  hasActive
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`
                              }>
                                {getIcon(item.icon)}
                                <span className="flex-1 text-[12px] font-medium">{item.name_zh}</span>
                                {badge && (
                                  <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0 mr-1">{badge}</Badge>
                                )}
                                <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${hasActive ? 'rotate-90 text-blue-500' : 'text-gray-400'}`} />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-6 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-0.5 mt-0.5 mb-1">
                                {item.menu_pages.map((page) => {
                                  const active = pathname === page.route_path;
                                  return (
                                    <Link
                                      key={page.page_key}
                                      href={page.route_path}
                                      className={
                                        `flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors ${
                                          active
                                            ? 'bg-blue-50 text-blue-600 font-medium dark:bg-blue-950/60 dark:text-blue-400'
                                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                                        }`
                                      }
                                      onClick={() => setMobileMenuOpen(false)}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                      <span className="text-[11px]">{page.name_zh}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* 底部用户信息 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3">
                <Avatar className="h-8 w-8">
                  {user?.avatar ? <AvatarImage src={user.avatar} /> : null}
                  <AvatarFallback>{user?.name?.[0] || '管'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{user?.name || '管理员'}</p>
                  <p className="text-xs text-gray-500">{user?.email || user?.phone || ''}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>我的账户</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 主内容区 */}
      <div
        className={`
        transition-all duration-200
        h-screen supports-[height:100dvh]:h-dvh
        ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}
      `}
      >
        {/* 顶部栏 */}
        <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
          <h2 className="text-lg font-semibold">{currentPageTitle}</h2>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <Avatar className="h-8 w-8">
              {user?.avatar ? <AvatarImage src={user.avatar} /> : null}
              <AvatarFallback>{user?.name?.[0] || '管'}</AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="overflow-y-auto h-[calc(100vh-4rem)] supports-[height:100dvh]:h-[calc(100dvh-4rem)] p-3 sm:p-6 scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
