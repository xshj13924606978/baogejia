export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { validatePhone } from '@/lib/validations/auth';
import { findUserByPhone, verifySmsCode } from '@/lib/sms-verification';
import { registerUserByPhone, handleInviteReward } from '@/lib/phone-register';
import { establishUserSession } from '@/lib/auth-session';
import { getSiteConfigValue } from '@/lib/site-config';

/**
 * 微信/QQ 扫码登录「绑定已有账号或注册新账号」统一入口（#20260828-账号统一）
 *
 * 背景：扫码登录遇到未绑定微信/QQ 时，OAuth 回调不再静默自动建号，而是将身份暂存到
 * oauth_pending_logins 表并跳转 /wechat/link 引导页。本接口完成后续绑定/注册：
 *   - 手机号已注册 → 微信绑定到该账号（同一用户合并）并登录；
 *   - 手机号未注册 → 经 registerUserByPhone 注册新账号（含注册积分）并绑定微信后登录。
 *
 * GET  /api/auth/oauth-link?t=<token>           查询待绑定身份信息（昵称/头像，供页面展示）
 * POST /api/auth/oauth-link                     绑定或注册并登录
 *   body: { token, phone, sms_code, password?, invite_code? }
 */

/** 待绑定登录凭据有效期（与回调写入保持一致） */
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;

async function getPendingRecord(db: any, token: string): Promise<any | null> {
  if (!token || typeof token !== 'string') return null;
  const { data } = await db
    .from('oauth_pending_logins')
    .select('*')
    .eq('token', token)
    .is('consumed_at', null)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

/** 查询待绑定身份信息（仅返回展示字段，不透出 access_token） */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t') || '';
    const db = getSupabaseServiceClient();
    const pending = await getPendingRecord(db, token);
    if (!pending) {
      return NextResponse.json(
        { valid: false, error: '登录凭据已失效或已使用，请重新扫码登录' },
        { status: 400 }
      );
    }
    return NextResponse.json({
      valid: true,
      provider: pending.provider,
      name: pending.name || '',
      avatar: pending.avatar || '',
    });
  } catch (error) {
    console.error('[OAuth Link] 查询待绑定身份失败:', error);
    return NextResponse.json({ valid: false, error: '服务器错误' }, { status: 500 });
  }
}

