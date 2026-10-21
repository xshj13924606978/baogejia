/**
 * 会话签发公共逻辑（#20260820-1600 起）
 * 供 /api/auth/register 与 /api/auth/login-with-sms 复用：
 * - 更新 last_login
 * - 记录登录日志（logUserAction）
 * - 每日登录积分奖励（每天一次，幂等）
 * - 读取等级信息
 * - 签发 HMAC session token + httpOnly cookie
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { signSessionTokenForUser } from '@/lib/session-version';
import { getSiteConfigValues } from '@/lib/site-config';
import { logUserAction } from '@/lib/user-log-service';
import { pointsService } from '@/lib/points-service';

/**
 * 为用户建立完整登录会话并返回带 cookie 的响应。
 * @param request 原始请求（用于 IP / UA / 协议检测）
 * @param user 已校验的完整用户对象（含 password_hash 等敏感字段，内部会剔除）
 * @param via 登录方式标识，写入登录日志（如 'sms' / 'register' / 'sms_auto_register'）
 */
export async function establishUserSession(
  request: NextRequest,
  user: any,
  via: string
): Promise<NextResponse> {
  const supabase = getSupabaseServiceClient();

  // 获取客户端 IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = (forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown').replace(/^::ffff:/, '');

  // 读取安全设置配置
  const securityConfig = await getSiteConfigValues(['daily_login_points']);
  const dailyLoginPoints = parseInt(securityConfig.daily_login_points || '10', 10);

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
    console.error('[Auth] 更新登录时间失败:', updateError);
  }

  // 记录登录日志（失败静默，不影响登录流程）
  await logUserAction({
    userId: user.id,
    actionType: 'login',
    actionDetails: { via },
    ipAddress: ip,
    userAgent: request.headers.get('user-agent'),
  });

  // 每日登录积分奖励（每天只奖励一次，幂等）
  try {
    const today = new Date().toISOString().split('T')[0];
    const lastRewardDate = user.metadata?.last_login_reward_date;
    if (lastRewardDate !== today) {
      const loginRewardRef = `daily_login:${user.id}:${today}`;
      await pointsService.addPoints(
        user.id,
        dailyLoginPoints,
        'daily_login',
        '每日登录奖励',
        loginRewardRef
      );
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
    console.error('[Auth] 每日登录积分奖励失败:', pointsError);
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
  const displayNextLevelPoints =
    freshLevelData?.next_level_points ?? levelData?.next_level_points ?? 1000;

  // 返回用户信息（不包含密码和密码哈希）
  const { password: _, password_hash: __, ...userWithoutSensitive } = user;

  // 签发 session token（HMAC签名，防伪造；嵌入会话版本号，支持「全部设备登出」）
  const sessionToken = await signSessionTokenForUser(
    user.id,
    user.email || '',
    user.role || 'user',
    7 * 24 * 3600
  );

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
      level: displayLevel,
      currentPoints: displayCurrentPoints,
      nextLevelPoints: displayNextLevelPoints,
    },
  });

  // 检测实际请求协议（支持反向代理）
  const isSecure =
    request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

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
}
