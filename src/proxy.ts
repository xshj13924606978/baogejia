import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js 全局代理（原 middleware，Next.js 16 起改名为 proxy）- 路由保护
 *
 * 公开路由（无需登录）:
 * - /login, /register, /forgot-password
 * - /api/auth/* (登录/注册/验证码等认证接口)
 * - /api/public/* (公开 API)
 * - /contributor/* (资料贡献公开上传与接口)
 * - /_next/*, /static/*, /favicon.ico 等静态资源
 * - /payment/result (支付回调)
 * - /robots.txt
 *
 * 需要登录的路由:
 * - / (首页)
 * - /customers, /suppliers, /enterprise
 * - /team, /team/[id]
 * - 除 /api/auth/* 和 /api/public/* 之外的所有 /api/*
 * - /admin/* (仅需登录；管理员角色由数据库驱动 API 判定，见下方说明)
 */

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/4dyrkuPhUp.txt',    // ⚠️ 注意大小写：4dyrkuPhUp.txt
  '/api/auth',
  '/api/public',
  '/api/migrate',
  '/api/points',
  '/api/recharge',
  // #[20260901-1140] 支付平台异步回调必须公开：由微信/支付宝服务器调用，不带登录态，
  // 安全性由回调验签（APIv3 密钥 AEAD 解密 + 平台公钥 RSA 验签）保证。
  // 此前未放行导致回调被 307 到 /login，微信不跟随重定向 → 支付成功但积分/订单/流水全部未入账。
  // 注意：只放行 notify 子路径，/api/payment（创建支付）与 unifiedorder 仍需登录态（handler 内 requireAuth）。
  '/api/payment/wechat/notify',
  '/api/payment/alipay/notify',
  '/contributor',
  '/api/contributor',
  '/wechat/bind-result', // #20260827-0826-6 微信绑定结果中间页：由 OAuth callback 302 过来，必须在未登录态也能访问
  '/wechat/link',        // #20260828-账号统一 扫码登录绑定/注册引导页：OAuth callback 302 过来，未登录态访问
  '/_next',
  '/static',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/payment/result',
  '/robots.txt',
  '/font-styles',
  '/quotes/share',
  '/api/quotes/share',
  '/api/help', // #202608311300 权限体系帮助文档数据源（公开只读，与 /api/public 同类）
  '/api/health', // #[20260901-1100] P0-5：健康检查端点必须公开，否则外部探活被 307 到 /login
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => 
    pathname === prefix || 
    pathname.startsWith(prefix + '/') || 
    pathname.startsWith(prefix + '?')
  );
}

// #[20260901-1100] P1-8：API 请求耗时慢请求阈值（毫秒），超过则输出警告日志
const SLOW_API_THRESHOLD_MS = Number(process.env.SLOW_API_THRESHOLD_MS) || 3000;

export async function proxy(request: NextRequest) {
  // #[20260901-1100] P1-9：顶层 try-catch，代理层任何异常都不应直接 500 暴露内部细节
  const startTime = Date.now();
  try {
    const response = await proxyHandler(request);
    // #[20260901-1100] P1-8：API 请求计时（仅记录慢请求，避免日志洪泛）
    if (request.nextUrl.pathname.startsWith('/api/')) {
      const duration = Date.now() - startTime;
      if (duration >= SLOW_API_THRESHOLD_MS) {
        console.warn(`[SlowAPI] ${request.method} ${request.nextUrl.pathname} ${duration}ms`);
      }
      response.headers.set('x-response-time', `${duration}ms`);
    }
    return response;
  } catch (error) {
    console.error('[Proxy] 代理层异常:', error);
    const { pathname } = request.nextUrl;
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: '服务器内部错误' },
        { status: 500 }
      );
    }
    return NextResponse.next();
  }
}

async function proxyHandler(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 🚀 微信校验文件直接放行（放在最前面，无条件）
  if (pathname === '/4dyrkuPhUp.txt') {
    console.log('[Proxy] 校验文件直接放行');
    return NextResponse.next();
  }

  // OPTIONS 预检请求：API 路由返回 CORS 头，其他路径直接放行
  if (request.method === 'OPTIONS') {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-token, x-user-role',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    return NextResponse.next();
  }

  // 公开路由直接放行
  if (isPublicPath(pathname)) {
    const sessionToken =
      request.cookies.get('session_token')?.value || request.headers.get('x-user-token') || undefined;
    if (sessionToken) {
      const response = NextResponse.next();
      response.headers.set('x-user-token', sessionToken);
      return response;
    }
    return NextResponse.next();
  }

  // 检查认证状态：优先 httpOnly cookie，其次 x-user-token header（前端从 localStorage 读取）
  // 避免用户 localStorage 有 token 但 cookie 缺失时，API 请求被 307 重定向到 /login，
  // 导致下载拿到登录页 HTML（#20260822-2242 系列）
  const sessionToken =
    request.cookies.get('session_token')?.value || request.headers.get('x-user-token') || undefined;

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url);
    // #[20260902-0900] 回跳时保留查询串：
    // 邀请链接形如 /team/join?token=xxx，此前只回传 pathname 导致 token 丢失、
    // 受邀人登录后回到 /team/join 却无法完成加入。
    // 安全性不变：登录页只接受以单个 "/" 开头的站内相对路径（拒绝 // 与绝对地址），
    // 因此拼接查询串不会引入开放重定向。
    loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search || ''}`);
    return NextResponse.redirect(loginUrl);
  }

  // 管理员路由不再在代理层做角色校验（#20260825-1000）：
  //  - proxy 运行在 Edge，无法访问数据库 roles 表，任何硬编码角色数组都违反"0 硬编码"约定
  //  - admin 判定完全由数据库驱动：前端 layout 调 /api/admin/my-permissions（roles 表 is_admin=true），
  //    后端各 /api/admin/* handler 走 withPermissionCheck/requireAdmin（roles 表 + fallback）
  //  - user_role cookie 可伪造，本就不是安全边界；真正的权限边界在 API handler（HMAC 签名 token + 数据库校验）

  const response = NextResponse.next();
  response.headers.set('x-user-token', sessionToken);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
