import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 登录用户
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 查询用户（支持用户名或邮箱登录）
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${username},email.eq.${username}`)
      .eq('status', 'active')
      .single();

    if (error || !user) {
      console.error('[Login] 查询用户失败:', error);
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // 验证密码（直接比对明文，因为现有用户使用明文）
    if (user.password !== password) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // 获取用户等级信息
    const { data: levelData } = await supabase
      .from('user_levels')
      .select('level, current_points, next_level_points')
      .eq('user_id', user.id)
      .single();

    // 更新最后登录时间
    const { error: updateError } = await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Login] 更新登录时间失败:', updateError);
    }

    // 返回用户信息（不包含密码）
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      success: true,
      user: {
        ...userWithoutPassword,
        level: levelData?.level || 1,
        currentPoints: levelData?.current_points || 0,
        nextLevelPoints: levelData?.next_level_points || 1000
      }
    });
  } catch (error) {
    console.error('[Login] 登录请求失败:', error);
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}
