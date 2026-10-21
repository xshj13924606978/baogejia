import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { revokeAllUserSessions } from '@/lib/session-version';
import { logUserAction, extractClientIp } from '@/lib/user-log-service';

/**
 * 全部设备登出（#[20260829-1700]）
 *
 * 真实生效机制：递增 users.session_version，使所有已签发 session token 失效。
 * - 已登录设备下一次 verify-session / getCurrentUser 时因版本号落后被判定未认证 → 强制重新登录；
 * - 当前设备由前端清除本地状态并清 cookie。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.errorResponse) return auth.errorResponse;

    const ok = await revokeAllUserSessions(auth.user.id);
    if (!ok) {
      return NextResponse.json({ error: '操作失败，请稍后重试' }, { status: 500 });
    }

    // 记录操作日志
    await logUserAction({
      userId: auth.user.id,
      actionType: 'logout_all',
      actionDetails: { source: 'profile-settings' },
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    // 清除本机 httpOnly cookie，配合前端清除本地状态
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
    console.error('[LogoutAll] 全部设备登出失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
