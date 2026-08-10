import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/session-token';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // 优先使用请求体中的 token，否则回退到 httpOnly cookie
    // 这样即使前端 localStorage 中的 session_token 丢失，也能通过 cookie 恢复登录状态
    const token = body.token || request.cookies.get('session_token')?.value;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: '缺少 token' }, { status: 400 });
    }

    const verified = verifySessionToken(token);

    if (!verified) {
      return NextResponse.json({ valid: false, error: 'token 无效或已过期' }, { status: 401 });
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: verified.userId,
        email: verified.email,
        role: verified.role,
      },
    });
  } catch (error) {
    console.error('[VerifySession] 验证失败:', error);
    return NextResponse.json({ valid: false, error: '验证失败' }, { status: 500 });
  }
}
