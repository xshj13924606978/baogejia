export type UserRole = 'user' | 'enterprise' | 'admin' | 'super_admin';
export type EnterpriseStatus = 'pending' | 'approved' | 'rejected';

export interface EnterpriseInfo {
  companyName: string;
  businessLicense: string; // 营业执照号
  licenseImage: string; // 营业执照图片
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  companyAddress: string;
  status: EnterpriseStatus;
  submittedAt: string;
  approvedAt?: string;
  rejectReason?: string;
}

export interface User {
  id: string;

  // 基本信息
  name: string;
  avatar?: string;
  role: UserRole;
  createdAt: string;
  lastLogin?: string;

  // 手机号登录
  phone?: string;
  phoneVerified: boolean;

  // 邮箱登录
  email?: string;
  emailVerified: boolean;
  password?: string;

  // 第三方登录
  providers: AuthProvider[];

  // 企业信息
  enterprise?: EnterpriseInfo;

  // 个人资料
  company?: string;
  address?: string;
  department?: string;
  position?: string;
}

export interface AuthProvider {
  type: 'wechat' | 'qq' | 'weibo' | 'google' | 'apple';
  providerId: string;
  openId?: string;
  unionId?: string;
  nickname?: string;
  avatar?: string;
}

export interface LoginCredentials {
  type: 'phone' | 'email' | 'third' | 'enterprise';

  // 手机登录
  phone?: string;
  phoneCode?: string; // 手机验证码

  // 邮箱登录
  email?: string;
  password?: string;

  // 第三方登录
  provider?: string;
  authCode?: string; // 第三方授权码
  redirectUri?: string;

  // 企业登录
  enterpriseId?: string;
  employeeId?: string;
  accessToken?: string;
}

export interface RegisterData {
  type: 'phone' | 'email' | 'third' | 'enterprise';

  // 手机注册
  phone?: string;
  phoneCode?: string; // 手机验证码

  // 邮箱注册
  email?: string;
  password?: string;

  // 第三方注册
  provider?: string;
  providerId?: string;
  avatar?: string;

  // 通用用户名（用于手机注册、邮箱注册、第三方注册）
  name?: string;

  // 企业注册
  enterpriseInfo?: EnterpriseInfo;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  requiresTwoFactor?: boolean;
  requiresBinding?: boolean; // 是否需要绑定手机号
  redirectUrl?: string; // 第三方登录重定向
}