/** 绑定已有账号或注册新账号，并将微信/QQ 绑定到该账号后登录 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, phone, sms_code, password, invite_code } = body;

    if (!token || !phone || !sms_code) {
      return NextResponse.json({ error: '参数不完整，请重试' }, { status: 400 });
    }
    if (!validatePhone(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 1. 校验待绑定凭据（单次有效，10 分钟过期）
    const pending = await getPendingRecord(db, token);
    if (!pending) {
      return NextResponse.json(
        { error: '登录凭据已失效或已使用，请重新扫码登录' },
        { status: 400 }
      );
    }

    // 2. 校验短信验证码（一次性消费；绑定/注册统一用 general purpose）
    const codeCheck = await verifySmsCode(phone, sms_code, 'general');
    if (!codeCheck.ok) {
      return NextResponse.json({ error: codeCheck.error || '短信验证码校验失败' }, { status: 400 });
    }

    // 3. 若该 openid 已被绑定（如扫码后另一处先完成了绑定），直接以绑定账号登录
    const { data: existingBind } = await db
      .from('user_oauth_bindings')
      .select('user_id')
      .eq('provider', pending.provider)
      .eq('provider_id', pending.provider_id)
      .maybeSingle();

    if (existingBind) {
      const { data: boundUser } = await db
        .from('users')
        .select('*')
        .eq('id', existingBind.user_id)
        .eq('status', 'active')
        .single();
      if (!boundUser) {
        return NextResponse.json({ error: '绑定账号不存在或已被禁用' }, { status: 400 });
      }
      // 消费凭据后直接登录已绑定账号
      await db
        .from('oauth_pending_logins')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', pending.id);

      const response = await establishUserSession(request, boundUser, 'wechat_link_bound');
      const bodyData = await response.json();
      const finalResponse = NextResponse.json({ ...bodyData, isNewUser: false });
      response.cookies.getAll().forEach((cookie) => {
        finalResponse.cookies.set(cookie.name, cookie.value, {
          path: cookie.path,
          maxAge: cookie.maxAge,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        });
      });
      return finalResponse;
    }

    // 4. 按手机号查找已有账号：存在则绑定到该账号，不存在则注册新账号（含注册积分）
    let targetUserId: string;
    let isNewUser = false;

    const existingUser = await findUserByPhone(phone);
    if (existingUser) {
      targetUserId = existingUser.id;
    } else {
      // #20260828-2156：未注册账号首次绑定微信时，必须设置登录密码（避免「只能扫码/只能验证码」的死循环）。
      // site_config 表的 password_min_length 是全局统一阈值，保持与其他注册/改密接口一致。
      const minLengthCfg = await getSiteConfigValue('password_min_length', '6');
      const minLength = Math.max(1, Number.parseInt(minLengthCfg || '6', 10) || 6);
      const pwdInput = typeof password === 'string' ? password.trim() : '';
      if (!pwdInput) {
        return NextResponse.json(
          {
            error: '首次绑定微信需要设置登录密码（必填），后续可用手机号+密码登录',
            code: 'PASSWORD_REQUIRED_FOR_REGISTER',
            minLength,
          },
          { status: 400 }
        );
      }
      if (pwdInput.length < minLength) {
        return NextResponse.json(
          {
            error: `登录密码长度不能少于 ${minLength} 位`,
            code: 'PASSWORD_TOO_SHORT',
            minLength,
          },
          { status: 400 }
        );
      }
      const { user: createdUser, error: createError } = await registerUserByPhone(phone, {
        password: pwdInput,
      });
      if (!createdUser) {
        return NextResponse.json(
          { error: createError || '注册失败，请稍后重试' },
          { status: 500 }
        );
      }
      targetUserId = createdUser.id;
      isNewUser = true;

      // 新注册用户：若携带邀请码则建立邀请关系并发放奖励（失败不影响登录）
      if (invite_code && typeof invite_code === 'string') {
        try {
          await handleInviteReward(db, createdUser.id, invite_code.trim());
        } catch (inviteError) {
          console.error('[OAuth Link] 邀请奖励处理失败:', inviteError);
        }
      }
    }

    // 5. 写入 OAuth 绑定（provider,provider_id 幂等）+ 回写微信字段
    const { error: bindError } = await db
      .from('user_oauth_bindings')
      .upsert(
        {
          user_id: targetUserId,
          provider: pending.provider,
          provider_id: pending.provider_id,
          access_token: pending.access_token || null,
          nickname: pending.name || null,
          avatar: pending.avatar || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider,provider_id' }
      );
    if (bindError) {
      console.error('[OAuth Link] 写入绑定失败:', bindError);
      return NextResponse.json({ error: '绑定失败，请稍后重试' }, { status: 500 });
    }

    if (pending.provider === 'wechat') {
      await db
        .from('users')
        .update({
          wechat_openid: pending.provider_id,
          wechat_nickname: pending.name || null,
          wechat_avatar: pending.avatar || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetUserId);
    }

    // 6. 消费待绑定凭据（单次有效）
    await db
      .from('oauth_pending_logins')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', pending.id);

    // 7. 读取完整用户并签发会话
    const { data: fullUser } = await db
      .from('users')
      .select('*')
      .eq('id', targetUserId)
      .single();
    if (!fullUser) {
      return NextResponse.json({ error: '用户信息加载失败' }, { status: 500 });
    }

    const response = await establishUserSession(
      request,
      fullUser,
      isNewUser ? 'wechat_link_register' : 'wechat_link_bind'
    );
    const bodyData = await response.json();
    const finalResponse = NextResponse.json({ ...bodyData, isNewUser });
    response.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
        maxAge: cookie.maxAge,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      });
    });
    return finalResponse;
  } catch (error) {
    console.error('[OAuth Link] 绑定/注册登录失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
