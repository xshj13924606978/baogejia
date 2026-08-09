// 第三方登录服务层 - 微信/QQ登录集成

import crypto from 'crypto';
import {
  OAuthProvider,
  OAuthUserInfo,
  OAuthBinding,
  OAuthToken,
  WechatUserInfoResponse,
  QQUserInfoResponse,
  WechatOAuthConfig,
  QQOAuthConfig,
  WechatQrCodeResponse,
} from '@/types/oauth';

/**
 * 第三方登录服务类
 */
export class OAuthService {
  private wechatConfig: WechatOAuthConfig;
  private qqConfig: QQOAuthConfig;
  private bindings: Map<string, OAuthBinding> = new Map();
  private pendingStates: Map<string, { expiresAt: number }> = new Map();

  // 清理过期 state 的定时器
  private stateCleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // 从环境变量读取配置
    this.wechatConfig = {
      app_id: process.env.WECHAT_OAUTH_APP_ID || '',
      app_secret: process.env.WECHAT_OAUTH_APP_SECRET || '',
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/auth/wechat/callback`,
      scope: 'snsapi_login', // 网站应用用 snsapi_login
    };

    this.qqConfig = {
      app_id: process.env.QQ_OAUTH_APP_ID || '',
      app_key: process.env.QQ_OAUTH_APP_KEY || '',
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/auth/qq/callback`,
      scope: 'get_user_info',
    };

    // 初始化模拟绑定数据
    this.initMockBindings();

