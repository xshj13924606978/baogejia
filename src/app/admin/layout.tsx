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
  CheckCircle,
  Building2,
  Star,
  Coins,
  Shield,
  ScrollText,
  History,
  BookOpen,
  Puzzle,
  ClipboardList,
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

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, logout } = useUser();

  // 检查用户权限：必须已登录且为管理员
  useEffect(() => {
    console.log('[AdminLayout] useEffect执行，loading:', loading, 'user:', user);
    if (!loading) {
      if (!user) {
        console.log('[AdminLayout] 未登录，跳转到登录页');
        router.push('/login');
      } else {
        // 检查是否具有管理员权限
        // 支持中文和英文角色名
        const adminRoles = ['admin', 'super_admin', 'Admin', 'Super_Admin', 'ADMIN', 'SUPER_ADMIN', '管理员', '超级管理员', '系统管理员'];
        // 开发环境下，如果角色未定义，默认为管理员以方便测试
        const userRole = user.role || (process.env.NODE_ENV === 'development' ? 'admin' : '');
        const isAdmin = adminRoles.includes(userRole);

        if (!isAdmin) {
          console.log('[AdminLayout] 非管理员用户，拒绝访问，当前角色:', userRole);
          toast({
            title: '权限不足',
            description: `您当前角色为 ${userRole || '普通用户'}，没有访问管理后台的权限`,
            variant: 'destructive',
          });
          router.push('/');
        } else {
          console.log('[AdminLayout] 管理员用户验证通过，角色:', userRole);
        }
      }
    }
  }, [user, loading, router, toast]);

  const [pendingAuditCount, setPendingAuditCount] = useState<number>(0);

  // 加载待审核数量
  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch('/api/admin/knowledge?status=pending&limit=1');
        const data = await res.json();
        if (data.success) setPendingAuditCount(data.total || 0);
      } catch { /* 静默失败 */ }
    }
    fetchCounts();
    // 每60秒刷新
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, []);

  // 导航菜单项
  const navItems: NavItem[] = [
    {
      title: '仪表盘',
      href: '/admin',
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      title: '用户管理',
      href: '/admin/users',
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: '企业用户管理',
      href: '/admin/enterprise',
      icon: <Building2 className="h-5 w-5" />,
    },
    {
      title: '内容审核',
      href: '/admin/audit',
      icon: <CheckCircle className="h-5 w-5" />,
      badge: pendingAuditCount > 0 ? String(pendingAuditCount) : undefined,
      badgeColor: 'bg-yellow-500',
    },
    {
      title: '产品管理',
      href: '/admin/products',
      icon: <Database className="h-5 w-5" />,
    },
    {
      title: '报价单管理',
      href: '/admin/quotes',
      icon: <FileText className="h-5 w-5" />,
    },
    {
      title: '会员管理',
      href: '/admin/membership',
      icon: <Star className="h-5 w-5" />,
      badge: 'VIP',
      badgeColor: 'bg-yellow-500',
    },
    {
      title: '等级权限配置',
      href: '/admin/points/levels',
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: '积分规则配置',
      href: '/admin/points/rules',
      icon: <Coins className="h-5 w-5" />,
    },
    {
      title: '积分流水',
      href: '/admin/points/history',
      icon: <History className="h-5 w-5" />,
    },
    {
      title: '积分规则管理',
      href: '/admin/points-rules',
      icon: <ScrollText className="h-5 w-5" />,
    },
    {
      title: '数据统计',
      href: '/admin/stats',
      icon: <BarChart3 className="h-5 w-5" />,
    },
    {
      title: '知识库管理',
      href: '/admin/knowledge',
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      title: '模块管理',
      href: '/admin/modules',
      icon: <Puzzle className="h-5 w-5" />,
    },
    {
      title: '导入日志',
      href: '/admin/import-logs',
      icon: <ClipboardList className="h-5 w-5" />,
    },
    {
      title: '系统设置',
      href: '/admin/settings',
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  // 调试：开发环境输出菜单项
  if (process.env.NODE_ENV === 'development') {
    console.log('[AdminLayout] 导航菜单项:', navItems.map(item => item.title));
    console.log('[AdminLayout] 用户角色:', user?.role);
  }

  // 返回主应用
  const handleBackToApp = () => {
    router.push('/');
  };

  // 处理登出
  const handleLogout = () => {
    logout();
  };

  // 获取当前页面标题
  const currentPageTitle = navItems.find((item) => item.href === pathname)?.title || '管理后台';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
        fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 ease-in-out
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
            <ChevronLeft
              className={`h-5 w-5 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
            />
          </Button>
        </div>

        {/* 返回主应用按钮 */}
        <div className="p-4">
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
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 py-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                    hover:bg-gray-100 dark:hover:bg-gray-800
                    ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }
                  `}
                >
                  {item.icon}
                  <span className="flex-1 text-sm">{item.title}</span>
                  {item.badge && (
                    <Badge className={`${item.badgeColor} text-white text-xs`}>{item.badge}</Badge>
                  )}
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        {/* 底部用户信息 - 只保留头像和退出登录 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
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
              {/* 已删除个人资料和修改密码选项 */}
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
