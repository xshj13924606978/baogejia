import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasPermission, type UserRole } from './lib/auth/roles';

// 公开路由（无需登录即可访问）
const publicPaths = [
  '/login',
  '/register',
  '/',
  '/403',
  '/realtime-demo',
  '/font-styles',
];

// 需要特定角色才能访问的路由
const protectedRoutes: Array<{
  path: string;
  roles?: UserRole[];
  permission?: string; // 使用 roles.ts 中定义的权限 ID
}> = [
  // 管理后台 - 需要管理员角色
  { path: '/admin', roles: ['super_admin', 'admin'] },
  // 企业用户页面
  { path: '/enterprise', roles: ['enterprise_admin'] },
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过静态资源、API 路由和 Next.js 内部路由
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 公开路由直接放行
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // 开发环境：跳过 proxy 检查，方便开发调试
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // 获取用户信息（从 cookie）
  const token = request.cookies.get('sb-access-token')?.value;
  const userStr = request.cookies.get('user')?.value;

  if (!token && !userStr) {
    // 未登录，重定向到登录页
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 已登录但需要解析用户角色
  try {
    if (userStr) {
      const user = JSON.parse(userStr);
      const userRole = user.role as UserRole;

      // 检查需要特定角色的路由
      for (const route of protectedRoutes) {
        if (pathname.startsWith(route.path)) {
          if (route.roles && !route.roles.includes(userRole)) {
            return NextResponse.redirect(new URL('/403', request.url));
          }
          if (route.permission && !hasPermission(userRole, route.permission)) {
            return NextResponse.redirect(new URL('/403', request.url));
          }
          break;
        }
      }
    }
  } catch (error) {
    console.error('[Proxy] 处理失败:', error);
    // 解析失败，重定向到登录页
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 匹配所有路由，除了:
    // - api (API routes)
    // - _next/static (静态文件)
    // - _next/image (图片优化)
    // - favicon.ico (网站图标)
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
