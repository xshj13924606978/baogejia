import { NextRequest, NextResponse } from 'next/server';

/**
 * 登出接口：清除 httpOnly 会话 cookie。
 *
 * 为什么必须走服务端？
 * session_token 是 httpOnly cookie，浏览器端的 document.cookie 无法读取也无法删除它，
 * 若只清 localStorage，刷新后 loadUser 会从残留 cookie 自动恢复登录。
 * 这里用与登录时完全一致的属性（secure/sameSite/path）回写 Max-Age=0 实现真正清除。
 */
export async function POST(request: NextRequest) {
  try {
    // 检测实际请求协议（与 login 路由保持一致，保证删除 cookie 属性匹配）
    const isSecure =
      request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

    const response = NextResponse.json({ success: true });

    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set('user_role', '', {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('[Logout] 登出失败:', error);
    return NextResponse.json({ success: false, error: '登出失败' }, { status: 500 });
  }
}
