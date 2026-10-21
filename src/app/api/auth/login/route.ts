export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';
import { signSessionTokenForUser } from '@/lib/session-version';
import { checkLoginRateLimit, clearLoginFailures } from '@/lib/rate-limit';
import { getSiteConfigValues } from '@/lib/site-config';
import { logUserAction, deriveSessionId } from '@/lib/user-log-service';
import { logSystemError, captureException } from '@/lib/error-log-service';
import { pointsService } from '@/lib/points-service';

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
      'daily_login_points',
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
        // #[20260822-2028] 第三轮查询：按 full_name 精确匹配，支持中文姓名登录
        // 重名（>1）时返回 NAME_NOT_UNIQUE，避免登录到错误账号
        const { data: usersByFullName, error: err3 } = await supabase
          .from('users')
          .select('*')
          .eq('status', 'active')
          .eq('full_name', trimmedUsername);

        if (!err3 && usersByFullName && usersByFullName.length === 1) {
          users = usersByFullName;
        } else if (usersByFullName && usersByFullName.length > 1) {
          // 多个同名用户：拒绝登录，要求用户改用用户名/邮箱/手机号
          return NextResponse.json({
            success: false,
            error: '存在多个相同姓名的用户，请使用用户名、邮箱或手机号登录',
            code: 'NAME_NOT_UNIQUE',
          }, { status: 200 });
        } else {
          queryError = err1 || err1b || err2 || err3;
        }
      }
    }

    if (queryError) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    if (!users || users.length === 0) {
      // #[20260831-1700] P1-2：用户不存在时无法写入 user_logs（user_id 非空），
      // 落入 system_error_logs 留痕，供安全审计与暴力破解分析
      await logSystemError({
        message: `登录失败：用户不存在（username=${trimmedUsername}）`,
        source: 'auth.login',
        requestMethod: 'POST',
        requestPath: '/api/auth/login',
        level: 'warn',
        ipAddress: ip,
        userAgent: request.headers.get('user-agent'),
        metadata: { username: trimmedUsername, reason: 'USER_NOT_FOUND' },
      });
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

    // 验证密码：#[20260831-1700] P0-2 移除明文兜底
    // 仅使用 password_hash；明文 password 列已废弃并移除（生产 users 表无该列），
    // 任何情况下都不允许以明文比对绕过 bcrypt。
    let isValid = false;

    if (user.password_hash) {
      try {
        isValid = await bcrypt.compare(password, user.password_hash);
      } catch (bcryptError) {
        console.error('[Login] bcrypt比对失败:', bcryptError);
        isValid = false;
      }
    }

    if (!isValid) {
      // #[20260831-1700] P1-2：登录失败写入 user_logs（用户存在但密码错误）
      await logUserAction({
        userId: user.id,
        actionType: 'login_failed',
        actionDetails: { username: trimmedUsername, reason: 'password_mismatch' },
        ipAddress: ip,
        userAgent: request.headers.get('user-agent'),
      });
      console.warn('[Login] 密码验证失败:', { userId: user.id, username: user.username });
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

    // 登录成功日志将在 session token 签发后写入，以同时携带 session_id（P1-10）

    // 每日登录积分奖励（每天只奖励一次，积分值从系统设置动态读取）
    try {
      const dailyLoginPoints = parseInt(securityConfig.daily_login_points || '10', 10);
      const today = new Date().toISOString().split('T')[0];
      const lastRewardDate = user.metadata?.last_login_reward_date;
      if (lastRewardDate !== today) {
        const loginRewardRef = `daily_login:${user.id}:${today}`;
        await pointsService.addPoints(user.id, dailyLoginPoints, 'daily_login', '每日登录奖励', loginRewardRef);
        // 用奖励后的最新 metadata 合并，避免覆盖 RPC 刚写回的 points/total_points
        const { data: freshUserAfterReward } = await supabase
          .from('users')
          .select('metadata')
          .eq('id', user.id)
          .single();
        const freshMetadata = freshUserAfterReward?.metadata || {};
        await supabase
          .from('users')
          .update({
            metadata: {
              ...freshMetadata,
              last_login_reward_date: today,
            },
          })
          .eq('id', user.id);
      }
    } catch (pointsError) {
      console.error('[Login] 每日登录积分奖励失败:', pointsError);
    }

    // 重新读取等级信息（每日登录奖励可能已更新积分与等级）
    let freshLevelData: { level: number; current_points: number; next_level_points: number } | null = null;
    const { data: freshLevel } = await supabase
      .from('user_levels')
      .select('level, current_points, next_level_points')
      .eq('user_id', user.id)
      .maybeSingle();
    if (freshLevel) freshLevelData = freshLevel;

    const displayLevel = freshLevelData?.level ?? levelData?.level ?? 1;
    const displayCurrentPoints =
      freshLevelData?.current_points ??
      levelData?.current_points ??
      Math.max(typeof user.points === 'number' ? user.points : 0, user.metadata?.points || 0);
    const displayNextLevelPoints = freshLevelData?.next_level_points ?? levelData?.next_level_points ?? 1000;

    // 返回用户信息（不包含密码和密码哈希）
    const { password: _, password_hash: __, ...userWithoutSensitive } = user;

    // 签发 session token（HMAC签名，防伪造；嵌入会话版本号，支持「全部设备登出」）
    const sessionToken = await signSessionTokenForUser(user.id, user.email || '', user.role || 'user', 7 * 24 * 3600);

    // #[20260831-1700] P1-10：登录成功日志携带 session_id，串联同一会话后续操作
    await logUserAction({
      userId: user.id,
      actionType: 'login',
      actionDetails: { username: trimmedUsername, via: 'password' },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      sessionId: deriveSessionId(sessionToken),
    });

    const response = NextResponse.json({
      success: true,
      sessionToken,
      user: {
        ...userWithoutSensitive,
        // 手机号兼容：注册/绑定时可能只存于 metadata.phone，统一映射到顶层 phone；
        // 历史用户手机号可能只作为 username，兜底识别 11 位手机号格式
        phone:
          user.phone ||
          user.metadata?.phone ||
          (/^1\d{10}$/.test(user.username || '') ? user.username : ''),
        name: user.metadata?.name || user.full_name || '',
        avatar: user.metadata?.avatar || user.avatar_url || '',
        company: user.metadata?.company || '',
        address: user.metadata?.address || '',
        // 微信绑定映射：与 verify-session 保持一致，登录后立即恢复 user.wechat
        // #20260821-2130：不映射则登录后解绑流程不可达
        wechat: user.wechat_openid
          ? {
              openId: user.wechat_openid,
              nickname: user.wechat_nickname || undefined,
              avatar: user.wechat_avatar || undefined,
              boundAt: user.updated_at || new Date().toISOString(),
            }
          : undefined,
        level: displayLevel,
        currentPoints: displayCurrentPoints,
        nextLevelPoints: displayNextLevelPoints,
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
    captureException(error, {
      source: 'api.auth.login',
      message: '登录请求未处理异常',
      requestMethod: 'POST',
      requestPath: '/api/auth/login',
      statusCode: 500,
    });
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
