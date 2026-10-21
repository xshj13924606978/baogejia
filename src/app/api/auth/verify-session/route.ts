import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/session-token';
import { isSessionRevoked, SessionStateUnavailableError } from '@/lib/session-version';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // 优先使用请求体中的 token，否则回退到 httpOnly cookie
    // 这样即使前端 localStorage 中的 session_token 丢失，也能通过 cookie 恢复登录状态
    const token = body.token || request.cookies.get('session_token')?.value;

    // 无 session（无 body token 且无 httpOnly cookie）属未登录常态，
    // 返回 401（此前 400 会在登录页刷新时于控制台产生红色报错）。
    // 前端 UserContext 以 res.ok 判断：401 与 400 走同一分支（未登录），行为不变。
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: '未登录或缺少 token' }, { status: 401 });
    }

    const verified = verifySessionToken(token);

    if (!verified) {
      return NextResponse.json({ valid: false, error: 'token 无效或已过期' }, { status: 401 });
    }

    // 「全部设备登出」撤销检查（#[20260829-1700]）：
    // token 携带的会话版本号 < users.session_version 当前值 → 会话已被撤销，强制重新登录
    if (await isSessionRevoked(verified.userId, verified.sessionVersion)) {
      return NextResponse.json(
        { valid: false, error: '账号已在其他设备被登出，请重新登录' },
        { status: 401 }
      );
    }

    // 从 DB 查询完整用户信息，确保即使 localStorage 数据丢失也能完整恢复
    const db = getSupabaseServiceClient();
    const { data: fullUser } = await db
      .from('users')
      .select('*')
      .eq('id', verified.userId)
      .single();

    // #20260828-账号统一：用户已被删除/禁用时，即使 httpOnly cookie 未过期也不得恢复登录态。
    // 修复「管理员删除账号后，用户不清缓存仍能登录到原账号」的幽灵会话问题
    // （此前 fullUser 为 null 时仍返回 valid:true 并输出空 user）。
    if (!fullUser || fullUser.deleted_at || (fullUser.status && fullUser.status !== 'active')) {
      return NextResponse.json(
        { valid: false, error: '账号不存在或已被禁用，请重新登录' },
        { status: 401 }
      );
    }

    const { password: _pwd, password_hash: _pwdHash, ...safeUser } = fullUser;
    const hasPassword = !!fullUser?.password_hash;

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
        // 手机号兼容：注册/绑定时可能只存于 metadata.phone，统一映射到顶层 phone；
        // 历史用户手机号可能只作为 username，兜底识别 11 位手机号格式
        phone:
          safeUser.phone ||
          safeUser.metadata?.phone ||
          (/^1\d{10}$/.test(safeUser.username || '') ? safeUser.username : ''),
        name: safeUser.metadata?.name || safeUser.full_name || '',
        avatar: safeUser.metadata?.avatar || safeUser.avatar_url || '',
        company: safeUser.metadata?.company || '',
        address: safeUser.metadata?.address || '',
        // 微信绑定映射：DB 原始列 wechat_openid/nickname/avatar → 前端 user.wechat 对象
        // #20260821-2130：此前不映射导致 user.wechat 恒为 undefined，解绑流程不可达、绑定状态无法展示
        wechat: safeUser.wechat_openid
          ? {
              openId: safeUser.wechat_openid,
              nickname: safeUser.wechat_nickname || undefined,
              avatar: safeUser.wechat_avatar || undefined,
              boundAt: safeUser.updated_at || new Date().toISOString(),
            }
          : undefined,
        level: levelData?.level || 1,
        currentPoints: levelData?.current_points || 0,
        nextLevelPoints: levelData?.next_level_points || 1000,
        hasPassword,
      },
    });
  } catch (error) {
    if (error instanceof SessionStateUnavailableError) {
      return NextResponse.json({ valid: false, error: '服务暂不可用，请稍后重试' }, { status: 503 });
    }
    console.error('[VerifySession] 验证失败:', error);
    return NextResponse.json({ valid: false, error: '验证失败' }, { status: 500 });
  }
}