    // 每5分钟清理过期的 state，防止内存泄漏
    this.stateCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [state, { expiresAt }] of this.pendingStates) {
        if (now > expiresAt) this.pendingStates.delete(state);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * 释放资源
   */
  destroy(): void {
    if (this.stateCleanupTimer) clearInterval(this.stateCleanupTimer);
    this.pendingStates.clear();
  }

  /**
   * 创建微信扫码登录二维码
   */
  async createWechatQrCode(): Promise<WechatQrCodeResponse> {
    try {
      // 检查配置
      if (!this.wechatConfig.app_id) {
        console.warn('[OAuthService] 微信OAuth配置缺失，返回模拟数据');
        return this.getMockWechatQrCode();
      }

      // 调用微信开放平台API获取二维码
      // 使用微信开放平台网站应用登录
      const params = new URLSearchParams();
      params.append('appid', this.wechatConfig.app_id);
      params.append('redirect_uri', this.wechatConfig.redirect_uri);
      params.append('response_type', 'code');
      params.append('scope', this.wechatConfig.scope || 'snsapi_login');
      params.append('state', this.generateState());

      const qrCodeUrl = `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}`;


      return {
        success: true,
        qr_code_url: qrCodeUrl,
        expire_time: 300, // 5分钟
      };
    } catch (error) {
      console.error('[OAuthService] 创建微信二维码失败:', error);
      return {
        success: false,
        error: '创建二维码失败',
      };
    }
  }

  /**
   * 微信登录回调处理
   */
  async handleWechatCallback(code: string, state: string): Promise<OAuthUserInfo | null> {
    try {
      // 验证 state 防止 CSRF
      if (!this.validateState(state)) {
        console.error('[OAuthService] 微信登录回调 state 验证失败（可能为CSRF攻击）');
        return null;
      }

      // 检查配置
      if (!this.wechatConfig.app_id || !this.wechatConfig.app_secret) {
        console.warn('[OAuthService] 微信OAuth配置缺失，返回模拟用户');
        return this.getMockWechatUser();
      }

      // 1. 使用code换取access_token
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?${new URLSearchParams({
        appid: this.wechatConfig.app_id,
        secret: this.wechatConfig.app_secret,
        code,
        grant_type: 'authorization_code',
      })}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData: OAuthToken = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error('[OAuthService] 获取微信access_token失败:', tokenData);
        return null;
      }

      // 2. 使用access_token获取用户信息
      const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?${new URLSearchParams({
        access_token: tokenData.access_token,
        openid: tokenData.openid!,
      })}`;

      const userResponse = await fetch(userInfoUrl);
      const userData: WechatUserInfoResponse = await userResponse.json();

      if (!userData.openid) {
        console.error('[OAuthService] 获取微信用户信息失败:', userData);
        return null;
      }

      // 转换为统一格式
      const oauthUser: OAuthUserInfo = {
        provider: OAuthProvider.WECHAT,
        openid: userData.openid,
        unionid: userData.unionid,
        nickname: userData.nickname,
        avatar: userData.headimgurl,
        gender: userData.sex,
        province: userData.province,
        city: userData.city,
        country: userData.country,
        raw: userData,
      };

      return oauthUser;
    } catch (error) {
      console.error('[OAuthService] 处理微信登录回调失败:', error);
      return null;
    }
  }

  /**
   * 创建QQ登录授权URL
   */
  async createQQAuthUrl(): Promise<{ success: boolean; auth_url?: string; error?: string }> {
    try {
      // 检查配置
      if (!this.qqConfig.app_id) {
        console.warn('[OAuthService] QQ OAuth配置缺失，返回模拟URL');
        return this.getMockQQAuthUrl();
      }

      // 构建QQ登录授权URL
      const params = new URLSearchParams();
      params.append('response_type', 'code');
      params.append('client_id', this.qqConfig.app_id);
      params.append('redirect_uri', this.qqConfig.redirect_uri);
      params.append('scope', this.qqConfig.scope || 'get_user_info');
      params.append('state', this.generateState());

      const authUrl = `https://graph.qq.com/oauth2.0/authorize?${params.toString()}`;


      return {
        success: true,
        auth_url: authUrl,
      };
    } catch (error) {
      console.error('[OAuthService] 创建QQ登录授权URL失败:', error);
      return {
        success: false,
        error: '创建授权URL失败',
      };
    }
  }

  /**
   * QQ登录回调处理
   */
  async handleQQCallback(code: string, state: string): Promise<OAuthUserInfo | null> {
    try {
      // 验证 state 防止 CSRF
      if (!this.validateState(state)) {
        console.error('[OAuthService] QQ登录回调 state 验证失败（可能为CSRF攻击）');
        return null;
      }

      // 检查配置
      if (!this.qqConfig.app_id || !this.qqConfig.app_key) {
        console.warn('[OAuthService] QQ OAuth配置缺失，返回模拟用户');
        return this.getMockQQUser();
      }

      // 1. 使用code换取access_token
      const tokenUrl = `https://graph.qq.com/oauth2.0/token?${new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.qqConfig.app_id,
        client_secret: this.qqConfig.app_key,
        code,
        redirect_uri: this.qqConfig.redirect_uri,
      })}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenText = await tokenResponse.text();

      // QQ返回的是查询字符串格式，需要解析
      const tokenData: OAuthToken = this.parseQueryString(tokenText);

      if (!tokenData.access_token) {
        console.error('[OAuthService] 获取QQ access_token失败:', tokenText);
        return null;
      }

      // 2. 获取OpenID
      const openIdUrl = `https://graph.qq.com/oauth2.0/me?${new URLSearchParams({
        access_token: tokenData.access_token,
        fmt: 'json',
      })}`;

      const openIdResponse = await fetch(openIdUrl);
      const openIdText = await openIdResponse.text();
      const openIdData = JSON.parse(openIdText.replace(/^callback\(/, '').replace(/\)$/, ''));

      if (!openIdData.openid) {
        console.error('[OAuthService] 获取QQ openid失败:', openIdData);
        return null;
      }

      // 3. 获取用户信息
      const userInfoUrl = `https://graph.qq.com/user/get_user_info?${new URLSearchParams({
        access_token: tokenData.access_token,
        oauth_consumer_key: this.qqConfig.app_id,
        openid: openIdData.openid,
      })}`;

      const userResponse = await fetch(userInfoUrl);
      const userData: QQUserInfoResponse = await userResponse.json();

      if (userData.ret !== 0) {
        console.error('[OAuthService] 获取QQ用户信息失败:', userData);
        return null;
      }

      // 转换为统一格式
      const oauthUser: OAuthUserInfo = {
        provider: OAuthProvider.QQ,
        openid: openIdData.openid,
        nickname: userData.nickname,
        avatar: userData.figureurl_qq_1 || userData.figureurl,
        gender: userData.gender === '男' ? 1 : userData.gender === '女' ? 2 : 0,
        raw: userData,
      };

      return oauthUser;
    } catch (error) {
      console.error('[OAuthService] 处理QQ登录回调失败:', error);
      return null;
    }
  }

  /**
   * 查询OAuth绑定
   */
  async getBinding(provider: OAuthProvider, openid: string): Promise<OAuthBinding | null> {
    for (const binding of this.bindings.values()) {
      if (binding.provider === provider && binding.openid === openid) {
        return binding;
      }
    }
    return null;
  }

  /**
   * 创建OAuth绑定
   */
  async createBinding(userId: number, oauthUser: OAuthUserInfo): Promise<OAuthBinding> {
    const binding: OAuthBinding = {
      id: `${userId}-${oauthUser.provider}-${oauthUser.openid}`,
      user_id: userId,
      provider: oauthUser.provider,
      openid: oauthUser.openid,
      unionid: oauthUser.unionid,
      nickname: oauthUser.nickname,
      avatar: oauthUser.avatar,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.bindings.set(binding.id, binding);

    return binding;
  }

  /**
   * 查询用户的OAuth绑定列表
   */
  async getUserBindings(userId: number): Promise<OAuthBinding[]> {
    return Array.from(this.bindings.values()).filter((binding) => binding.user_id === userId);
  }

  /**
   * 解除OAuth绑定
   */
  async unbindAccount(userId: number, provider: OAuthProvider): Promise<boolean> {
    let found = false;
    for (const [key, binding] of this.bindings.entries()) {
      if (binding.user_id === userId && binding.provider === provider) {
        this.bindings.delete(key);
        found = true;
        break;
      }
    }

    if (found) {
    }

    return found;
  }

  /**
   * 生成随机state并缓存（5分钟有效）
   */
  private generateState(): string {
    const state = crypto.randomBytes(16).toString('hex');
    this.pendingStates.set(state, { expiresAt: Date.now() + 5 * 60 * 1000 });
    return state;
  }

  /**
   * 验证OAuth回调中的state参数（防CSRF）
   */
  validateState(state: string): boolean {
    const entry = this.pendingStates.get(state);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.pendingStates.delete(state);
      return false;
    }
    // 一次性使用，验证后删除
    this.pendingStates.delete(state);
    return true;
  }

  /**
   * 解析查询字符串
   */
  private parseQueryString(queryString: string): any {
    const params: any = {};
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      params[key] = decodeURIComponent(value || '');
    }
    return params;
  }

  /**
   * 获取模拟微信二维码
   */
  private getMockWechatQrCode(): WechatQrCodeResponse {
    const qrcodeKey = `mock_qr_${Date.now()}`;
    return {
      success: true,
      qr_code_url: 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=mock_ticket',
      qrcode_key: qrcodeKey,
      expire_time: 300,
    };
  }

  /**
   * 获取模拟微信用户
   */
  private getMockWechatUser(): OAuthUserInfo {
    return {
      provider: OAuthProvider.WECHAT,
      openid: `mock_wechat_openid_${Date.now()}`,
      unionid: `mock_wechat_unionid_${Date.now()}`,
      nickname: '微信用户',
      avatar:
        'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTLuY3K8Wx7V0mZKv1k6p2J8q4m5n6o7p8q9r0s1t2u3v4w5x6y7z8',
      gender: 0,
      province: '广东',
      city: '深圳',
      country: '中国',
    };
  }

  /**
   * 获取模拟QQ授权URL
   */
  private getMockQQAuthUrl(): { success: boolean; auth_url?: string } {
    return {
      success: true,
      auth_url: 'https://graph.qq.com/oauth2.0/authorize?mock=true',
    };
  }

  /**
   * 获取模拟QQ用户
   */
  private getMockQQUser(): OAuthUserInfo {
    return {
      provider: OAuthProvider.QQ,
      openid: `mock_qq_openid_${Date.now()}`,
      nickname: 'QQ用户',
      avatar: 'https://thirdqq.qlogo.cn/g?b=oidb&k=mock_k&kti=mock_kti&s=100&t=mock_t',
      gender: 0,
    };
  }

  /**
   * 初始化模拟绑定数据
   */
  private initMockBindings(): void {
    // 可以在这里初始化一些测试数据
  }
}

// 导出单例
export const oauthService = new OAuthService();
