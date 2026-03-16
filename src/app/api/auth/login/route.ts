import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';

// 登录用户
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    console.log('[Login] 尝试登录:', { username });

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 查询用户（支持用户名或邮箱登录）
    // 先查询所有匹配的用户，然后取第一个
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${username},email.eq.${username}`)
      .eq('status', 'active');

    if (error) {
      console.error('[Login] 查询用户失败:', error?.message);
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    if (!users || users.length === 0) {
      console.error('[Login] 用户不存在');
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    // 取第一个匹配的用户
    const user = users[0];
    if (users.length > 1) {
      console.warn('[Login] 找到多个匹配的用户，使用第一个:', user.username);
    }

    console.log('[Login] 找到用户:', {
      id: user.id,
      username: user.username,
      email: user.email,
      hasPassword: !!user.password,
      hasPasswordHash: !!user.password_hash,
    });

    // 验证密码（兼容明文和bcrypt哈希两种方式）
    let isValid = false;
    
    if (user.password_hash) {
      // 用户已迁移到bcrypt哈希，使用bcrypt比对
      console.log('[Login] 使用bcrypt验证');
      try {
        isValid = await bcrypt.compare(password, user.password_hash);
        console.log('[Login] bcrypt验证结果:', isValid);
      } catch (bcryptError) {
        console.error('[Login] bcrypt比对失败:', bcryptError);
        isValid = false;
      }
    } else if (user.password) {
      // 用户未迁移，使用明文比对（向后兼容）
      console.log('[Login] 使用明文验证');
      isValid = user.password === password;
      console.log('[Login] 明文验证结果:', isValid);
      
      // 如果明文密码匹配，自动迁移到bcrypt哈希
      if (isValid) {
        try {
          const passwordHash = await bcrypt.hash(password, 10);
          await supabase
            .from('users')
            .update({ password_hash: passwordHash })
            .eq('id', user.id);
          console.log('[Login] 密码已自动迁移到bcrypt哈希:', user.username);
        } catch (migrateError) {
          // 迁移失败不影响登录，只记录日志
          console.error('[Login] 密码迁移失败:', migrateError);
        }
      }
    } else {
      console.log('[Login] 用户没有设置密码');
    }
    
    if (!isValid) {
      console.log('[Login] 密码验证失败');
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
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

    console.log(
      '【登录成功】用户ID:',
      user.id,
      '用户名:',
      user.username,
      '邮箱:',
      user.email,
      '角色:',
      user.role,
      '等级:',
      levelData?.level || 1
    );

    return NextResponse.json({
      success: true,
      user: {
        ...userWithoutPassword,
        level: levelData?.level || 1,
        currentPoints: levelData?.current_points || 0,
        nextLevelPoints: levelData?.next_level_points || 1000,
      },
    });
  } catch (error) {
    console.error('[Login] 登录请求失败:', error);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
