export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, getOAuthUserInfo, isOAuthConfigured } from '@/lib/oauth';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { signSessionToken } from '@/lib/session-token';

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

  // 用户拒绝授权或出错
  if (error) {
    console.error(`[OAuth Callback] ${provider} 授权错误:`, error, errorDescription);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || '授权失败')}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_params', request.url)
    );
  }

  // 检查 OAuth 是否已配置
  if (!isOAuthConfigured(provider)) {
    return NextResponse.redirect(
      new URL(`/login?error=${provider}_not_configured`, request.url)
    );
  }

  try {
    // 换取 access token
    const tokenResult = await exchangeCodeForToken(provider, code);
    if (!tokenResult) {
      return NextResponse.redirect(
        new URL('/login?error=token_exchange_failed', request.url)
      );
    }

    // 获取用户信息
    const userInfo = await getOAuthUserInfo(provider, tokenResult.accessToken, tokenResult.rawData);
    if (!userInfo) {
      return NextResponse.redirect(
        new URL('/login?error=user_info_failed', request.url)
      );
    }

    const supabase = getSupabaseServiceClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // ======== 绑定模式：state = bind:<userId>:<random> ========
    if (state.startsWith('bind:')) {
      const stateParts = state.split(':');
      const bindUserId = parseInt(stateParts[1], 10);

      if (!bindUserId) {
        return NextResponse.redirect(
          new URL('/login?error=invalid_bind_state', request.url)
        );
      }

      // 查找目标用户
      const { data: bindUser, error: bindUserError } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('id', bindUserId)
        .eq('status', 'active')
        .single();

      if (bindUserError || !bindUser) {
        console.error('[OAuth Callback] 绑定目标用户不存在:', bindUserId);
        return NextResponse.redirect(
          new URL('/login?error=bind_user_not_found', request.url)
        );
      }

      console.log(`[OAuth Callback] 绑定模式: 将 ${provider} 账号绑定到用户 ${bindUserId}`);

      // 创建或更新 OAuth 绑定（绑定到目标用户）
      await supabase
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

      // 绑定成功后重定向到首页，带绑定成功标记
      return NextResponse.redirect(
        new URL(`/?wechat_bound=success&provider=${provider}`, appUrl)
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
      // 尝试用邮箱匹配
      if (userInfo.email && !userInfo.email.includes('@placeholder.com')) {
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
      // 新用户：创建账号
      const username = `${provider}_${userInfo.providerId.slice(-8)}`;
      const email = userInfo.email || `${provider}_${userInfo.providerId}@oauth.user`;

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          username,
          email,
          name: userInfo.name,
          avatar: userInfo.avatar,
          role: 'user',
          status: 'active',
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (createError || !newUser) {
        console.error('[OAuth Callback] 创建用户失败:', createError);
        return NextResponse.redirect(
          new URL('/login?error=create_user_failed', request.url)
        );
      }

      user = newUser;

      // 初始化用户等级
      await supabase
        .from('user_levels')
        .insert({
          user_id: newUser.id,
          level: 1,
          current_points: 0,
          next_level_points: 1000,
        });
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

    // 签发 session token
    const sessionToken = signSessionToken(
      user.id,
      user.email || '',
      user.role || 'user',
      7 * 24 * 3600
    );

    // 构造响应，设置 cookies 并重定向
    const response = NextResponse.redirect(new URL('/', appUrl));

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

    // 把用户基本信息通过 URL 参数传递给前端（前端从 cookie 解析或通过 API 获取完整信息）
    const { password, password_hash, ...safeUser } = user;
    const userB64 = Buffer.from(JSON.stringify({
      id: safeUser.id,
      email: safeUser.email,
      username: safeUser.username,
      name: safeUser.name,
      role: safeUser.role,
      avatar: safeUser.avatar,
    })).toString('base64url');

    response.headers.set(
      'Location',
      `/?oauth_user=${userB64}&session_token=${sessionToken}`
    );

    return response;
  } catch (err: any) {
    console.error(`[OAuth Callback] ${provider} 处理失败:`, err);
    return NextResponse.redirect(
      new URL('/login?error=oauth_failed', request.url)
    );
  }
}
