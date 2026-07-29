import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';
import { signSessionToken } from '@/lib/session-token';

// 登录用户
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // 查询用户（支持用户名、邮箱、手机号登录）
    // 尝试匹配 username / email / metadata.phone 字段
    let users: any[] | null = null;
    let queryError: any = null;

    // 第一轮查询：匹配 username 和 email
    const { data: usersByName, error: err1 } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${username},email.eq.${username}`)
      .eq('status', 'active');

    if (!err1 && usersByName && usersByName.length > 0) {
      users = usersByName;
    } else {
      // 第二轮查询：在 metadata JSONB 中查找 phone
      const { data: usersByMeta, error: err2 } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'active')
        .filter('metadata->>phone', 'eq', username);

      if (!err2 && usersByMeta && usersByMeta.length > 0) {
        users = usersByMeta;
      } else {
        queryError = err1 || err2;
      }
    }

    if (queryError) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    if (!users || users.length === 0) {
      // 用户在 Supabase 中不存在，返回 200 + 特定标识让前端降级处理到 localStorage
      return NextResponse.json({
        success: false,
        error: '用户名或密码错误',
        code: 'USER_NOT_FOUND',
      });
    }

    // 取第一个匹配的用户
    const user = users[0];
    if (users.length > 1) {
      console.warn('[Login] 找到多个匹配的用户，使用第一个:', user.username);
    }

    // 验证密码
    let isValid = false;
    
    if (user.password_hash) {
      // 优先使用 bcrypt 哈希验证
      try {
        isValid = await bcrypt.compare(password, user.password_hash);
      } catch (bcryptError) {
        console.error('[Login] bcrypt比对失败:', bcryptError);
        isValid = false;
      }
    } else if (user.password) {
      // 向后兼容：仅有明文密码的老用户，验证成功后立即迁移到 bcrypt
      isValid = user.password === password;
      
      if (isValid) {
        try {
          const passwordHash = await bcrypt.hash(password, 10);
          await supabase
            .from('users')
            .update({ password_hash: passwordHash, password: null })
            .eq('id', user.id);
        } catch (migrateError) {
          console.error('[Login] 密码迁移失败:', migrateError);
        }
      }
    }
    
    if (!isValid) {
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

    // 签发 session token（HMAC签名，防伪造）
    const sessionToken = signSessionToken(user.id, user.email || '', user.role || 'user', 7 * 24 * 3600);

    return NextResponse.json({
      success: true,
      sessionToken,
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
