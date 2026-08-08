'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  role?: string;
  avatar?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  company?: string;
  address?: string;
  createdAt?: string;
  lastLogin?: string;
  password?: string; // 添加 password 字段用于内部验证

  // 用户等级相关
  level?: number; // 用户等级
  currentPoints?: number; // 当前积分
  tokenBalance?: number; // Token余额
  levelExpiryDate?: string; // 等级有效期
  levelConfig?: {
    // 等级配置
    name: string;
    requiredPoints: number;
    permissions: string[];
    can_view_cost_price: boolean;
    can_view_min_price: boolean;
    can_view_manufacturer: boolean;
    can_view_contact: boolean;
    can_view_phone: boolean;
  };

  // 第三方绑定
  wechat?: {
    openId: string;
    unionId?: string;
    nickname?: string;
    avatar?: string;
    boundAt: string;
  };
  github?: {
    id: string;
    login: string;
    boundAt: string;
  };
  google?: {
    id: string;
    email: string;
    boundAt: string;
  };
  qq?: {
    openId: string;
    nickname?: string;
    boundAt: string;
  };
}

interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  requiresTwoFactor?: boolean;
  requiresBinding?: boolean;
  bindingType?: 'email' | 'phone' | 'wechat' | 'github' | 'google' | 'qq';
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  isLoading: boolean; // 添加 isLoading 属性
  error: string | null;

  // 登录方式
  sendPhoneCode: (phone: string) => Promise<{ success: boolean; error?: string }>;
  phoneLogin: (phone: string, code: string) => Promise<AuthResponse>;
  emailRegister: (email: string, password: string, name: string) => Promise<AuthResponse>;
  emailLogin: (email: string, password: string) => Promise<AuthResponse>;
  emailCodeLogin: (email: string, code: string) => Promise<AuthResponse>;
  passwordLogin: (account: string, password: string) => Promise<AuthResponse>; // 新增：统一密码登录
  sendEmailCode: (email: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  sendEmailVerification: (
    email: string
  ) => Promise<{ success: boolean; error?: string; code?: string }>;
  verifyEmail: (email: string, code: string) => Promise<boolean>;

  // 第三方登录
  thirdPartyLogin: (provider: string) => Promise<void>;
  handleThirdPartyCallback: (
    provider: string,
    code: string,
    state: string
  ) => Promise<AuthResponse>;

  // 账号绑定管理
  bindEmail: (
    email: string,
    password?: string,
    code?: string
  ) => Promise<{ success: boolean; error?: string }>;
  bindPhone: (phone: string, code: string) => Promise<{ success: boolean; error?: string }>;
  bindWechat: () => Promise<void>;
  unbindWechat: () => Promise<boolean>;
  unbindEmail: () => Promise<boolean>;
  unbindPhone: () => Promise<boolean>;

  // 头像上传
  uploadAvatar: (file: File) => Promise<{ success: boolean; url?: string; error?: string }>;

  // 设备管理
  logoutAllDevices: () => Promise<boolean>;

  // 账号注销
  deleteAccount: (password: string) => Promise<boolean>;

  // 其他方法
  logout: () => void;
  updateUser: (userData: Partial<User>) => Promise<boolean>;
  refreshUser: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;

  // 企业应用
  submitEnterpriseApplication: (
    data: any
  ) => Promise<{ success: boolean; applicationId?: string; error?: string }>;
  getEnterpriseStatus: (applicationId: string) => Promise<any>;
  enterpriseLogin: (
    enterpriseId: string,
    employeeId: string,
    token: string
  ) => Promise<{ success: boolean; error?: string }>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// 本地存储键 - 使用更明确的名称
const STORAGE_KEYS = {
  USER: 'user',
  TOKEN: 'token',
  USERS_DB: 'users_db',
  EMAIL_VERIFICATION_CODES: 'email_verification_codes',
  EMAIL_LOGIN_CODES: 'email_login_codes',
  PHONE_CODES: 'phone_codes',
  VERIFIED_EMAILS: 'verified_emails',
  VERIFIED_PHONES: 'verified_phones',
  LAST_EMAIL: 'last_email',
  LAST_PHONE: 'last_phone',
  LAST_USERNAME: 'last_username',
  LOGOUT_EVENT: 'logout_event',
  PASSWORD_CHANGE_EVENT: 'password_change_event',
  LOGOUT_ALL_EVENT: 'logout_all_event',
  ACCOUNT_DELETED_EVENT: 'account_deleted_event',
};

// 验证邮箱格式
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

// 验证手机号格式
const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
};

