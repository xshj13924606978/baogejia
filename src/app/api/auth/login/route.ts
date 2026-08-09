export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';
import { signSessionToken } from '@/lib/session-token';
import { checkLoginRateLimit, clearLoginFailures } from '@/lib/rate-limit';
import { getSiteConfigValues } from '@/lib/site-config';

// 登录用户
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    // 清理输入：去除前后空格
    const trimmedUsername = username.trim();

    // 获取 IP 进行限流
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = (forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown').replace(/^::ffff:/, '');

    // 读取安全设置配置
    const securityConfig = await getSiteConfigValues([
      'login_max_attempts',
      'login_lockout_minutes',
    ]);
    const maxAttempts = parseInt(securityConfig.login_max_attempts || '5', 10);
    const lockoutMinutes = parseInt(securityConfig.login_lockout_minutes || '30', 10);

    // 登录失败限流检查（防暴力破解）
    const rateLimit = checkLoginRateLimit(trimmedUsername, ip, maxAttempts, lockoutMinutes);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.error, retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429 }
      );
    }

    const supabase = getSupabaseServiceClient();

    // 查询用户（支持用户名、邮箱、手机号登录）
    // 尝试匹配 username / email / metadata.phone 字段
    let users: any[] | null = null;
    let queryError: any = null;

    // 第一轮查询：匹配 username 和 email（使用独立查询防止过滤器注入）
    const { data: usersByName, error: err1 } = await supabase
      .from('users')
      .select('*')
      .eq('username', trimmedUsername)
      .eq('status', 'active');

    const { data: usersByEmail, error: err1b } = await supabase
      .from('users')
      .select('*')
      .eq('email', trimmedUsername)
      .eq('status', 'active');

    // 合并两个查询结果并去重
    const usersByNameSet = new Set((usersByName || []).map((u: any) => u.id));
    const mergedUsers = [
      ...(usersByName || []),
      ...(usersByEmail || []).filter((u: any) => !usersByNameSet.has(u.id)),
    ];

    if (!err1 && !err1b && mergedUsers.length > 0) {
      users = mergedUsers;
    } else {
      // 第二轮查询：在 metadata JSONB 中查找 phone
      const { data: usersByMeta, error: err2 } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'active')
        .filter('metadata->>phone', 'eq', trimmedUsername);

      if (!err2 && usersByMeta && usersByMeta.length > 0) {
        users = usersByMeta;
      } else {
        queryError = err1 || err1b || err2;
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
    let hashNeedsUpdate = false;
    
    if (user.password_hash) {
      // 优先使用 bcrypt 哈希验证
      try {
        isValid = await bcrypt.compare(password, user.password_hash);
      } catch (bcryptError) {
        console.error('[Login] bcrypt比对失败:', bcryptError);
        isValid = false;
      }
      // bcrypt 失败时尝试明文密码字段（密码修改后 hash 可能未同步）
      if (!isValid && user.password && user.password === password) {
        isValid = true;
        hashNeedsUpdate = true;
      }
    } else if (user.password) {
      // 向后兼容：仅有明文密码的老用户
      isValid = user.password === password;
      hashNeedsUpdate = isValid;
    }
    
    if (isValid && hashNeedsUpdate) {
      // 重新生成 bcrypt hash 并清理明文密码
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
    
    if (!isValid) {
      console.warn('[Login] 密码验证失败:', {
        userId: user.id,
        username: user.username,
        hasHash: !!user.password_hash,
        hasPlain: !!user.password,
        providedPassword: password ? '[provided]' : '[missing]',
      });
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

    // 登录成功，清除失败计数
    clearLoginFailures(trimmedUsername, ip);

    // 返回用户信息（不包含密码和密码哈希）
    const { password: _, password_hash: __, ...userWithoutSensitive } = user;

    // 签发 session token（HMAC签名，防伪造）
    const sessionToken = signSessionToken(user.id, user.email || '', user.role || 'user', 7 * 24 * 3600);

    const response = NextResponse.json({
      success: true,
      sessionToken,
      user: {
        ...userWithoutSensitive,
        level: levelData?.level || 1,
        currentPoints: levelData?.current_points || 0,
        nextLevelPoints: levelData?.next_level_points || 1000,
      },
    });

    // 检测实际请求协议（支持反向代理）
    const isSecure = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

    // 设置 httpOnly cookie（供 middleware 路由保护使用）
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600, // 7天
    });
    response.cookies.set('user_role', user.role || 'user', {
      httpOnly: false, // JS 可读，用于前端判断
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });

    return response;
  } catch (error) {
    console.error('[Login] 登录请求失败:', error);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
