import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js 全局中间件 - 路由保护
 *
 * 公开路由（无需登录）：
 * - /login, /register, /forgot-password
 * - /api/auth/*（登录/注册/验证码等认证接口）
 * - /api/public/*（公开 API）
 * - /_next/*, /static/*, /favicon.ico 等静态资源
 * - /payment/result（支付回调）
 * - /robots.txt
 *
 * 需要登录的路由：
 * - /（首页）
 * - /customers, /suppliers, /enterprise
 * - /team, /team/[id]
 * - 除 /api/auth/* 和 /api/public/* 之外的所有 /api/*
 * - /admin/*（额外需要管理员权限）
 */

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/api/auth',        // 所有认证相关 API（login/register/send-sms-code/verify-sms-code/oauth-url/callback 等）
  '/api/public',
  '/api/migrate',     // 数据库迁移端点（一次性）
  '/api/points',      // 积分查询（无需登录，GET 有 user_id 参数）
  '/_next',
  '/static',
  '/favicon.ico',
  '/manifest.json',
  '/payment/result',
  '/robots.txt',
  '/font-styles',
];

const ADMIN_PATHS = ['/admin'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix + '?'));
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路由直接放行
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 检查认证状态（通过 cookie 中的 session token）
  const sessionToken = request.cookies.get('session_token')?.value;

  if (!sessionToken) {
    // 没有 session token，重定向到登录页
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 管理员路由额外校验（在 API 层还有 requireAdmin 做二次校验）
  if (isAdminPath(pathname)) {
    // 简单的 cookie 级别角色校验（API 层会有更严格的 HMAC 验证）
    const userRole = request.cookies.get('user_role')?.value;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.redirect(new URL('/login?error=permission', request.url));
    }
  }

  // 设置 x-user-token header 传递给 API 路由
  const response = NextResponse.next();
  response.headers.set('x-user-token', sessionToken);

  return response;
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static（静态文件）
     * - _next/image（图片优化）
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
