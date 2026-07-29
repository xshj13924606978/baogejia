import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, AuthDatabaseError } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (e) {
      if (e instanceof AuthDatabaseError) {
        return NextResponse.json({ error: '服务暂不可用，请稍后重试' }, { status: 503 });
      }
      throw e;
    }

    if (!user) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    // 查询完整用户信息
    const db = getSupabaseServiceClient();
    const { data: fullUser, error: queryError } = await db
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (queryError || !fullUser) {
      console.error('[Auth API] 查询用户失败:', queryError);
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 过滤敏感字段（password, password_hash）
    const { password: _pwd, password_hash: _pwdHash, ...safeUser } = fullUser;

    // 获取用户等级信息
    const { data: levelData } = await db
      .from('user_levels')
      .select('level, current_points, next_level_points')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      ...safeUser,
      level: levelData?.level || 1,
      currentPoints: levelData?.current_points || 0,
      nextLevelPoints: levelData?.next_level_points || 1000,
    });
  } catch (error) {
    console.error('[Auth API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
