// OAuth 工具函数占位实现
// 生产环境 OAuth 回调路由构建所需的最小导出

export interface OAuthTokenResult {
  accessToken: string;
  rawData: Record<string, unknown>;
}

export interface OAuthUserInfoResult {
  providerId: string;
  email?: string;
  name?: string;
  avatar?: string;
}

export function isOAuthConfigured(provider: string): boolean {
  const configs: Record<string, boolean> = {
    wechat: !!(process.env.WECHAT_OAUTH_APP_ID && process.env.WECHAT_OAUTH_APP_SECRET),
    qq: !!(process.env.QQ_OAUTH_APP_ID && process.env.QQ_OAUTH_APP_KEY),
  };
  return configs[provider] ?? false;
}

export async function exchangeCodeForToken(
  provider: string,
  code: string
): Promise<OAuthTokenResult | null> {
  console.warn(`[OAuth] ${provider} code exchange not implemented, code=${code.slice(0, 4)}...`);
  return null;
}

export async function getOAuthUserInfo(
  provider: string,
  accessToken: string,
  rawData?: Record<string, unknown>
): Promise<OAuthUserInfoResult | null> {
  console.warn(`[OAuth] ${provider} user info not implemented`);
  return null;
}
