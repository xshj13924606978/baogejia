import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/session-token';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

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

    // 从 DB 查询完整用户信息，确保即使 localStorage 数据丢失也能完整恢复
    const db = getSupabaseServiceClient();
    const { data: fullUser } = await db
      .from('users')
      .select('*')
      .eq('id', verified.userId)
      .single();

    const { password: _pwd, password_hash: _pwdHash, ...safeUser } = fullUser || {};

    // 获取用户等级信息
    const { data: levelData } = await db
      .from('user_levels')
      .select('level, current_points, next_level_points')
      .eq('user_id', verified.userId)
      .single();

    return NextResponse.json({
      valid: true,
      user: {
        ...safeUser,
        level: levelData?.level || 1,
        currentPoints: levelData?.current_points || 0,
        nextLevelPoints: levelData?.next_level_points || 1000,
      },
    });
  } catch (error) {
    console.error('[VerifySession] 验证失败:', error);
    return NextResponse.json({ valid: false, error: '验证失败' }, { status: 500 });
  }
}
