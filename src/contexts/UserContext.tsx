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

  // 通过ID查找用户
  const findUserById = (id: string): any | null => {
    try {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
      return users.find((u: any) => u.id === id) || null;
    } catch (error) {
      console.error('[UserContext] 查找用户失败:', error);
      return null;
    }
  };

  // 保存用户到数据库
  const saveUserToDB = (userData: any) => {
    try {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS_DB) || '[]');
      const index = users.findIndex((u: any) => u.id === userData.id);
      if (index !== -1) {
        users[index] = { ...users[index], ...userData };
      } else {
        users.push(userData);
      }
      localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(users));
      console.log('[UserContext] 用户保存成功:', userData.email || userData.phone || userData.id);
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
        console.log('[UserContext] 检测到其他标签页登出');
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login');
      }

      if (e.key === STORAGE_KEYS.LOGOUT_ALL_EVENT) {
        console.log('[UserContext] 检测到登出所有设备');
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login?reason=logout_all');
      }

      if (e.key === STORAGE_KEYS.ACCOUNT_DELETED_EVENT) {
        console.log('[UserContext] 检测到账号已注销');
        setUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        router.push('/login?reason=account_deleted');
      }

      if (e.key === STORAGE_KEYS.PASSWORD_CHANGE_EVENT && e.newValue) {
        console.log('[UserContext] 检测到密码修改事件');
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
      const defaultUsers = [
        {
          id: 'default-user-1',
          email: 'test@example.com',
          phone: '13800138000',
          password: 'password123',
          name: '测试用户',
          role: 'user',
          emailVerified: true,
          phoneVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'admin-user',
          email: 'admin@example.com',
          phone: '13900139000',
          password: 'admin123',
          name: '系统管理员',
          role: 'admin',
          emailVerified: true,
          phoneVerified: true,
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(defaultUsers));
      console.log('[UserContext] 默认用户已创建');
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

    console.log('═══════════════════════════════════════════');
    console.log('        邮箱登录验证码');
    console.log('═══════════════════════════════════════════');
    console.log(`邮箱: ${email}`);
    console.log(`验证码: ${code}`);
    console.log('═══════════════════════════════════════════');

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

      const savedCodes = localStorage.getItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES);
      console.log('[UserContext] 验证码存储结果:', savedCodes);

      console.log('═══════════════════════════════════════════');
      console.log('            邮箱验证码');
      console.log('═══════════════════════════════════════════');
      console.log(`邮箱: ${email}`);
      console.log(`验证码: ${code}`);
      console.log(`存储键: ${STORAGE_KEYS.EMAIL_VERIFICATION_CODES}`);
      console.log('═══════════════════════════════════════════');

      return { success: true, code };
    } catch (error) {
      console.error('[UserContext] 存储验证码失败:', error);
      return { success: false, error: '验证码发送失败' };
    }
  };

  // 验证邮箱
  const verifyEmail = async (email: string, code: string): Promise<boolean> => {
    console.log('[UserContext] 验证邮箱:', { email, code });

    try {
      if (typeof window === 'undefined') {
        return false;
      }

      const codesStr = localStorage.getItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES);
      console.log('[UserContext] 从 localStorage 读取验证码:', codesStr);

      if (!codesStr) {
        console.log('[UserContext] 没有找到验证码存储');
        return false;
      }

      const codes = JSON.parse(codesStr);
      const stored = codes[email];

      console.log('[UserContext] 存储的验证码:', stored);

      if (stored && stored.code === code) {
        if (stored.timestamp < Date.now() - 5 * 60 * 1000) {
          console.log('[UserContext] 验证码已过期');
          delete codes[email];
          localStorage.setItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));
          return false;
        }

        console.log('[UserContext] 验证码正确，删除已使用的验证码');
        delete codes[email];
        localStorage.setItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));

        const verified = JSON.parse(localStorage.getItem(STORAGE_KEYS.VERIFIED_EMAILS) || '{}');
        verified[email] = true;
        localStorage.setItem(STORAGE_KEYS.VERIFIED_EMAILS, JSON.stringify(verified));

        return true;
      }

      console.log('[UserContext] 验证码不存在或错误');
      return false;
    } catch (error) {
      console.error('[UserContext] 验证邮箱出错:', error);
      return false;
    }
  };

  // 发送手机验证码
  const sendPhoneCode = async (phone: string): Promise<{ success: boolean; error?: string }> => {
    if (!validatePhone(phone)) {
      return { success: false, error: '手机号格式不正确' };
    }

    const code = generateCode();

    const codes = JSON.parse(localStorage.getItem(STORAGE_KEYS.PHONE_CODES) || '{}');
    codes[phone] = {
      code,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.PHONE_CODES, JSON.stringify(codes));

    console.log('===========================================');
    console.log('📱 手机验证码');
    console.log('-------------------------------------------');
    console.log(`手机号: ${phone}`);
    console.log(`验证码: ${code}`);
    console.log('===========================================');

    return { success: true };
  };

  // 验证手机
  const verifyPhone = async (phone: string, code: string): Promise<boolean> => {
    const codes = JSON.parse(localStorage.getItem(STORAGE_KEYS.PHONE_CODES) || '{}');
    const stored = codes[phone];

    if (stored && stored.code === code && stored.timestamp > Date.now() - 5 * 60 * 1000) {
      delete codes[phone];
      localStorage.setItem(STORAGE_KEYS.PHONE_CODES, JSON.stringify(codes));

      const verified = JSON.parse(localStorage.getItem(STORAGE_KEYS.VERIFIED_PHONES) || '{}');
      verified[phone] = true;
      localStorage.setItem(STORAGE_KEYS.VERIFIED_PHONES, JSON.stringify(verified));

      return true;
    }
    return false;
  };

  // 手机号登录
  const phoneLogin = async (phone: string, code: string): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      if (!validatePhone(phone)) {
        return { success: false, error: '手机号格式不正确' };
      }

      const verified = await verifyPhone(phone, code);
      if (!verified) {
        return { success: false, error: '验证码错误' };
      }

      let user = findUserInDB(phone);

      if (!user) {
        // 新手机号，创建新用户
        const newUser = {
          id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          phone,
          name: '用户' + phone.slice(-4),
          role: 'user',
          phoneVerified: true,
          createdAt: new Date().toISOString(),
        };
        saveUserToDB(newUser);
        user = newUser;
      }

      localStorage.setItem(STORAGE_KEYS.LAST_PHONE, phone);

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

  // 统一的密码登录（支持邮箱和手机号）
  const passwordLogin = async (account: string, password: string): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      // 验证账号格式（可以是邮箱或手机号）
      const isEmail = validateEmail(account);
      const isPhone = validatePhone(account);

      if (!isEmail && !isPhone) {
        return { success: false, error: '请输入正确的邮箱或手机号' };
      }

      // 调用后端登录API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: account, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log('[passwordLogin] 登录失败:', data.error);
        return { success: false, error: data.error || '登录失败' };
      }

      if (!data.success) {
        console.log('[passwordLogin] 登录返回失败:', data.error);
        return { success: false, error: data.error || '登录失败' };
      }

      // 保存最后登录的账号
      if (isEmail) {
        localStorage.setItem(STORAGE_KEYS.LAST_EMAIL, account);
      } else if (isPhone) {
        localStorage.setItem(STORAGE_KEYS.LAST_PHONE, account);
      }

      // 保存用户信息
      const userData = data.user;
      console.log(
        '[passwordLogin] 保存用户信息到 localStorage:',
        userData.id,
        userData.email,
        userData.role
      );
      setUser(userData);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      localStorage.setItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());

      return { success: true, user: userData };
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
      const redirectUri = encodeURIComponent(
        `${window.location.origin}/api/auth/callback/${provider}`
      );
      const state = Math.random().toString(36).substring(7);

      localStorage.setItem('oauth_state', state);

      let authUrl = '';
      switch (provider) {
        case 'wechat':
          authUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=YOUR_APP_ID&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}`;
          break;
        case 'qq':
          authUrl = `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=YOUR_APP_ID&redirect_uri=${redirectUri}&state=${state}`;
          break;
        case 'github':
          authUrl = `https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=${redirectUri}&scope=user:email&state=${state}`;
          break;
        case 'google':
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile&state=${state}`;
          break;
      }

      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (error) {
      console.error('第三方登录失败:', error);
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

    console.log('[UserContext] 绑定邮箱开始:', { email, hasPassword: !!password, hasCode: !!code });

    // 检查邮箱是否已被其他账号使用
    const existingUser = findUserInDB(email);
    if (existingUser && existingUser.id !== user.id) {
      return { success: false, error: '该邮箱已被其他账号绑定' };
    }

    // 如果提供了验证码，验证验证码
    if (code) {
      console.log('[UserContext] 验证验证码:', code);
      const verified = await verifyEmail(email, code);
      console.log('[UserContext] 验证结果:', verified);
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
      console.log('[UserContext] 设置密码用于邮箱登录');
    }

    // 保存到数据库
    saveUserToDB(updatedUser);

    // 更新当前用户状态（移除密码）
    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    console.log('[UserContext] 邮箱绑定成功:', email);

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

    const updatedUser = { ...dbUser };
    delete updatedUser.wechat;

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

    const updatedUser = { ...dbUser };
    delete updatedUser.email;
    delete updatedUser.password;
    delete updatedUser.emailVerified;

    saveUserToDB(updatedUser);

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

    const updatedUser = { ...dbUser };
    delete updatedUser.phone;
    delete updatedUser.phoneVerified;

    saveUserToDB(updatedUser);

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

          console.log('[UserContext] 头像上传成功');
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

    if (dbUser.password && dbUser.password !== oldPassword) {
      return false;
    }

    saveUserToDB({ ...dbUser, password: newPassword });

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

    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [user]);

  const resetPassword = async (email: string): Promise<boolean> => {
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

      console.log('[UserContext] 企业申请已提交:', applicationId);

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
    token: string
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

      console.log('[UserContext] 企业登录成功:', { enterpriseId, employeeId });

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
        const localUser = localStorage.getItem(STORAGE_KEYS.USER);
        if (localUser) {
          const parsedUser = JSON.parse(localUser);
          console.log(
            '[UserContext] 从localStorage加载用户:',
            parsedUser.id,
            parsedUser.email,
            parsedUser.role
          );

          // 直接使用 localStorage 中保存的用户信息，不再依赖本地数据库
          // 这样可以避免本地数据库与实际数据库不一致的问题
          setUser(parsedUser);
        } else {
          console.log('[UserContext] localStorage中无用户信息');
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
