// 微信 OAuth 2.0 客户端（#20260820-1600 重写）
// 配置缺失时返回明确失败，绝不返回 mock 伪造数据（防止生产环境伪造用户）。

export interface OAuthTokenResult {
  accessToken: string;
  openid: string;
  unionid?: string;
  rawData: Record<string, unknown>;
}

export interface OAuthUserInfoResult {
  providerId: string;
  unionid?: string;
  email?: string;
  name?: string;
  avatar?: string;
}

// 微信开放平台凭据（WECHAT_OAUTH_* 优先，兼容 WECHAT_* 命名；禁止硬编码）
function getWechatAppId(): string {
  return process.env.WECHAT_OAUTH_APP_ID || process.env.WECHAT_APP_ID || '';
}
function getWechatAppSecret(): string {
  return process.env.WECHAT_OAUTH_APP_SECRET || process.env.WECHAT_APP_SECRET || '';
}

/** 检查 OAuth 提供商是否已配置（凭据缺失时前端应降级提示，不发起授权） */
export function isOAuthConfigured(provider: string): boolean {
  const configs: Record<string, boolean> = {
    wechat: (() => {
      const configured = !!(getWechatAppId() && getWechatAppSecret());
      if (!configured) return false;
      // WECHAT_ENABLED 显式设为 false 时关闭；凭据存在且未显式关闭即启用
      return process.env.WECHAT_ENABLED !== 'false';
    })(),
    qq: !!(process.env.QQ_OAUTH_APP_ID && process.env.QQ_OAUTH_APP_KEY),
  };
  return configs[provider] ?? false;
}

/** 获取 OAuth 回调地址（微信开放平台需在白名单中） */
export function getOAuthRedirectUri(provider: string): string {
  // 微信回调地址优先使用 WECHAT_REDIRECT_URI（须与微信开放平台配置的回调域一致）
  if (provider === 'wechat' && process.env.WECHAT_REDIRECT_URI) {
    return process.env.WECHAT_REDIRECT_URI;
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  return `${baseUrl}/api/auth/callback/${provider}`;
}

/**
 * 生成微信网页扫码登录授权 URL（open.weixin.qq.com/qrconnect）
 * @param state CSRF 校验参数，绑定模式为 bind:<userId>:<随机>，登录模式为 login:<随机>
 */
export function getWechatAuthUrl(state: string, redirectUri?: string): string {
  const appId = getWechatAppId();
  const callbackUrl = redirectUri || getOAuthRedirectUri('wechat');
  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

/**
 * 用授权 code 换取 access_token（微信开放平台 sns/oauth2/access_token）
 */
export async function exchangeCodeForToken(
  provider: string,
  code: string
): Promise<OAuthTokenResult | null> {
  if (provider !== 'wechat') {
    console.warn(`[OAuth] 暂不支持的提供商: ${provider}`);
    return null;
  }
  const appId = getWechatAppId();
  const appSecret = getWechatAppSecret();
  if (!appId || !appSecret) {
    console.error('[OAuth] 微信 OAuth 未配置，无法交换 code');
    return null;
  }

  try {
    const url = `https://api.weixin.qq.com/sns/oauth2/access_token?${new URLSearchParams({
      appid: appId,
      secret: appSecret,
      code,
      grant_type: 'authorization_code',
    }).toString()}`;

    const res = await fetch(url);
    const data: Record<string, any> = await res.json();

    if (!data.access_token || data.errcode) {
      console.error('[OAuth] 微信换取 access_token 失败:', data);
      return null;
    }

    return {
      accessToken: data.access_token as string,
      openid: data.openid as string,
      unionid: data.unionid as string | undefined,
      rawData: data,
    };
  } catch (error) {
    console.error('[OAuth] 微信换取 access_token 异常:', error);
    return null;
  }
}

/**
 * 获取微信用户信息（sns/userinfo，需 access_token + openid）
 */
export async function getOAuthUserInfo(
  provider: string,
  accessToken: string,
  rawData?: Record<string, unknown>
): Promise<OAuthUserInfoResult | null> {
  if (provider !== 'wechat') {
    console.warn(`[OAuth] 暂不支持的提供商: ${provider}`);
    return null;
  }
  const openid = (rawData?.openid as string) || '';
  if (!openid) {
    console.error('[OAuth] 微信用户信息缺少 openid');
    return null;
  }

  try {
    const url = `https://api.weixin.qq.com/sns/userinfo?${new URLSearchParams({
      access_token: accessToken,
      openid,
    }).toString()}`;

    const res = await fetch(url);
    const data: Record<string, any> = await res.json();

    if (!data.openid || data.errcode) {
      console.error('[OAuth] 微信获取用户信息失败:', data);
      return null;
    }

    return {
      providerId: data.openid as string,
      unionid: data.unionid as string | undefined,
      name: data.nickname as string | undefined,
      avatar: data.headimgurl as string | undefined,
    };
  } catch (error) {
    console.error('[OAuth] 微信获取用户信息异常:', error);
    return null;
  }
}
