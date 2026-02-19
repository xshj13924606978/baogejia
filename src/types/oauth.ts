// 第三方登录相关类型定义

/**
 * OAuth 提供商枚举
 */
export enum OAuthProvider {
  WECHAT = 'wechat',  // 微信
  QQ = 'qq',          // QQ
  ALIPAY = 'alipay',  // 支付宝
  GITHUB = 'github',  // GitHub
}

/**
 * OAuth 用户信息
 */
export interface OAuthUserInfo {
  provider: OAuthProvider;       // 提供商
  openid: string;                // 第三方用户唯一标识
  unionid?: string;              // 微信开放平台统一标识
  nickname: string;              // 昵称
  avatar?: string;               // 头像URL
  email?: string;                // 邮箱
  phone?: string;                // 手机号
  gender?: number;               // 性别：0未知 1男 2女
  city?: string;                 // 城市
  province?: string;             // 省份
  country?: string;              // 国家
  raw?: any;                     // 原始数据
}

/**
 * OAuth 绑定记录
 */
export interface OAuthBinding {
  id: string;
  user_id: number;               // 用户ID
  provider: OAuthProvider;       // 提供商
  openid: string;                // 第三方用户ID
  unionid?: string;              // 微信unionid
  nickname: string;              // 昵称
  avatar?: string;               // 头像
  created_at: Date;              // 绑定时间
  updated_at: Date;              // 更新时间
}

/**
 * 微信扫码登录响应
 */
export interface WechatQrCodeResponse {
  success: boolean;
  qr_code_url?: string;          // 二维码图片URL
  qrcode_key?: string;           // 二维码key（用于查询扫码状态）
  expire_time?: number;          // 过期时间（秒）
  error?: string;
}

/**
 * QQ 登录响应
 */
export interface QQLoginResponse {
  success: boolean;
  auth_url?: string;             // 授权URL
  error?: string;
}

/**
 * OAuth 登录回调请求
 */
export interface OAuthCallbackRequest {
  provider: OAuthProvider;
  code?: string;                 // 授权码
  state?: string;                // 状态参数
  openid?: string;               // 微信扫码登录的openid
  access_token?: string;         // 访问令牌
}

/**
 * OAuth 登录回调响应
 */
export interface OAuthCallbackResponse {
  success: boolean;
  user?: any;                    // 用户信息
  need_bind?: boolean;           // 是否需要绑定
  oauth_user?: OAuthUserInfo;    // 第三方用户信息（需要绑定时）
  error?: string;
}

/**
 * 绑定账号请求
 */
export interface BindAccountRequest {
  provider: OAuthProvider;
  openid: string;
  username: string;
  password: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 绑定账号响应
 */
export interface BindAccountResponse {
  success: boolean;
  user?: any;
  error?: string;
}

/**
 * 解绑账号请求
 */
export interface UnbindAccountRequest {
  provider: OAuthProvider;
  password: string;              // 密码验证
}

/**
 * 解绑账号响应
 */
export interface UnbindAccountResponse {
  success: boolean;
  error?: string;
}

/**
 * 查询用户OAuth绑定列表响应
 */
export interface UserBindingsResponse {
  success: boolean;
  bindings?: OAuthBinding[];
  error?: string;
}

/**
 * 微信配置
 */
export interface WechatOAuthConfig {
  app_id: string;                // 应用ID
  app_secret: string;            // 应用密钥
  redirect_uri: string;          // 回调地址
  scope?: string;                // 授权作用域
}

/**
 * QQ配置
 */
export interface QQOAuthConfig {
  app_id: string;                // 应用ID
  app_key: string;               // 应用密钥
  redirect_uri: string;          // 回调地址
  scope?: string;                // 授权作用域
}

/**
 * OAuth 令牌信息
 */
export interface OAuthToken {
  access_token: string;          // 访问令牌
  expires_in: number;            // 过期时间（秒）
  refresh_token?: string;        // 刷新令牌
  openid?: string;               // 用户openid
  unionid?: string;              // 微信unionid
  scope?: string;                // 授权范围
}

/**
 * 微信用户信息响应
 */
export interface WechatUserInfoResponse {
  openid: string;
  nickname: string;
  sex: number;                   // 性别
  province: string;              // 省份
  city: string;                  // 城市
  country: string;               // 国家
  headimgurl: string;            // 头像URL
  privilege: string[];           // 权限
  unionid?: string;              // unionid
}

/**
 * QQ用户信息响应
 */
export interface QQUserInfoResponse {
  ret: number;                   // 返回码
  msg: string;                   // 返回信息
  is_lost: number;               // 是否丢失
  nickname: string;              // 昵称
  gender: string;                // 性别
  figureurl: string;             // 头像URL
  figureurl_1: string;           // 大头像
  figureurl_2: string;           // 小头像
  figureurl_qq_1: string;        // QQ大头像
  figureurl_qq_2: string;        // QQ小头像
  is_yellow_vip: string;         // 是否黄钻
  vip: string;                   // 是否会员
  yellow_vip_level: number;      // 黄钻等级
  level: number;                 // 等级
  is_yellow_year_vip: string;    // 是否年费黄钻
}
