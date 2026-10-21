export const dynamic = "force-dynamic";

import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, getOAuthUserInfo, isOAuthConfigured } from '@/lib/oauth';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { signSessionTokenForUser } from '@/lib/session-version';

// OAuth 待绑定登录凭据有效期（毫秒）：暂存身份后引导用户绑定/注册，超时需重新扫码
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;

/**
 * 解析重定向基准地址（#20260821-1750-1 修复，与 wechat/callback 一致）：
 * 优先级 NEXT_PUBLIC_BASE_URL > X-Forwarded-Proto + Host > request.url
 * 修复——nginx 反代下 request.url 解析为 0.0.0.0:5000 导致回调跳转 ERR_ADDRESS_INVALID，
 * 且 NEXT_PUBLIC_APP_URL 指向 www 子域会导致绑定后跳 www 时 cookie 不共享（闪跳闪退）。
 */
function resolveBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('host');
  if (proto && host) return `${proto}://${host}`;
  const u = new URL(request.url);
  return `${u.protocol.slice(0, -1)}://${host || u.host}`;
}

/**
 * OAuth 回调处理
 * GET /api/auth/callback/[provider]?code=xxx&state=xxx
 *
 * 流程：
 * 1. 验证 state 参数（防 CSRF）
 * 2. 用 code 换取 access_token
 * 3. 获取用户信息
 * 4. 查找或创建用户
 * 5. 签发 session token
 * 6. 重定向回前端页面
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const baseUrl = resolveBaseUrl(request);

  // 用户拒绝授权或出错
  if (error) {
    console.error(`[OAuth Callback] ${provider} 授权错误:`, error, errorDescription);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || '授权失败')}`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_params', baseUrl)
    );
  }

  // 检查 OAuth 是否已配置
  if (!isOAuthConfigured(provider)) {
    return NextResponse.redirect(
      new URL(`/login?error=${provider}_not_configured`, baseUrl)
    );
  }

  try {
    // 换取 access token
    const tokenResult = await exchangeCodeForToken(provider, code);
    if (!tokenResult) {
      return NextResponse.redirect(
        new URL('/login?error=token_exchange_failed', baseUrl)
      );
    }

    // 获取用户信息
    const userInfo = await getOAuthUserInfo(provider, tokenResult.accessToken, tokenResult.rawData);
    if (!userInfo) {
      return NextResponse.redirect(
        new URL('/login?error=user_info_failed', baseUrl)
      );
    }

    const supabase = getSupabaseServiceClient();
    // 重定向基准统一使用反代感知的 baseUrl（避免 www 子域 cookie 不共享导致绑定/登录后闪跳闪退）
    const appUrl = baseUrl;

    // ======== 绑定模式：state = bind:<userId>:<random> ========
    if (state.startsWith('bind:')) {
      const stateParts = state.split(':');
      const bindUserId = stateParts[1]; // 用户 ID 是 UUID 字符串，不是整数

      if (!bindUserId) {
        return NextResponse.redirect(
          new URL('/login?error=invalid_bind_state', baseUrl)
        );
      }

      // 查找目标用户（users 表真实列名是 full_name，非 name）
      const { data: bindUser, error: bindUserError } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('id', bindUserId)
        .eq('status', 'active')
        .single();

      if (bindUserError || !bindUser) {
        console.error('[OAuth Callback] 绑定目标用户不存在:', bindUserId);
        return NextResponse.redirect(
          new URL('/login?error=bind_user_not_found', baseUrl)
        );
      }

      console.log(`[OAuth Callback] 绑定模式: 将 ${provider} 账号绑定到用户 ${bindUserId}`);

      // 检查该 OAuth 账号是否已被其他用户绑定（避免 A 的绑定被 B 抢走）
      // #20260827-0826-2 修复
      const { data: existingBind, error: bindCheckError } = await supabase
        .from('user_oauth_bindings')
        .select('user_id')
        .eq('provider', provider)
        .eq('provider_id', userInfo.providerId)
        .maybeSingle();

      if (bindCheckError) {
        console.error('[OAuth Callback] 查询已有绑定失败:', bindCheckError);
        return NextResponse.redirect(
          new URL(`/wechat/bind-result?failed=1&provider=${provider}`, baseUrl)
        );
      }

      if (existingBind && existingBind.user_id !== bindUserId) {
        return NextResponse.redirect(
          new URL(`/wechat/bind-result?failed=1&error=already_bound&provider=${provider}`, baseUrl)
        );
      }

      // 创建或更新 OAuth 绑定（绑定到目标用户）
      // #20260821-2130：写入结果必须显式检查，失败不得静默吞掉后仍跳「绑定成功」
      const { error: bindWriteError } = await supabase
        .from('user_oauth_bindings')
        .upsert({
          user_id: bindUserId,
          provider,
          provider_id: userInfo.providerId,
          access_token: tokenResult.accessToken,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,provider_id',
        });

      if (bindWriteError) {
        console.error('[OAuth Callback] 绑定写入失败:', bindWriteError);
        // 修复 #20260822-1645：绑写失败时回跳到 bind-result 中间页（由其通知主窗口 + 自动关闭），
        // 不再跳转首页导致"闪跳"
        return NextResponse.redirect(
          new URL(`/wechat/bind-result?failed=1&provider=${provider}`, baseUrl)
        );
      }

      // 更新用户的微信信息字段（字段不存在时静默跳过）
      try {
        await supabase
          .from('users')
          .update({
            wechat_openid: userInfo.providerId,
            wechat_nickname: userInfo.name,
            wechat_avatar: userInfo.avatar,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bindUserId);
      } catch (columnError) {
        console.warn('[OAuth Callback] 微信字段更新失败（可能字段未创建）:', columnError);
      }

      // 绑定成功后重定向到 bind-result 中间页（#20260822-1645）：
      // 该页面通过 window.opener.postMessage 通知主窗口（ProfileDialog），再自动关闭弹窗，
      // 避免绑定完成后"闪跳"到首页打断用户在个人资料中的其他操作。
      // #20260827-1600：携带微信昵称/头像/openid（真实 OAuth 数据），由 bind-result 转发给
      // 主窗口。这样即使主窗口 verify-session 不可用（如 cookie 缺失/过期），也能用真实
      // 绑定数据即时更新绑定状态，杜绝虚假数据。
      const bindResultParams = new URLSearchParams({ success: '1', provider });
      if (userInfo.name) bindResultParams.set('nickname', userInfo.name);
      if (userInfo.avatar) bindResultParams.set('avatar', userInfo.avatar);
      if (userInfo.providerId) bindResultParams.set('openid', userInfo.providerId);
      return NextResponse.redirect(
        new URL(`/wechat/bind-result?${bindResultParams.toString()}`, baseUrl)
      );
    }
    // ======== 登录模式 ========

    // 查找现有绑定
    const { data: existingBinding } = await supabase
      .from('user_oauth_bindings')
      .select('user_id')
      .eq('provider', provider)
      .eq('provider_id', userInfo.providerId)
      .single();

    let user: any;

    if (existingBinding) {
      // 已有绑定，直接获取用户
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', existingBinding.user_id)
        .eq('status', 'active')
        .single();

      if (existingUser) {
        user = existingUser;
      }
    }

    if (!user) {
      // 微信扫码登录：按 users.wechat_openid 匹配已有账号
      // #20260827-0826 修复：已有账号在个人资料里绑定过微信后（users.wechat_openid 已回写），
      // 扫码登录即使 user_oauth_bindings 无记录也能命中原账号并保留其角色；
      // 避免微信无真实邮箱（邮箱匹配必跳过）→ 误建 role='user' 新账号 → 管理后台 403。
      if (provider === 'wechat' && userInfo.providerId) {
        const { data: wechatUser } = await supabase
          .from('users')
          .select('*')
          .eq('wechat_openid', userInfo.providerId)
          .eq('status', 'active')
          .single();

        if (wechatUser) {
          user = wechatUser;
        }
      }

      // 尝试用邮箱匹配
      if (!user && userInfo.email && !userInfo.email.includes('@placeholder.com')) {
        const { data: emailUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', userInfo.email)
          .eq('status', 'active')
          .single();

        if (emailUser) {
          user = emailUser;
        }
      }
    }

    if (!user) {
      // #20260828-账号统一：微信/QQ 未绑定时不再静默自动建号。
      // 根因（问题现象）：公开上传页以手机号自动注册一个账号（role=contributor），
      // 随后微信扫码登录又自动创建第二个账号（role=user），同一用户产生多账号；
      // 且 OAuth 直建账号无注册积分。
      // 新流程：暂存 OAuth 身份（oauth_pending_logins）→ 跳转 /wechat/link 引导页 →
      // 用户输入手机号+短信验证码：
      //   - 手机号已注册 → 微信绑定到该账号（同一用户合并为一个账号）后登录；
      //   - 手机号未注册 → 经 registerUserByPhone 注册新账号（发放注册积分）并绑定微信后登录。
      const pendingToken = randomBytes(24).toString('hex');
      const { error: pendingError } = await supabase
        .from('oauth_pending_logins')
        .insert({
          token: pendingToken,
          provider,
          provider_id: userInfo.providerId,
          access_token: tokenResult.accessToken || null,
          name: userInfo.name || null,
          avatar: userInfo.avatar || null,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + PENDING_LOGIN_TTL_MS).toISOString(),
        });

      if (pendingError) {
        console.error('[OAuth Callback] 写入待绑定登录记录失败:', pendingError);
        return NextResponse.redirect(
          new URL('/login?error=oauth_link_failed', baseUrl)
        );
      }

      return NextResponse.redirect(
        new URL(
          `/wechat/link?t=${pendingToken}&provider=${encodeURIComponent(provider)}`,
          baseUrl
        )
      );
    }

    // 创建或更新 OAuth 绑定
    await supabase
      .from('user_oauth_bindings')
      .upsert({
        user_id: user.id,
        provider,
        provider_id: userInfo.providerId,
        access_token: tokenResult.accessToken,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'provider,provider_id',
      });

    // 更新最后登录时间
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // 签发 session token（HMAC签名，防伪造；嵌入会话版本号，支持「全部设备登出」）
    const sessionToken = await signSessionTokenForUser(
      user.id,
      user.email || '',
      user.role || 'user',
      7 * 24 * 3600
    );

    // 构造响应，设置 cookies 并重定向
    // 登录成功回跳携带轻量标记 oauth=login（#20260822-1302）：
    // 用户若此前主动登出，localStorage 残留 logged_out_flag 会阻断前端 restoreFromCookie，
    // 导致扫码登录成功（cookie 已签发）后前端仍显示未登录（登录循环）。
    // 前端 UserContext 检测到该标记即清除登出标记。仅小体积字符串，不违反 header 体积约束。
    const response = NextResponse.redirect(new URL('/?oauth=login', appUrl));

    // 检测实际请求协议
    const isSecure = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    response.cookies.set('user_role', user.role || 'user', {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });

    // 登录成功：用户信息由 httpOnly cookie + verify-session 自动恢复，
    // 无需也绝不能把 user（含 base64 头像，可达 MB 级）塞进 Location header——
    // nginx proxy_buffer_size 超限会直接 502（#20260821-2200 根因）。
    return response;
  } catch (err: any) {
    console.error(`[OAuth Callback] ${provider} 处理失败:`, err);
    return NextResponse.redirect(
      new URL('/login?error=oauth_failed', baseUrl)
    );
  }
}
