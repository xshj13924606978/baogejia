import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/session-token';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

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
