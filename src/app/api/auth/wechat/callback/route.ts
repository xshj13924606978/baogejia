// 微信登录回调 API 路由（#20260820-1600 重构）
// 委托标准 OAuth 流程 /api/auth/callback/wechat 处理（token 交换 + 绑定/登录 + 会话签发）

import { NextRequest, NextResponse } from 'next/server';

/**
 * 解析重定向基准地址（#20260821-1600 修复）：
 * 优先级 NEXT_PUBLIC_BASE_URL > X-Forwarded-Proto + Host > request.url
 * 修复——nginx 反代下 callback 重定向到 https://0.0.0.0:5000/...（ERR_ADDRESS_INVALID）
 * 因由原写法 process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin 在反代 + 0.0.0.0 监听下无法获得公网 origin
 */
function resolveBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('host');
  if (proto && host) return `${proto}://${host}`;
  const u = new URL(request.url);
  return `${u.protocol.slice(0, -1)}://${host || u.host}`;
}

/**
 * GET /api/auth/wechat/callback?code=xxx&state=xxx
 * 微信授权页回调到此路由，转发给 /api/auth/callback/wechat 统一处理
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state') || '';

    const baseUrl = resolveBaseUrl(request);

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=no_code', baseUrl));
    }

    const callbackUrl = new URL('/api/auth/callback/wechat', baseUrl);
    callbackUrl.searchParams.set('code', code);
    if (state) callbackUrl.searchParams.set('state', state);

    return NextResponse.redirect(callbackUrl.toString());
  } catch (error) {
    console.error('[Wechat OAuth Callback] 转发回调失败:', error);
    const baseUrl = resolveBaseUrl(request);
    return NextResponse.redirect(new URL('/login?error=server_error', baseUrl));
  }
}
