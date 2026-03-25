'use client';

import React, { useState, useEffect } from 'react';
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
  Menu,
  X,
  Home,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Building2,
  Star,
  Coins,
  Briefcase,
  Crown,
  ClipboardList,
  BookOpen,
  SlidersHorizontal,
  Trophy,
  FolderOpen,
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

interface NavChild {
  title: string;
  href: string;
}

interface NavItem {
  title: string;
  href?: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  children?: NavChild[];
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  defaultOpen: boolean;
  items: NavItem[];
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, logout } = useUser();

  // 检查用户权限
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else {
        const adminRoles = ['admin', 'super_admin', 'Admin', 'Super_Admin', 'ADMIN', 'SUPER_ADMIN', '管理员', '超级管理员', '系统管理员'];
        const userRole = user.role || (process.env.NODE_ENV === 'development' ? 'admin' : '');
        const isAdmin = adminRoles.includes(userRole);
        if (!isAdmin) {
          toast({
            title: '权限不足',
            description: `您当前角色为 ${userRole || '普通用户'}，没有访问管理后台的权限`,
            variant: 'destructive',
          });
          router.push('/');
        }
      }
    }
  }, [user, loading, router, toast]);

  const [pendingAuditCount, setPendingAuditCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch('/api/admin/knowledge?status=pending&limit=1');
        const data = await res.json();
        if (data.success) setPendingAuditCount(data.total || 0);
      } catch { /* 静默失败 */ }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, []);

  // 4 个分组，一级模块含二级子页面
  const navGroups: NavGroup[] = [
    {
      key: 'core',
      label: '核心业务',
      icon: <Briefcase className="h-4 w-4" />,
      defaultOpen: true,
      items: [
        { title: '仪表盘', href: '/admin', icon: <LayoutDashboard className="h-5 w-5" /> },
        { title: '用户管理', href: '/admin/users', icon: <Users className="h-5 w-5" /> },
        { title: '企业用户管理', href: '/admin/enterprise', icon: <Building2 className="h-5 w-5" /> },
        {
          title: '内容审核',
          icon: <CheckCircle className="h-5 w-5" />,
          badge: pendingAuditCount > 0 ? String(pendingAuditCount) : undefined,
          badgeColor: 'bg-yellow-500',
          children: [
            { title: '待审核列表', href: '/admin/audit' },
            { title: '审核历史', href: '/admin/audit/history' },
          ],
        },
        {
          title: '产品管理',
          icon: <Database className="h-5 w-5" />,
          children: [
            { title: '产品列表', href: '/admin/products' },
            { title: '产品导入', href: '/admin/products/import' },
            { title: '判重配置', href: '/admin/products/duplicate-config' },
          ],
        },
        {
          title: '报价管理',
          icon: <FileText className="h-5 w-5" />,
          children: [
            { title: '报价单列表', href: '/admin/quotes' },
            { title: '报价条款管理', href: '/admin/quotes/terms' },
          ],
        },
      ],
    },
    {
      key: 'operations',
      label: '运营管理',
      icon: <Trophy className="h-4 w-4" />,
      defaultOpen: true,
      items: [
        {
          title: '会员管理',
          icon: <Star className="h-5 w-5" />,
          children: [
            { title: '等级配置', href: '/admin/membership' },
            { title: '字段权限', href: '/admin/membership/fields' },
            { title: '等级分布', href: '/admin/membership/stats' },
          ],
        },
        {
          title: '积分管理',
          icon: <Coins className="h-5 w-5" />,
          children: [
            { title: '等级权限配置', href: '/admin/points/levels' },
            { title: '积分兑换配置', href: '/admin/points/rules' },
            { title: '积分流水', href: '/admin/points/history' },
            { title: '积分规则管理', href: '/admin/points-rules' },
          ],
        },
        {
          title: '数据统计',
          icon: <BarChart3 className="h-5 w-5" />,
          children: [
            { title: '统计概览', href: '/admin/stats' },
            { title: '收入统计', href: '/admin/stats/revenue' },
          ],
        },
        { title: '导入日志', href: '/admin/import-logs', icon: <ClipboardList className="h-5 w-5" /> },
      ],
    },
    {
      key: 'content',
      label: '内容管理',
      icon: <FolderOpen className="h-4 w-4" />,
      defaultOpen: true,
      items: [
        {
          title: '资料中心',
          icon: <BookOpen className="h-5 w-5" />,
          children: [
            { title: '产品价格库', href: '/admin/knowledge-center/price-library' },
            { title: '技术文档库', href: '/admin/knowledge-center/document-library' },
            { title: '案例库', href: '/admin/knowledge-center/case-library' },
            { title: '标准规范库', href: '/admin/knowledge-center/standard-library' },
            { title: '图纸图片库', href: '/admin/knowledge-center/drawing-library' },
            { title: '定额库', href: '/admin/knowledge-center/quota-library' },
            { title: '全局搜索', href: '/admin/knowledge-center/global-search' },
          ],
        },
      ],
    },
    {
      key: 'system',
      label: '系统管理',
      icon: <Settings className="h-4 w-4" />,
      defaultOpen: true,
      items: [
        {
          title: '系统设置',
          icon: <Settings className="h-5 w-5" />,
          children: [
            { title: '基本设置', href: '/admin/settings' },
            { title: '安全设置', href: '/admin/settings/security' },
            { title: '动态配置', href: '/admin/system-config' },
          ],
        },
      ],
    },
  ];

  // 递归查找当前页面标题
  const findTitle = (items: NavItem[]): string | undefined => {
    for (const item of items) {
      if (item.href === pathname) return item.title;
      if (item.children) {
        const child = item.children.find(c => c.href === pathname);
        if (child) return child.title;
      }
    }
    return undefined;
  };
  const allNavItems = navGroups.flatMap(g => g.items);
  const currentPageTitle = findTitle(allNavItems) || '管理后台';

  // 分组折叠状态
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    navGroups.forEach(g => { init[g.key] = false; });
    return init;
  });
  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* 移动端菜单按钮 */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button variant="outline" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* 侧边栏 */}
      <div
        className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 ease-in-out flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-64'}
        lg:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        {/* 侧边栏头部 */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
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
            {navGroups.map((group, groupIndex) => (
              <div
                key={group.key}
                className={groupIndex > 0 ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/60' : ''}
              >
                <Collapsible
                  open={!collapsedGroups[group.key]}
                  onOpenChange={() => toggleGroup(group.key)}
                >
                  {/* 分组标题 */}
                  <div className="flex items-center gap-2 px-3 pb-2">
                    <span className="text-gray-400 dark:text-gray-500">{group.icon}</span>
                    <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      {group.label}
                    </span>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5">
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition-transform duration-200 text-gray-400 ${
                            !collapsedGroups[group.key] ? 'rotate-90' : ''
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>

                  {/* 菜单项 */}
                  <CollapsibleContent>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        // 有子页面：一级可折叠
                        if (item.children && item.children.length > 0) {
                          const hasActive = item.children.some(c => c.href === pathname);
                          return (
                            <Collapsible key={item.title} defaultOpen={hasActive}>
                              <CollapsibleTrigger asChild>
                                <button className={
                                  `w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${
                                    hasActive
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`
                                }>
                                  {item.icon}
                                  <span className="flex-1 text-sm font-semibold">{item.title}</span>
                                  {item.badge && (
                                    <Badge className={`${item.badgeColor} text-white text-[10px] px-1.5 py-0 mr-1`}>{item.badge}</Badge>
                                  )}
                                  <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${hasActive ? 'rotate-90 text-blue-500' : 'text-gray-400'}`} />
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-0.5 mt-0.5 mb-1">
                                  {item.children.map((child) => {
                                    const active = child.href === pathname;
                                    return (
                                      <Link
                                        key={child.href}
                                        href={child.href}
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
                                        <span className="text-xs">{child.title}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        }

                        // 无子页面：直接链接
                        const active = item.href === pathname;
                        return (
                          <Link
                            key={item.href}
                            href={item.href!}
                            className={`
                              flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                              ${active
                                ? 'bg-blue-50/80 text-blue-600 font-semibold dark:bg-blue-950/60 dark:text-blue-400'
                                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                              }
                            `}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            {item.icon}
                            <span className="flex-1 text-sm font-medium">{item.title}</span>
                          </Link>
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
        h-screen
        lg:ml-64
        ${sidebarOpen ? 'ml-64' : 'ml-0'}
      `}
      >
        {/* 顶部栏 */}
        <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0">
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
        <div className="overflow-y-auto h-[calc(100vh-4rem)] p-6 scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