// 生成6位随机验证码
const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // 从数据库查找用户
  const findUserInDB = (identifier: string): any | null => {
    try {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
      return (
        users.find(
          (u: any) => u.email === identifier || u.phone === identifier || u.id === identifier
        ) || null
      );
    } catch (error) {
      console.error('[UserContext] 查找用户失败:', error);
      return null;
    }
  };

  // 通过ID查找用户（支持 localStorage ID 和 Supabase ID）
  const findUserById = (id: string): any | null => {
    try {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
      return users.find((u: any) => u.id === id || u.supabaseId === id) || null;
    } catch (error) {
      console.error('[UserContext] 查找用户失败:', error);
      return null;
    }
  };

  // 同步用户数据到 Supabase（后台静默执行，不阻塞主流程）
  const syncToSupabase = async (options?: {
    clearEmail?: boolean;
    clearPhone?: boolean;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    try {
      const currentUserId = user?.id || '';
      const dbUser = findUserById(currentUserId);
      if (!dbUser) return;

      const body: Record<string, unknown> = {
        phone: dbUser.phone,
        email: dbUser.email,
        username: dbUser.username || dbUser.name,
        // 优先使用 newPassword（密码修改场景），否则用 localStorage 中的密码
        password: options?.newPassword || dbUser.password,
        name: dbUser.name,
        role: dbUser.role,
        supabaseUserId: (user as any)?.supabaseId,
        clearEmail: options?.clearEmail,
        clearPhone: options?.clearPhone,
      };
      if (options?.currentPassword) {
        body.currentPassword = options.currentPassword;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
      if (sessionToken) {
        headers['x-user-token'] = sessionToken;
      }

      const res = await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      // 保存返回的 supabaseId 到 localStorage，供后续精确定位
      const data = await res.json();
      if (data.success && data.user?.id) {
        const updatedDbUser = findUserById(currentUserId);
        if (updatedDbUser && updatedDbUser.supabaseId !== data.user.id) {
          saveUserToDB({ ...updatedDbUser, supabaseId: data.user.id });
        }
        // 保存 HMAC 签名的 session token（安全认证）
        if (data.sessionToken) {
          localStorage.setItem('session_token', data.sessionToken);
        }
      }
    } catch (e) {
      console.error('[syncToSupabase] 同步失败（不影响主流程）:', e);
    }
  };

  // 保存用户到数据库（不存储密码明文到 localStorage）
  const saveUserToDB = (userData: any) => {
    try {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
      const index = users.findIndex((u: any) => u.id === userData.id);
      if (index !== -1) {
        // 先过滤掉 undefined 值的字段，再合并
        const cleanData: Record<string, any> = {};
        for (const [key, value] of Object.entries(userData)) {
          if (value !== undefined) {
            cleanData[key] = value;
          }
        }
        // 安全：不将密码明文写入 localStorage
        delete cleanData.password;
        delete cleanData.password_hash;
        users[index] = { ...users[index], ...cleanData };
        // 显式删除被设为 undefined 的字段（如解绑后需要移除 email）
        for (const [key, value] of Object.entries(userData)) {
          if (value === undefined) {
            delete users[index][key];
          }
        }
      } else {
        // 新用户：同样过滤密码
        const { password, password_hash, ...safeData } = userData;
        users.push(safeData);
      }
      localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(users));
      return true;
    } catch (error) {
      console.error('[UserContext] 保存用户失败:', error);
      return false;
    }
  };

  // 监听跨标签页事件
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.LOGOUT_EVENT) {
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login');
      }

      if (e.key === STORAGE_KEYS.LOGOUT_ALL_EVENT) {
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login?reason=logout_all');
      }

      if (e.key === STORAGE_KEYS.ACCOUNT_DELETED_EVENT) {
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login?reason=account_deleted');
      }

      if (e.key === STORAGE_KEYS.PASSWORD_CHANGE_EVENT && e.newValue) {
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login?reason=password_changed');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [router]);

  // 初始化默认用户
  useEffect(() => {
    const users = localStorage.getItem(STORAGE_KEYS.USERS_DB);
    if (!users) {
      // 不预置任何带密码的用户，空数组即可
      const defaultUsers: unknown[] = [];
      localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(defaultUsers));
    }
  }, []);

  // 发送邮箱验证码（用于登录）
  const sendEmailCode = async (
    email: string
  ): Promise<{ success: boolean; error?: string; code?: string }> => {
    if (!validateEmail(email)) {
      return { success: false, error: '邮箱格式不正确' };
    }

    const code = generateCode();

    const codes = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMAIL_LOGIN_CODES) || '{}');
    codes[email] = {
      code,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.EMAIL_LOGIN_CODES, JSON.stringify(codes));

    return { success: true, code };
  };

  // 邮箱验证码登录
  const emailCodeLogin = async (email: string, code: string): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      if (!validateEmail(email)) {
        return { success: false, error: '邮箱格式不正确' };
      }

      const codes = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMAIL_LOGIN_CODES) || '{}');
      const stored = codes[email];

      if (!stored || stored.code !== code || stored.timestamp < Date.now() - 5 * 60 * 1000) {
        return { success: false, error: '验证码错误或已过期' };
      }

      delete codes[email];
      localStorage.setItem(STORAGE_KEYS.EMAIL_LOGIN_CODES, JSON.stringify(codes));

      let user = findUserInDB(email);

      if (!user) {
        // 新邮箱，创建新用户
        const newUser = {
          id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          email,
          name: email.split('@')[0],
          role: 'user',
          emailVerified: true,
          createdAt: new Date().toISOString(),
        };
        saveUserToDB(newUser);
        user = newUser;
      }

      localStorage.setItem(STORAGE_KEYS.LAST_EMAIL, email);

      const { password: _, ...userWithoutPassword } = user;
      setUser(userWithoutPassword);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
      localStorage.setItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());

      return { success: true, user: userWithoutPassword };
    } catch (_err) {
      return { success: false, error: '登录失败' };
    } finally {
      setLoading(false);
    }
  };

  // 发送邮箱验证码（用于验证）
  const sendEmailVerification = async (
    email: string
  ): Promise<{ success: boolean; error?: string; code?: string }> => {
    if (!validateEmail(email)) {
      return { success: false, error: '邮箱格式不正确' };
    }

    const code = generateCode();

    try {
      if (typeof window === 'undefined') {
        return { success: false, error: '无法存储验证码' };
      }

      const existingCodesStr = localStorage.getItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES);
      let codes: Record<string, { code: string; timestamp: number }> = {};
      if (existingCodesStr) {
        codes = JSON.parse(existingCodesStr);
      }

      codes[email] = {
        code,
        timestamp: Date.now(),
      };

      localStorage.setItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));

      return { success: true, code };
    } catch (error) {
      console.error('[UserContext] 存储验证码失败:', error);
      return { success: false, error: '验证码发送失败' };
    }
  };

  // 验证邮箱
  const verifyEmail = async (email: string, code: string): Promise<boolean> => {
    try {
      if (typeof window === 'undefined') {
        return false;
      }

      const codesStr = localStorage.getItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES);

      if (!codesStr) {
        return false;
      }

      const codes = JSON.parse(codesStr);
      const stored = codes[email];

      if (stored && stored.code === code) {
        if (stored.timestamp < Date.now() - 5 * 60 * 1000) {
          delete codes[email];
          localStorage.setItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));
          return false;
        }

        delete codes[email];
        localStorage.setItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));

        const verified = JSON.parse(localStorage.getItem(STORAGE_KEYS.VERIFIED_EMAILS) || '{}');
        verified[email] = true;
        localStorage.setItem(STORAGE_KEYS.VERIFIED_EMAILS, JSON.stringify(verified));

        return true;
      }

      return false;
    } catch (error) {
      console.error('[UserContext] 验证邮箱出错:', error);
      return false;
    }
  };

  // 发送手机验证码（调用后端 API，腾讯云短信）
  const sendPhoneCode = async (phone: string): Promise<{ success: boolean; error?: string }> => {
    if (!validatePhone(phone)) {
      return { success: false, error: '手机号格式不正确' };
    }

    try {
      const response = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true };
      }

      return {
        success: false,
        error: data.error || '验证码发送失败',
      };
    } catch (error) {
      console.error('[sendPhoneCode] 请求失败:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  // 验证手机（保留给其他场景使用，但主要流程通过后端验证）
  const verifyPhone = async (phone: string, code: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/verify-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  // 手机号登录（调用后端 API）
  const phoneLogin = async (phone: string, code: string): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      if (!validatePhone(phone)) {
        return { success: false, error: '手机号格式不正确' };
      }

      const response = await fetch('/api/auth/verify-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 保存用户信息
        setUser(data.user);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
        localStorage.setItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());
        localStorage.setItem(STORAGE_KEYS.LAST_PHONE, phone);

        if (data.sessionToken) {
          localStorage.setItem('session_token', data.sessionToken);
        }

        return { success: true, user: data.user };
      }

      return {
        success: false,
        error: data.error || '验证码错误或已过期',
      };
    } catch (error) {
      console.error('[phoneLogin] 请求失败:', error);
      return { success: false, error: '登录失败，请稍后重试' };
    } finally {
      setLoading(false);
    }
  };

  // 邮箱注册（带密码）
  const emailRegister = async (
    email: string,
    password: string,
    name: string
  ): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      if (!validateEmail(email)) {
        return { success: false, error: '邮箱格式不正确' };
      }

      if (!password || password.length < 6) {
        return { success: false, error: '密码至少6位' };
      }

      const existingUser = findUserInDB(email);
      if (existingUser) {
        return { success: false, error: '该邮箱已被注册，请直接登录' };
      }

      const newUser = {
        id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        email,
        password,
        name,
        role: 'user',
        emailVerified: false,
        createdAt: new Date().toISOString(),
        avatar: '',
      };

      saveUserToDB(newUser);

      return {
        success: true,
        user: { ...newUser, password: undefined },
        requiresTwoFactor: true,
      };
    } catch (_err) {
      return { success: false, error: '注册失败' };
    } finally {
      setLoading(false);
    }
  };

  // 邮箱密码登录（保留向后兼容）
  const emailLogin = async (email: string, password: string): Promise<AuthResponse> => {
    return passwordLogin(email, password);
  };

  // 统一的密码登录（支持用户名、邮箱和手机号）
  const passwordLogin = async (account: string, password: string): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      const trimmedAccount = account.trim();
      const isEmail = validateEmail(trimmedAccount);
      const isPhone = validatePhone(trimmedAccount);
      // 允许用户名登录（非空、非纯数字）
      const isUsername = trimmedAccount.length >= 2 && !/^\d{11}$/.test(trimmedAccount);

      // 调用后端登录API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: account, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 后端登录成功
        const supabaseUser = data.user;

        // 尝试在 localStorage 中查找匹配的本地用户，合并个人资料
        const localUser = findUserInDB(account);
        let finalUser: any;

        if (localUser) {
          // 找到本地用户：用本地用户为主体，补充 Supabase 信息
          // 保留本地用户的 ID、头像、姓名等个人资料
          const { password: _, password_hash: __, ...localWithoutPassword } = localUser;
          finalUser = {
            ...localWithoutPassword,
            // 记录 Supabase ID，供后续关联
            supabaseId: supabaseUser.id,
            // 如果本地缺少某些字段，从 Supabase 补充
            email: localUser.email || supabaseUser.email,
            level: supabaseUser.level,
            currentPoints: supabaseUser.currentPoints,
          };
          // 更新本地记录：保存 Supabase 同步来的密码
          saveUserToDB({ ...localUser, supabaseId: supabaseUser.id });
        } else {
          // 本地无匹配用户：将 Supabase 用户写入 localStorage
          finalUser = supabaseUser;
          saveUserToDB({
            id: supabaseUser.id,
            email: supabaseUser.email,
            username: supabaseUser.username,
            phone: supabaseUser.metadata?.phone,
            name: supabaseUser.metadata?.name || supabaseUser.full_name || supabaseUser.username,
            role: supabaseUser.role || 'user',
            createdAt: supabaseUser.created_at,
          });
        }

        // 保存最后登录的账号
        if (isEmail) {
          localStorage.setItem(STORAGE_KEYS.LAST_EMAIL, trimmedAccount);
        } else if (isPhone) {
          localStorage.setItem(STORAGE_KEYS.LAST_PHONE, trimmedAccount);
        } else {
          localStorage.setItem(STORAGE_KEYS.LAST_USERNAME, trimmedAccount);
        }

        // 保存用户信息
        setUser(finalUser);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(finalUser));
        localStorage.setItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());
        // 保存 HMAC 签名的 session token（安全认证）
        if (data.sessionToken) {
          localStorage.setItem('session_token', data.sessionToken);
        }

        return { success: true, user: finalUser };
      }

      // 后端返回用户未找到，尝试 localStorage 降级查询
      if (data.code === 'USER_NOT_FOUND' || !response.ok) {
        const localUser = findUserInDB(trimmedAccount);
        if (!localUser) {
          return { success: false, error: data.error || '用户名或密码错误' };
        }

        // 验证密码（localStorage 中的密码可能是明文）
        const userPassword = localUser.password || localUser.password_hash;
        if (!userPassword || userPassword !== password) {
          return { success: false, error: '用户名或密码错误' };
        }

        // localStorage 登录成功
        // 过滤掉密码字段
        const { password: _, password_hash: __, ...userWithoutPassword } = localUser;

        // 保存最后登录的账号
        if (isEmail) {
          localStorage.setItem(STORAGE_KEYS.LAST_EMAIL, trimmedAccount);
        } else if (isPhone) {
          localStorage.setItem(STORAGE_KEYS.LAST_PHONE, trimmedAccount);
        } else {
          localStorage.setItem(STORAGE_KEYS.LAST_USERNAME, trimmedAccount);
        }

        // 保存用户信息到 localStorage
        setUser(userWithoutPassword as User);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
        localStorage.setItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());

        // 异步同步用户数据到 Supabase（不阻塞登录流程）
        try {
          await syncToSupabase();
        } catch (syncError) {
          // 同步失败不影响登录，只记录日志
          console.error('[passwordLogin] 用户同步失败（不影响登录）:', syncError);
        }

        return { success: true, user: userWithoutPassword as User };
      }

      // 其他未知错误
      return { success: false, error: data.error || '用户名或密码错误' };
    } catch (err) {
      console.error('[passwordLogin] Error:', err);
      return { success: false, error: '登录失败，请检查网络连接' };
    } finally {
      setLoading(false);
    }
  };

  // ==================== 第三方登录 ====================

  const thirdPartyLogin = async (provider: string): Promise<void> => {
    setLoading(true);
    try {
      // 生成防 CSRF 的 state 参数
      const state = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('oauth_state', state);

      // 通过后端 API 获取真实的 OAuth 授权 URL
      const response = await fetch(`/api/auth/oauth-url?provider=${provider}&state=${state}`);
      const data = await response.json();

      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError(data.error || `${provider} 登录暂未开放`);
      }
    } catch (error) {
      console.error('第三方登录失败:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleThirdPartyCallback = async (
    provider: string,
    code: string,
    state: string
  ): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      const savedState = localStorage.getItem('oauth_state');
      if (savedState !== state) {
        return { success: false, error: '无效的state参数' };
      }

      const thirdPartyUser = {
        provider,
        providerId: 'third-' + Date.now(),
        name: provider + '用户',
        avatar: '',
        email: `user@${provider}.com`,
      };

      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
      const existingUser = users.find((u: any) => u[provider]?.id === thirdPartyUser.providerId);

      if (existingUser) {
        const { password: _, ...userWithoutPassword } = existingUser;
        setUser(userWithoutPassword);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
        localStorage.setItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());

        return { success: true, user: userWithoutPassword };
      } else if (user) {
        const updatedUser = { ...user } as any;
        updatedUser[provider] = {
          id: thirdPartyUser.providerId,
          name: thirdPartyUser.name,
          boundAt: new Date().toISOString(),
        };

        saveUserToDB(updatedUser);
        setUser(updatedUser);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));

        return { success: true, user: updatedUser };
      } else {
        return {
          success: true,
          user: {
            id: 'temp-' + Date.now(),
            name: thirdPartyUser.name,
            avatar: thirdPartyUser.avatar,
            role: 'user',
            [provider]: {
              id: thirdPartyUser.providerId,
              boundAt: new Date().toISOString(),
            },
          },
          requiresBinding: true,
          bindingType: provider as 'email' | 'phone' | 'wechat' | 'github' | 'google' | 'qq',
        };
      }
    } catch (_err) {
      return { success: false, error: '第三方登录失败' };
    } finally {
      setLoading(false);
    }
  };

  // ==================== 账号绑定管理 ====================

  // 绑定邮箱
  const bindEmail = async (
    email: string,
    password?: string,
    code?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !user.id) return { success: false, error: '用户未登录' };

    // 检查邮箱是否已被其他账号使用
    const existingUser = findUserInDB(email);
    if (existingUser && existingUser.id !== user.id) {
      return { success: false, error: '该邮箱已被其他账号绑定' };
    }

    // 如果提供了验证码，验证验证码
    if (code) {
      const verified = await verifyEmail(email, code);
      if (!verified) {
        return { success: false, error: '验证码错误或已过期' };
      }
    }

    // 获取当前用户数据
    const dbUser = findUserById(user.id);
    if (!dbUser) return { success: false, error: '用户不存在' };

    // 更新用户数据
    const updatedUser = {
      ...dbUser,
      email,
      emailVerified: true,
    };

    // 如果提供了密码，同时设置密码（用于密码登录）
    if (password) {
      // 重要：只设置密码，不清除其他数据
      updatedUser.password = password;
    }

    // 保存到数据库
    saveUserToDB(updatedUser);

    // 同步绑定邮箱到 Supabase（包含密码）
    syncToSupabase();

    // 更新当前用户状态（移除密码）
    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    return { success: true };
  };

  // 绑定手机
  const bindPhone = async (
    phone: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !user.id) return { success: false, error: '用户未登录' };

    if (!validatePhone(phone)) {
      return { success: false, error: '手机号格式不正确' };
    }

    const verified = await verifyPhone(phone, code);
    if (!verified) {
      return { success: false, error: '验证码错误' };
    }

    const existingUser = findUserInDB(phone);
    if (existingUser && existingUser.id !== user.id) {
      return { success: false, error: '该手机号已被其他账号绑定' };
    }

    const dbUser = findUserById(user.id);
    if (!dbUser) return { success: false, error: '用户不存在' };

    const updatedUser = { ...dbUser, phone, phoneVerified: true };
    saveUserToDB(updatedUser);

    // 同步新手机号到 Supabase
    syncToSupabase();

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    return { success: true };
  };

  const bindWechat = async (): Promise<void> => {
    await thirdPartyLogin('wechat');
  };

  const unbindWechat = async (): Promise<boolean> => {
    if (!user || !user.id || !user.wechat) return false;

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    const updatedUser = { ...dbUser, wechat: undefined };

    saveUserToDB(updatedUser);

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    return true;
  };

  const unbindEmail = async (): Promise<boolean> => {
    if (!user || !user.id || !user.email) return false;

    // 检查是否有其他绑定方式
    if (!user.phone && !user.wechat) {
      return false;
    }

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    const updatedUser = { ...dbUser, email: undefined, password: undefined, emailVerified: undefined };

    saveUserToDB(updatedUser);

    // 同步解绑邮箱到 Supabase（清空 email，等待完成）
    await syncToSupabase({ clearEmail: true });

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    return true;
  };

  const unbindPhone = async (): Promise<boolean> => {
    if (!user || !user.id || !user.phone) return false;

    if (!user.email && !user.wechat) {
      return false;
    }

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    const updatedUser = { ...dbUser, phone: undefined, phoneVerified: undefined };

    saveUserToDB(updatedUser);

    // 同步解绑手机号到 Supabase（清空 phone）
    syncToSupabase({ clearPhone: true });

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    return true;
  };

  // ==================== 头像上传 ====================

  const uploadAvatar = async (
    file: File
  ): Promise<{ success: boolean; url?: string; error?: string }> => {
    if (!user || !user.id) {
      return { success: false, error: '用户未登录' };
    }

    if (!file.type.startsWith('image/')) {
      return { success: false, error: '请选择图片文件' };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { success: false, error: '图片大小不能超过2MB' };
    }

    try {
      const reader = new FileReader();

      return new Promise((resolve) => {
        reader.onload = async (e) => {
          const avatarUrl = e.target?.result as string;

          const dbUser = findUserById(user.id);
          if (!dbUser) {
            resolve({ success: false, error: '用户不存在' });
            return;
          }

          const updatedUser = { ...dbUser, avatar: avatarUrl };
          saveUserToDB(updatedUser);

          const { password: _, ...userWithoutPassword } = updatedUser;
          setUser(userWithoutPassword);
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

          resolve({ success: true, url: avatarUrl });
        };

        reader.onerror = () => {
          resolve({ success: false, error: '图片读取失败' });
        };

        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('[UserContext] 头像上传失败:', error);
      return { success: false, error: '上传失败，请重试' };
    }
  };

  // ==================== 设备管理 ====================

  const logoutAllDevices = async (): Promise<boolean> => {
    if (!user || !user.id) return false;

    const newToken = 'token-' + Date.now();
    localStorage.setItem(STORAGE_KEYS.TOKEN, newToken);

    localStorage.setItem(
      STORAGE_KEYS.LOGOUT_ALL_EVENT,
      JSON.stringify({
        userId: user.id,
        timestamp: Date.now(),
      })
    );
    setTimeout(() => {
      localStorage.removeItem(STORAGE_KEYS.LOGOUT_ALL_EVENT);
    }, 100);

    return true;
  };

  // ==================== 账号注销 ====================

  const deleteAccount = async (password: string): Promise<boolean> => {
    if (!user || !user.id) return false;

    const dbUser = findUserById(user.id);
    if (dbUser?.password && dbUser.password !== password) {
      return false;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
    const filtered = users.filter((u: any) => u.id !== user.id);
    localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(filtered));

    localStorage.setItem(
      STORAGE_KEYS.ACCOUNT_DELETED_EVENT,
      JSON.stringify({
        userId: user.id,
        timestamp: Date.now(),
      })
    );
    setTimeout(() => {
      localStorage.removeItem(STORAGE_KEYS.ACCOUNT_DELETED_EVENT);
    }, 100);

    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    setUser(null);

    return true;
  };

  // ==================== 通用方法 ====================

  const logout = () => {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem('session_token');
    // 清除 cookie（通过设置过期时间）
    document.cookie = 'session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'user_role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    setUser(null);

    localStorage.setItem(STORAGE_KEYS.LOGOUT_EVENT, Date.now().toString());
    setTimeout(() => {
      localStorage.removeItem(STORAGE_KEYS.LOGOUT_EVENT);
    }, 100);

    router.push('/login');
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<boolean> => {
    if (!user || !user.id) return false;

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    // 注意：saveUserToDB 会删除 password 字段，所以需要先记住旧密码
    const actualOldPassword = dbUser.password;
    if (actualOldPassword && actualOldPassword !== oldPassword) {
      return false;
    }

    saveUserToDB({ ...dbUser, password: newPassword });

    // 直接传新密码和旧密码到同步函数，不依赖 localStorage 读取
    await syncToSupabase({ currentPassword: oldPassword, newPassword });

    localStorage.setItem(
      STORAGE_KEYS.PASSWORD_CHANGE_EVENT,
      JSON.stringify({
        userId: user.id,
        timestamp: Date.now(),
      })
    );
    setTimeout(() => {
      localStorage.removeItem(STORAGE_KEYS.PASSWORD_CHANGE_EVENT);
    }, 100);

    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    setUser(null);

    return true;
  };

  // 更新用户资料
  const updateUser = async (userData: Partial<User>): Promise<boolean> => {
    if (!user || !user.id) return false;

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    const updatedUser = { ...dbUser, ...userData };
    const saved = saveUserToDB(updatedUser);

    if (saved) {
      const { password: _, ...userWithoutPassword } = updatedUser;
      setUser(userWithoutPassword);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
      return true;
    }

    return false;
  };

  const refreshUser = useCallback(async () => {
    if (!user || !user.id) return;

    try {
      // 从localStorage获取用户信息
      const dbUser = findUserById(user.id);
      if (dbUser) {
        const { password: _, ...userWithoutPassword } = dbUser;

        // 尝试从API获取用户余额和等级信息
        try {
          const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
          if (token) {
            // 获取用户等级信息
            const levelResponse = await fetch('/api/user/level', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (levelResponse.ok) {
              const levelData = await levelResponse.json();
              if (levelData.success && levelData.data) {
                userWithoutPassword.level = levelData.data.level;
                userWithoutPassword.currentPoints = levelData.data.currentPoints;
                userWithoutPassword.levelConfig = levelData.data.levelConfig;
              }
            }

            // 获取用户余额信息
            const balanceResponse = await fetch('/api/user/billing/balance', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (balanceResponse.ok) {
              const balanceData = await balanceResponse.json();
              if (balanceData.success && balanceData.data && balanceData.data.balance) {
                userWithoutPassword.currentPoints = balanceData.data.balance.pointsBalance;
                userWithoutPassword.tokenBalance = balanceData.data.balance.tokenBalance;
              }
            }
          }
        } catch (apiError) {
          console.error('[UserContext] 获取API数据失败:', apiError);
          // API调用失败不影响基本功能，继续使用localStorage数据
        }

        setUser(userWithoutPassword);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
      }
    } catch (error) {
      console.error('[UserContext] 刷新用户失败:', error);
    }
  }, [user]);

  const resetPassword = async (_email_emailemail: string): Promise<boolean> => {
    return true;
  };

  // ==================== 企业应用 ====================

  // 提交企业认证申请
  const submitEnterpriseApplication = async (
    data: any
  ): Promise<{ success: boolean; applicationId?: string; error?: string }> => {
    try {
      setLoading(true);

      // 模拟提交到后端API
      const applicationId = `ENT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // 保存申请记录到localStorage（实际应该调用API）
      const applications = JSON.parse(localStorage.getItem('enterprise_applications') || '[]');
      const newApplication = {
        id: applicationId,
        ...data,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        userId: user?.id,
      };
      applications.push(newApplication);
      localStorage.setItem('enterprise_applications', JSON.stringify(applications));

      return {
        success: true,
        applicationId,
      };
    } catch (error) {
      console.error('[UserContext] 提交企业申请失败:', error);
      return {
        success: false,
        error: '提交失败，请稍后重试',
      };
    } finally {
      setLoading(false);
    }
  };

  // 获取企业申请状态
  const getEnterpriseStatus = async (applicationId: string): Promise<any> => {
    try {
      // 从localStorage获取申请记录（实际应该调用API）
      const applications = JSON.parse(localStorage.getItem('enterprise_applications') || '[]');
      const application = applications.find((app: any) => app.id === applicationId);

      if (!application) {
        return {
          status: 'not_found',
          message: '未找到该申请',
        };
      }

      return application;
    } catch (error) {
      console.error('[UserContext] 获取企业状态失败:', error);
      return {
        status: 'error',
        message: '获取状态失败',
      };
    }
  };

  // 企业登录
  const enterpriseLogin = async (
    enterpriseId: string,
    employeeId: string,
    _tokentoken: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);

      // 模拟企业登录验证（实际应该调用API）
      // 这里只是模拟，实际需要验证企业ID和员工ID的合法性
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 检查企业是否存在（模拟）
      const enterpriseData = JSON.parse(localStorage.getItem('enterprise_data') || '{}');
      if (!enterpriseData[enterpriseId]) {
        return {
          success: false,
          error: '企业不存在或已禁用',
        };
        }

      // 更新用户角色为企业用户
      if (user) {
        const updatedUser = {
          ...user,
          role: 'enterprise',
          enterpriseId,
        };
        setUser(updatedUser);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('[UserContext] 企业登录失败:', error);
      return {
        success: false,
        error: '登录失败，请稍后重试',
      };
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载用户
  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true);

        // ========== 开发环境用户模拟 ==========
        if (process.env.NODE_ENV === 'development') {
          const savedTestUser = localStorage.getItem('dev_test_user');
          if (savedTestUser) {
            try {
              const testUser = JSON.parse(savedTestUser);
              if (testUser.id && testUser.email && testUser.role) {
                setUser(testUser);
                // 同步写入 localStorage.user，确保 hooks 能读到用户信息
                localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(testUser));
                setLoading(false);
                return;
              }
            } catch (e) {
              console.error('[UserContext] 解析测试用户失败', e);
            }
          }
          // 默认使用超级管理员（使用真实 DB UUID，确保 API 查询和 dev fallback 一致）
          const defaultDevUser = {
            id: '8aab9b65-32e1-41d2-80c3-8be24fa30059',
            email: 'admin2@test.com',
            username: 'admin2',
            role: 'super_admin',
            level: 5,
            currentPoints: 9999,
            name: '超级管理员',
            phone: '13924606978'
          };
          setUser(defaultDevUser);
          // 同步写入 localStorage.user
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(defaultDevUser));
          setLoading(false);
          return;
        }
        // ========== 开发环境用户模拟结束 ==========

        // 生产环境：从 localStorage 读取用户 + 校验 session token
        const localUser = localStorage.getItem(STORAGE_KEYS.USER);
        if (localUser) {
          try {
            const parsedUser = JSON.parse(localUser);
            // 校验 session token 有效性（发送轻量级验证请求）
            const sessionToken = localStorage.getItem('session_token');
            if (sessionToken) {
              const verifyRes = await fetch('/api/auth/verify-session', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-token': sessionToken,
                },
                body: JSON.stringify({ userId: parsedUser.id }),
              }).catch(() => null);

              if (verifyRes && verifyRes.ok) {
                setUser(parsedUser);
              } else {
                // token 无效，清除登录状态
                console.warn('[UserContext] session token 无效，清除登录状态');
                localStorage.removeItem(STORAGE_KEYS.USER);
                localStorage.removeItem('session_token');
                localStorage.removeItem(STORAGE_KEYS.TOKEN);
              }
            } else {
              // 没有 session token，也视为未登录
              console.warn('[UserContext] 无 session token，清除登录状态');
              localStorage.removeItem(STORAGE_KEYS.USER);
              localStorage.removeItem('session_token');
              localStorage.removeItem(STORAGE_KEYS.TOKEN);
            }
          } catch (e) {
            console.error('[UserContext] 解析本地用户失败:', e);
            localStorage.removeItem(STORAGE_KEYS.USER);
            localStorage.removeItem('session_token');
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
          }
        }
      } catch (error) {
        console.error('[UserContext] 加载用户失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const value = {
    user,
    loading,
    isLoading: loading, // 添加 isLoading 别名
    error,

    // 登录方式
    sendPhoneCode,
    phoneLogin,
    emailRegister,
    emailLogin,
    emailCodeLogin,
    passwordLogin, // 新增：统一密码登录
    sendEmailCode,
    sendEmailVerification,
    verifyEmail,

    // 第三方登录
    thirdPartyLogin,
    handleThirdPartyCallback,

    // 账号绑定管理
    bindEmail,
    bindPhone,
    bindWechat,
    unbindWechat,
    unbindEmail,
    unbindPhone,

    // 头像上传
    uploadAvatar,

    // 设备管理
    logoutAllDevices,

    // 账号注销
    deleteAccount,

    // 其他方法
    logout,
    updateUser,
    refreshUser,
    changePassword,
    resetPassword,

    // 企业应用
    submitEnterpriseApplication,
    getEnterpriseStatus,
    enterpriseLogin,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
