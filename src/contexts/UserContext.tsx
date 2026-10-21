'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { loadMinPasswordLength } from '@/lib/password-policy';

interface User {
  id: string;
  supabaseId?: string; // 数据库 UUID（localStorage 中的 id 可能是本地 id）
  email?: string;
  username?: string;
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
  hasPassword?: boolean; // 用户是否已设置本地密码（password_hash 非空，#20260827-PASSWORD）

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
  /** 手机号验证码登录时是否自动创建了新账号（#20260820-1600） */
  isNewUser?: boolean;
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  isLoading: boolean; // 添加 isLoading 属性
  error: string | null;
  // 公司信息（供方信息，#[20260827-1030]-7）
  companyInfo: CompanyInfo | null;
  refreshCompanyInfo: () => Promise<void>;

  // 登录方式
  sendPhoneCode: (
    phone: string,
    purpose?: 'register' | 'bind' | 'general' | string
  ) => Promise<{ success: boolean; error?: string }>;
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
    code?: string,
    oldEmail?: string,
    oldCode?: string
  ) => Promise<{ success: boolean; error?: string }>;
  bindPhone: (
    phone: string,
    code: string,
    oldPhone?: string,
    oldCode?: string
  ) => Promise<{ success: boolean; error?: string }>;
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
  clearStaleSession: () => void;
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
  // 主动登出标记：登出后刷新时禁止从 httpOnly cookie 自动恢复（后端清 cookie 失败时的双保险）
  LOGGED_OUT_FLAG: 'logged_out_flag',
};

// ====== 安全 Storage 访问封装 ======
// 背景（#20260820-1130）：localStorage 配额写满（QuotaExceededError）或隐私模式下
// Storage 不可用时，直接调用 setItem 会抛异常，打断「从 Cookie 恢复会话」等关键流程，
// 并在控制台留下「Failed to execute 'setItem' on 'Storage'」错误。
// 策略（#20260821-1330 增强）：
// - 写入：localStorage 失败 → 对 user 大值（含 base64 头像，可达 2.7MB）剔除头像瘦身重试 →
//       降级 sessionStorage → 仍失败则内存兜底（当前页面内保证可用，不再反复抛/报错）
// - 读取：localStorage 优先 → 失败/未命中回退 sessionStorage → 内存兜底
// - 删除：localStorage / sessionStorage / 内存兜底全部尝试删除
// - 警告降噪：同一 key 仅首次进入内存兜底时警告一次，避免存储满时控制台刷屏
// 内存兜底存储：隐私模式或配额写满导致双 Storage 均不可用时，
// 保证会话数据在当前页面生命周期内可用（不持久化，刷新后由 httpOnly cookie / verify-session 兜底恢复）
const memoryStorage = new Map<string, string>();
const memoryWarnedKeys = new Set<string>();
// user 数据超过该阈值视为「大值」：正常身份数据仅几 KB，只有 base64 头像可达 2MB+；
// 头像已同步服务端（users.metadata.avatar），本地剔除后刷新可从服务端恢复
const MAX_USER_VALUE_LENGTH = 512 * 1024;

const safeGetItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch { /* 忽略 */ }
  try {
    const value = window.sessionStorage.getItem(key);
    if (value !== null) return value;
  } catch { /* 忽略 */ }
  return memoryStorage.get(key) ?? null;
};
// 递归剔除对象中所有「键名含 avatar 且值为大 base64 字符串」的字段。
// #20260821-1330：登录返回的 user 中 metadata/wechat_avatar 等嵌套字段同样携带
// base64 头像（1.2MB+），仅剔除顶层 avatar 不够；头像均已同步服务端，本地剔除后
// 刷新可从 verify-session 恢复，不影响展示。
const stripBigAvatarFields = (obj: unknown): unknown => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripBigAvatarFields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/avatar/i.test(k) && typeof v === 'string' && v.length > MAX_USER_VALUE_LENGTH / 2) continue;
    out[k] = stripBigAvatarFields(v);
  }
  return out;
};
const safeSetItem = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  // v 参数允许写入瘦身后的值（#20260821-1330：tryWrite 必须写实际要落盘的内容，
  // 否则瘦身分支算出的 slimValue 会被忽略，仍写原值导致 QuotaExceededError）
  const tryWrite = (storage: Storage, v: string = value): boolean => {
    try {
      storage.setItem(key, v);
      return true;
    } catch {
      return false;
    }
  };
  // 1) 首选 localStorage
  if (tryWrite(window.localStorage)) return;
  // 2) 大值瘦身：#20260821-1330 管理员登录后 user（含 base64 头像，编码后约 2.7MB）
  //    写入接近满的 localStorage 必然 QuotaExceededError；头像已同步服务端可恢复，
  //    递归剔除后重写，保证 id/email/role/name 等身份数据可持久化（不再反复失败）
  if (key === STORAGE_KEYS.USER && value.length > MAX_USER_VALUE_LENGTH) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        const slimValue = JSON.stringify(stripBigAvatarFields(parsed));
        if (slimValue.length < value.length) {
          if (tryWrite(window.localStorage, slimValue)) return;
          if (tryWrite(window.sessionStorage, slimValue)) return;
        }
      }
    } catch { /* 非 JSON 结构，保持原值继续降级 */ }
  }
  // 3) 降级 sessionStorage（原值）
  if (tryWrite(window.sessionStorage)) return;
  // 4) 双存储均失败 → 内存兜底（当前页面内保证可用；刷新后由 cookie/verify-session 恢复）
  memoryStorage.set(key, value);
  if (!memoryWarnedKeys.has(key)) {
    memoryWarnedKeys.add(key);
    console.warn(`[UserContext] localStorage/sessionStorage 均不可用(${key})，降级内存存储`);
  }
};
const safeRemoveItem = (key: string): void => {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(key); } catch { /* 忽略 */ }
  try { window.sessionStorage.removeItem(key); } catch { /* 忽略 */ }
  memoryStorage.delete(key);
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

/** 公司信息（供方信息，#[20260827-1030]-7 数据持久化） */
export interface CompanyInfo {
  id: number;
  company_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  website?: string | null;
  logo_url?: string | null;
  is_default: boolean;
  user_id?: string | null;
  updated_at?: string;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const router = useRouter();

  // 从数据库查找用户
  const findUserInDB = (identifier: string): any | null => {
    try {
      const users = JSON.parse(safeGetItem(STORAGE_KEYS.USERS_DB) || '[]');
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
      const users = JSON.parse(safeGetItem(STORAGE_KEYS.USERS_DB) || '[]');
      return users.find((u: any) => u.id === id || u.supabaseId === id) || null;
    } catch (error) {
      console.error('[UserContext] 查找用户失败:', error);
      return null;
    }
  };

  // 同步用户数据到 Supabase（后台静默执行，不阻塞主流程）
  const syncToSupabase = async (
    options?: {
      clearEmail?: boolean;
      clearPhone?: boolean;
      currentPassword?: string;
      newPassword?: string;
    },
    sourceData?: Partial<User>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const currentUserId = user?.id || '';
      const dbUser = findUserById(currentUserId);
      if (!dbUser && !sourceData) return { success: false };

      // sourceData 优先：资料保存/头像上传后 localStorage 可能因容量写失败，
      // 直接用内存数据同步，确保头像/资料能持久化到服务端
      const merged = { ...(dbUser || {}), ...(sourceData || {}) };

      const body: Record<string, unknown> = {
        phone: merged.phone,
        email: merged.email,
        username: merged.username || merged.name,
        // 优先使用 newPassword（密码修改场景），否则用 localStorage 中的密码
        password: options?.newPassword || merged.password,
        name: merged.name,
        // 个人资料（头像/公司/地址）：同步到服务端 metadata，确保刷新/换设备不丢失
        avatar: merged.avatar,
        company: merged.company,
        address: merged.address,
        role: merged.role,
        // 优先用 localStorage 记录中的 supabaseId 精确定位用户，避免靠 email/username 误匹配
        supabaseUserId: (dbUser as any)?.supabaseId || (user as any)?.supabaseId,
        clearEmail: options?.clearEmail,
        clearPhone: options?.clearPhone,
      };
      if (options?.currentPassword) {
        body.currentPassword = options.currentPassword;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionToken = typeof window !== 'undefined' ? safeGetItem('session_token') : null;
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
          safeSetItem('session_token', data.sessionToken);
        }
      }
      return { success: data.success === true, error: data.error };
    } catch (e) {
      console.error('[syncToSupabase] 同步失败（不影响主流程）:', e);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  // 保存用户到数据库（不存储密码明文到 localStorage）
  const saveUserToDB = (userData: any) => {
    try {
      const users = JSON.parse(safeGetItem(STORAGE_KEYS.USERS_DB) || '[]');
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
      // 容量保护（修复 #20260819-1822）：users_db 会积累多个用户的 base64 头像
      // （上传头像上限 2MB，base64 后约 2.7MB），全量写回易超 localStorage 5MB
      // 配额触发 QuotaExceededError（登录后刷新时 saveUserToDB 写回即报错）。
      // 写入前先序列化检测，超限时降级裁剪：
      // ① 剔除非当前用户的 base64 头像（头像可从服务端/当前用户记录恢复）；
      // ② 仍超限则只保留当前用户 + 最近 20 个用户；
      // ③ 兜底仍失败则仅写当前用户（不带头像），保证会话刷新不再报错。
      const MAX_USERS_DB_BYTES = 4 * 1024 * 1024; // 4MB 安全阈值，留余量给其他 key
      let toStore = users;
      let serialized = JSON.stringify(toStore);
      if (serialized.length > MAX_USERS_DB_BYTES) {
        toStore = users.map((u: any) => {
          if (u.id === userData.id) return u; // 当前用户保留完整资料
          const avatar = u.avatar;
          if (typeof avatar === 'string' && avatar.startsWith('data:image')) {
            const { avatar: _drop, ...rest } = u;
            return rest;
          }
          return u;
        });
        serialized = JSON.stringify(toStore);
      }
      if (serialized.length > MAX_USERS_DB_BYTES) {
        const current = toStore.find((u: any) => u.id === userData.id);
        const others = toStore.filter((u: any) => u.id !== userData.id).slice(-20);
        toStore = current ? [current, ...others] : others;
        serialized = JSON.stringify(toStore);
      }
      try {
        safeSetItem(STORAGE_KEYS.USERS_DB, serialized);
      } catch (e) {
        // 极端兜底：单用户数据仍超限时，仅写当前用户且剔除头像
        const current = users.find((u: any) => u.id === userData.id);
        if (current) {
          const { avatar: _drop, ...rest } = current;
          safeSetItem(STORAGE_KEYS.USERS_DB, JSON.stringify([rest]));
        } else {
          throw e;
        }
      }
      return true;
    } catch (error) {
      console.error('[UserContext] 保存用户失败:', error);
      return false;
    }
  };

  // 清除服务端会话 cookie：httpOnly cookie 无法用 document.cookie 删除，
  // 必须调用后端 /api/auth/logout 回写 Max-Age=0 才能真正清除。
  const clearServerSession = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (e) {
      console.warn('[UserContext] 清除服务端会话失败:', e);
    }
  }, []);

  // 主动登出统一收尾：标记 + 清除服务端 cookie（跨标签页事件复用）
  const doLoggedOutCleanup = useCallback(
    (reason: string) => {
      safeSetItem(STORAGE_KEYS.LOGGED_OUT_FLAG, '1');
      clearServerSession();
      setUser(null);
      safeRemoveItem(STORAGE_KEYS.USER);
      safeRemoveItem(STORAGE_KEYS.TOKEN);
      safeRemoveItem('session_token');
      // #[20260827-1630]-2：退出登录必须清空对话上下文（与 chat-area.tsx 的 CHAT_STATE_KEY 一致），
      // 防止重新登录后恢复上一个账号的会话；safeRemoveItem 同时清理 localStorage + sessionStorage。
      safeRemoveItem('chat_area_restore_v1');
      router.push(reason ? `/login?reason=${reason}` : '/login');
    },
    [clearServerSession, router]
  );

  // 清除残留的旧账号会话（注册成功跳转登录页前调用）：
  // 邀请链接注册场景下，浏览器可能残留邀请人等旧账号的会话（localStorage + httpOnly cookie），
  // 若不清理，登录页「已登录自动跳转」逻辑会把这些旧会话当成已登录用户，导致注册后登录的是邀请人账号。
  // 与 doLoggedOutCleanup 的区别：只清会话，不做跳转（由调用方控制跳转目标）。
  const clearStaleSession = useCallback(() => {
    safeSetItem(STORAGE_KEYS.LOGGED_OUT_FLAG, '1');
    clearServerSession();
    setUser(null);
    safeRemoveItem(STORAGE_KEYS.USER);
    safeRemoveItem(STORAGE_KEYS.TOKEN);
    safeRemoveItem('session_token');
  }, [clearServerSession]);

  // 监听跨标签页事件
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.LOGOUT_EVENT) {
        doLoggedOutCleanup('');
      }

      if (e.key === STORAGE_KEYS.LOGOUT_ALL_EVENT) {
        doLoggedOutCleanup('logout_all');
      }

      if (e.key === STORAGE_KEYS.ACCOUNT_DELETED_EVENT) {
        doLoggedOutCleanup('account_deleted');
      }

      if (e.key === STORAGE_KEYS.PASSWORD_CHANGE_EVENT && e.newValue) {
        doLoggedOutCleanup('password_changed');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [doLoggedOutCleanup, router]);

  // 初始化默认用户
  useEffect(() => {
    const users = safeGetItem(STORAGE_KEYS.USERS_DB);
    if (!users) {
      // 不预置任何带密码的用户，空数组即可
      const defaultUsers: unknown[] = [];
      safeSetItem(STORAGE_KEYS.USERS_DB, JSON.stringify(defaultUsers));
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

    const codes = JSON.parse(safeGetItem(STORAGE_KEYS.EMAIL_LOGIN_CODES) || '{}');
    codes[email] = {
      code,
      timestamp: Date.now(),
    };
    safeSetItem(STORAGE_KEYS.EMAIL_LOGIN_CODES, JSON.stringify(codes));

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

      const codes = JSON.parse(safeGetItem(STORAGE_KEYS.EMAIL_LOGIN_CODES) || '{}');
      const stored = codes[email];

      if (!stored || stored.code !== code || stored.timestamp < Date.now() - 5 * 60 * 1000) {
        return { success: false, error: '验证码错误或已过期' };
      }

      delete codes[email];
      safeSetItem(STORAGE_KEYS.EMAIL_LOGIN_CODES, JSON.stringify(codes));

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

      safeSetItem(STORAGE_KEYS.LAST_EMAIL, email);

      const { password: _, ...userWithoutPassword } = user;
      setUser(userWithoutPassword);
      safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
      safeSetItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());

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

      const existingCodesStr = safeGetItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES);
      let codes: Record<string, { code: string; timestamp: number }> = {};
      if (existingCodesStr) {
        codes = JSON.parse(existingCodesStr);
      }

      codes[email] = {
        code,
        timestamp: Date.now(),
      };

      safeSetItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));

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

      const codesStr = safeGetItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES);

      if (!codesStr) {
        return false;
      }

      const codes = JSON.parse(codesStr);
      const stored = codes[email];

      if (stored && stored.code === code) {
        if (stored.timestamp < Date.now() - 5 * 60 * 1000) {
          delete codes[email];
          safeSetItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));
          return false;
        }

        delete codes[email];
        safeSetItem(STORAGE_KEYS.EMAIL_VERIFICATION_CODES, JSON.stringify(codes));

        const verified = JSON.parse(safeGetItem(STORAGE_KEYS.VERIFIED_EMAILS) || '{}');
        verified[email] = true;
        safeSetItem(STORAGE_KEYS.VERIFIED_EMAILS, JSON.stringify(verified));

        return true;
      }

      return false;
    } catch (error) {
      console.error('[UserContext] 验证邮箱出错:', error);
      return false;
    }
  };

  // 发送手机验证码（调用后端 API，腾讯云短信）
  const sendPhoneCode = async (
    phone: string,
    purpose?: 'register' | 'bind' | 'general' | string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!validatePhone(phone)) {
      return { success: false, error: '手机号格式不正确' };
    }

    try {
      const response = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, ...(purpose ? { purpose } : {}) }),
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

  // 手机号登录（#20260820-1600：接 login-with-sms，未注册手机号自动建号）
  const phoneLogin = async (phone: string, code: string): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      if (!validatePhone(phone)) {
        return { success: false, error: '手机号格式不正确' };
      }

      const response = await fetch('/api/auth/login-with-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 保存用户信息
        setUser(data.user);
        // 重新登录成功，清除主动登出标记
        safeRemoveItem(STORAGE_KEYS.LOGGED_OUT_FLAG);
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
        safeSetItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());
        safeSetItem(STORAGE_KEYS.LAST_PHONE, phone);

        if (data.sessionToken) {
          safeSetItem('session_token', data.sessionToken);
        }

        return { success: true, user: data.user, isNewUser: !!data.isNewUser };
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

      const minLen = await loadMinPasswordLength();
      if (!password || password.length < minLen) {
        return { success: false, error: `密码至少${minLen}位` };
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
        // === 修复 #20260822-1645：避免 phone/email 误匹配 localStorage 中残留的旧测试账号 ===
        // 旧问题：findUserInDB(account) 用 email/phone/id 匹配，localStorage.USERS_DB 中残留的
        // 旧测试账号（phone/email 与当前账号重复、含旧 data URL 头像）会被命中 → 手机号/邮箱密码
        // 登录后显示"测试用过"的旧头像（用户名登录因 username 不在 email/phone 中匹配不到 →
        // 走 else → 服务端权威 → 头像正确，所以问题只在手机号/邮箱路径）。
        // 修复：supabaseUser.id 精确匹配优先；account 匹配仅在 supabaseId 一致时采纳，
        // 否则视为旧账号残留丢弃，走服务端权威 supabaseUser。
        let localUser = findUserById(supabaseUser.id);
        if (!localUser) {
          const accountUser = findUserInDB(account);
          if (accountUser) {
            const localSupabaseId = (accountUser as any).supabaseId || accountUser.id;
            if (localSupabaseId === supabaseUser.id) {
              localUser = accountUser;
            }
          }
        }
        let finalUser: any;

        if (localUser) {
          // 找到本地用户：以服务端 supabaseUser 为权威主体（#20260822-1630）
          // 历史问题：localStorage 中存的是注册时的陈旧字段（unbound_<uid>@local.invalid 占位邮箱、
          // full_name=888、未绑定微信、company="888"），密码登录成功后陈旧值覆盖服务端真实姓名/邮箱/
          // 微信绑定/公司/地址，导致登录后 user 显示陈旧但刷新（走 verify-session）又恢复。
          // 修复：supabaseUser 为权威主体；仅 base64 data URL 本地头像补充（避免 ~100KB+ 不存服务端）。
          const localAvatar = localUser.avatar && localUser.avatar.startsWith?.('data:') ? localUser.avatar : '';
          finalUser = {
            ...supabaseUser,
            avatar: localAvatar || supabaseUser.avatar || '',
            supabaseId: supabaseUser.id || localUser.supabaseId,
          };
          // 把服务端权威字段同步到 localStorage，纠正历史陈旧记录
          saveUserToDB({
            id: localUser.id || supabaseUser.id,
            supabaseId: supabaseUser.id,
            email: supabaseUser.email,
            username: supabaseUser.username,
            phone: finalUser.phone,
            name: supabaseUser.name,
            avatar: finalUser.avatar,
            company: supabaseUser.company,
            address: supabaseUser.address,
            role: supabaseUser.role || 'user',
            level: supabaseUser.level,
            currentPoints: supabaseUser.currentPoints,
            password: localUser.password,
            password_hash: localUser.password_hash,
            createdAt: localUser.createdAt || supabaseUser.created_at,
          });
        } else {
          // 本地无匹配用户：将 Supabase 用户写入 localStorage
          finalUser = supabaseUser;
          saveUserToDB({
            id: supabaseUser.id,
            email: supabaseUser.email,
            username: supabaseUser.username,
            phone:
              supabaseUser.phone ||
              supabaseUser.metadata?.phone ||
              (/^1\d{10}$/.test(supabaseUser.username || '') ? supabaseUser.username : ''),
            name: supabaseUser.name || supabaseUser.metadata?.name || supabaseUser.full_name || supabaseUser.username,
            avatar: supabaseUser.avatar || '',
            company: supabaseUser.company || '',
            address: supabaseUser.address || '',
            role: supabaseUser.role || 'user',
            createdAt: supabaseUser.created_at,
          });
        }

        // 保存最后登录的账号
        if (isEmail) {
          safeSetItem(STORAGE_KEYS.LAST_EMAIL, trimmedAccount);
        } else if (isPhone) {
          safeSetItem(STORAGE_KEYS.LAST_PHONE, trimmedAccount);
        } else {
          safeSetItem(STORAGE_KEYS.LAST_USERNAME, trimmedAccount);
        }

        // 保存用户信息
        setUser(finalUser);
        // 重新登录成功，清除主动登出标记（允许后续刷新从 cookie 恢复）
        safeRemoveItem(STORAGE_KEYS.LOGGED_OUT_FLAG);
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(finalUser));
        safeSetItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());
        // 保存 HMAC 签名的 session token（安全认证）
        if (data.sessionToken) {
          safeSetItem('session_token', data.sessionToken);
        }

        return { success: true, user: finalUser };
      }

      // 仅在后端明确返回"用户不存在"时尝试 localStorage 降级查询。
      // 注意：不能因 !response.ok 降级——密码错误(401)/服务器异常(500)时若用本地
      // 残留数据"假登录"，只会写入 localStorage 而不设置 session_token/cookie，
      // 导致进入 /admin 时被 middleware 拦截、刷新后登录态被清除，形成"进不去"的循环。
      if (data.code === 'USER_NOT_FOUND') {
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
          safeSetItem(STORAGE_KEYS.LAST_EMAIL, trimmedAccount);
        } else if (isPhone) {
          safeSetItem(STORAGE_KEYS.LAST_PHONE, trimmedAccount);
        } else {
          safeSetItem(STORAGE_KEYS.LAST_USERNAME, trimmedAccount);
        }

        // 保存用户信息到 localStorage
        setUser(userWithoutPassword as User);
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
        safeSetItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());

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
      // 生成防 CSRF 的 state 参数（供回调校验参考；oauth-url 内部会再生成带模式前缀的 state）
      const state = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      safeSetItem('oauth_state', state);

      // 通过后端 API 获取真实的 OAuth 授权 URL（#20260820-1600：未配置凭据时返回明确错误，不 mock）
      const response = await fetch(`/api/auth/oauth-url?provider=${provider}&mode=login`);
      const data = await response.json();

      if (data.success && (data.url || data.authUrl)) {
        window.location.href = data.url || data.authUrl;
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

  // 第三方登录回调（#[20260829-1700] 重构）：当前无前端调用方（OAuth 全部走整页跳转），
  // 保留入口并委托真实后端 /api/auth/oauth-link（登录/绑定/注册均服务端完成），
  // 杜绝此前的假数据 mock（伪造 providerId/email/token）。
  const handleThirdPartyCallback = async (
    provider: string,
    code: string,
    state: string
  ): Promise<AuthResponse> => {
    setLoading(true);
    setError(null);

    try {
      const savedState = safeGetItem('oauth_state');
      if (savedState && savedState !== state) {
        return { success: false, error: '无效的state参数' };
      }

      const res = await fetch('/api/auth/oauth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, code, state }),
      }).catch(() => null);
      if (!res) {
        return { success: false, error: '网络错误，请稍后重试' };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        return { success: false, error: data.error || '第三方登录失败' };
      }

      // 服务端已建立会话（cookie + sessionToken），本地同步后即时登录
      if (data.user) {
        const { password: _pwd, ...safe } = data.user;
        setUser(safe);
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(safe));
        if (data.sessionToken) safeSetItem('session_token', data.sessionToken);
        safeSetItem(STORAGE_KEYS.TOKEN, 'token-' + Date.now());
        saveUserToDB(safe);
      }
      return { success: true, user: data.user, requiresBinding: false };
    } catch (_err) {
      return { success: false, error: '第三方登录失败' };
    } finally {
      setLoading(false);
    }
  };

  // ==================== 账号绑定管理 ====================

  // 绑定/换绑邮箱（#[20260829-1700] 重构）：走服务端 /api/auth/email/bind
  // 服务端负责验证码校验（SMTP/Supabase 双通道）、新旧邮箱双验证、唯一性检查、审计日志；
  // 成功后 refreshUser 从 verify-session 拉取服务端权威状态，实现「绑定即生效」。
  const bindEmail = async (
    email: string,
    _password?: string,
    code?: string,
    oldEmail?: string,
    oldCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !user.id) return { success: false, error: '用户未登录' };

    try {
      const token = safeGetItem('session_token');
      const res = await fetch('/api/auth/email/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          code: code || '',
          oldEmail: oldEmail || '',
          oldCode: oldCode || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        return { success: false, error: data.error || '邮箱绑定失败，请重试' };
      }
      // 服务端权威刷新（绑定/换绑即时生效）
      await refreshUser().catch(() => undefined);
      return { success: true };
    } catch (error) {
      console.error('[bindEmail] 服务端绑定邮箱异常:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  // 绑定/换绑手机（#[20260829-1700] 重构）：走服务端 /api/auth/phone/bind
  // 换绑时需提供旧手机号验证码（oldPhone/oldCode），服务端新旧双验证后更新 metadata.phone。
  const bindPhone = async (
    phone: string,
    code: string,
    oldPhone?: string,
    oldCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !user.id) return { success: false, error: '用户未登录' };

    if (!validatePhone(phone)) {
      return { success: false, error: '手机号格式不正确' };
    }

    try {
      const token = safeGetItem('session_token');
      const res = await fetch('/api/auth/phone/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          phone,
          code: code || '',
          oldPhone: oldPhone || '',
          oldCode: oldCode || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        return { success: false, error: data.error || '手机号绑定失败，请重试' };
      }
      // 服务端权威刷新（绑定/换绑即时生效）
      await refreshUser().catch(() => undefined);
      return { success: true };
    } catch (error) {
      console.error('[bindPhone] 服务端绑定手机号异常:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  const bindWechat = async (): Promise<void> => {
    if (!user || !user.id) {
      setError('请先登录');
      return;
    }

    setLoading(true);
    try {
      // 通过后端 API 获取绑定模式（mode=bind）的微信 OAuth 授权 URL
      // 路由会自动生成 state=bind:<userId>:<random>，callback 路由识别 state 前缀后绑定到当前用户
      // 修复 #20260821-1910：原实现传 client state 但 oauth-url 路由不读 query.state，走默认 mode=login → 闪退闪跳
      const response = await fetch('/api/auth/oauth-url?provider=wechat&mode=bind');
      const data = await response.json();

      if (data.success && data.url) {
        // #20260827-1600：改为弹窗扫码，绑定结果经 bind-result → window.opener.postMessage
        // 回传，由本组件全局 wechat_bound 监听器自动刷新用户状态（避免整页跳转闪跳首页）。
        if (typeof window !== 'undefined') {
          const popup = window.open(data.url, '_blank', 'width=520,height=640');
          if (!popup) {
            setError('弹窗被浏览器拦截，请允许弹窗后重试');
          }
        }
      } else {
        setError(data.error || '微信绑定暂未开放');
      }
    } catch (error) {
      console.error('[bindWechat] 微信绑定失败:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const unbindWechat = async (): Promise<boolean> => {
    if (!user || !user.id || !user.wechat) return false;

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    // 先服务端解绑（删除 OAuth 绑定记录 + 清空微信字段），成功后再清除本地状态
    // #20260827-XXXX 修复：原实现仅当 localStorage 存在 session_token 才调用 /api/auth/unlink，
    // 扫码登录（OAuth）用户 localStorage 无 token → API 从未被调用 → 本地显示解绑成功但服务端
    // 绑定未删除 → 刷新后 verify-session 从 DB 读回绑定。现改为无条件调用（服务端
    // session_token cookie 兜底鉴权），并校验响应结果，失败则不解绑，避免本地/服务端状态不一致。
    try {
      const token = safeGetItem('session_token');
      const res = await fetch('/api/auth/unlink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ provider: 'wechat' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        console.error('[unbindWechat] 服务端解绑失败:', data.error || res.status);
        return false;
      }
    } catch (error) {
      console.error('[unbindWechat] 服务端解绑异常:', error);
      return false;
    }

    const updatedUser = { ...dbUser, wechat: undefined };
    saveUserToDB(updatedUser);

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

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

    // #20260827-XXXX 修复：先服务端解绑成功，再清除本地状态，
    // 避免"本地解绑成功但服务端未同步 → 刷新后恢复绑定"（与微信解绑同类问题）
    const synced = await syncToSupabase({ clearEmail: true });
    if (!synced.success) {
      console.warn('[unbindEmail] 服务端解绑失败，保持本地绑定状态');
      return false;
    }

    const updatedUser = { ...dbUser, email: undefined, password: undefined, emailVerified: undefined };
    saveUserToDB(updatedUser);

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

    return true;
  };

  const unbindPhone = async (): Promise<boolean> => {
    if (!user || !user.id || !user.phone) return false;

    if (!user.email && !user.wechat) {
      return false;
    }

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    // #20260827-XXXX 修复：先服务端解绑成功，再清除本地状态
    const synced = await syncToSupabase({ clearPhone: true });
    if (!synced.success) {
      console.warn('[unbindPhone] 服务端解绑失败，保持本地绑定状态');
      return false;
    }

    const updatedUser = { ...dbUser, phone: undefined, phoneVerified: undefined };
    saveUserToDB(updatedUser);

    const { password: _, ...userWithoutPassword } = updatedUser;
    setUser(userWithoutPassword);
    safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

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
          safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));

          // 同步头像到服务端（后台静默），刷新/换设备后可恢复
          syncToSupabase(undefined, userWithoutPassword);

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

    // #[20260829-1700]：真实生效——服务端递增 users.session_version，
    // 所有已签发 token（含 httpOnly cookie）随之下一次校验失效，强制重新登录。
    // 原实现仅替换 localStorage 的伪 token，生产环境其它设备会话完全不受影响。
    try {
      const token = safeGetItem('session_token');
      const res = await fetch('/api/auth/logout-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        console.error('[logoutAllDevices] 服务端操作失败:', data.error || res.status);
        return false;
      }
    } catch (error) {
      console.error('[logoutAllDevices] 服务端操作异常:', error);
      return false;
    }

    // 服务端已成功撤销全部会话 → 本机登出（清本地状态 + 后端清 cookie）
    doLoggedOutCleanup('logout_all');
    return true;
  };

  // ==================== 账号注销 ====================

  const deleteAccount = async (password: string): Promise<boolean> => {
    if (!user || !user.id) return false;

    // #[20260829-1700]：真实生效——服务端校验密码（若已设置）后级联删除用户
    // 及全部关联数据（或降级标记删除），并清除 httpOnly cookie。
    // 原实现仅清 localStorage 的本地兜底库，生产环境数据库账号完全未被删除，
    // 导致「注销后刷新仍能登录 / 管理员删除入口无法同步」。
    try {
      const token = safeGetItem('session_token');
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ password: password || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        console.error('[deleteAccount] 服务端操作失败:', data.error || res.status);
        return false;
      }
    } catch (error) {
      console.error('[deleteAccount] 服务端操作异常:', error);
      return false;
    }

    // 服务端已删除/标记删除 → 本地清理 + 登出
    safeSetItem(
      STORAGE_KEYS.ACCOUNT_DELETED_EVENT,
      JSON.stringify({
        userId: user.id,
        timestamp: Date.now(),
      })
    );
    setTimeout(() => {
      safeRemoveItem(STORAGE_KEYS.ACCOUNT_DELETED_EVENT);
    }, 100);

    doLoggedOutCleanup('account_deleted');
    return true;
  };

  // ==================== 通用方法 ====================

  const logout = () => {
    // 统一登出收尾：设置登出标记（防刷新自动恢复）+ 后端清除 httpOnly cookie + 清本地 + 跳转
    doLoggedOutCleanup('');

    // 通知其他标签页强制退出
    safeSetItem(STORAGE_KEYS.LOGOUT_EVENT, Date.now().toString());
    setTimeout(() => {
      safeRemoveItem(STORAGE_KEYS.LOGOUT_EVENT);
    }, 100);
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<boolean> => {
    if (!user || !user.id) return false;

    const dbUser = findUserById(user.id);
    if (!dbUser) return false;

    // 注意：本地 users_db 不存密码明文，若存在历史明文则用于校验旧密码
    const actualOldPassword = dbUser.password;
    if (actualOldPassword && actualOldPassword !== oldPassword) {
      return false;
    }

    // 同步到服务端：必须成功才算修改成功，否则服务端仍为旧密码，不能提示成功
    const synced = await syncToSupabase({ currentPassword: oldPassword, newPassword });
    if (!synced.success) {
      console.warn('[UserContext] 修改密码同步失败，服务端密码未更新');
      return false;
    }

    // 清除本地 users_db 中的旧密码明文（显式置 undefined 触发删除，防止本地兜底登录放行旧密码）
    saveUserToDB({ ...dbUser, password: undefined });

    // 清除旧会话（localStorage + httpOnly cookie），防止刷新/跳转时自动恢复原用户登录。
    // httpOnly cookie 必须走后端 /api/auth/logout 才能真正清除，document.cookie 无效。
    safeRemoveItem(STORAGE_KEYS.USER);
    safeRemoveItem(STORAGE_KEYS.TOKEN);
    safeRemoveItem('session_token');
    // #[20260827-1630]-2：改密码强制下线同样清空对话上下文，重新登录为全新会话
    safeRemoveItem('chat_area_restore_v1');
    clearServerSession();
    setUser(null);

    // 通知其他标签页强制退出
    safeSetItem(
      STORAGE_KEYS.PASSWORD_CHANGE_EVENT,
      JSON.stringify({
        userId: user.id,
        timestamp: Date.now(),
      })
    );
    setTimeout(() => {
      safeRemoveItem(STORAGE_KEYS.PASSWORD_CHANGE_EVENT);
    }, 100);

    // 当前标签页直接退回登录界面
    router.push('/login?reason=password_changed');

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
      const originalUiUser = { ...user };
      setUser(userWithoutPassword);
      safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
      // 同步资料到服务端；失败时回滚本地状态，避免显示已保存但实际未持久化
      // #20260827-0826-2 修复
      const { success, error } = await syncToSupabase(undefined, userWithoutPassword);
      if (!success) {
        saveUserToDB(dbUser);
        setUser(originalUiUser);
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(originalUiUser));
        return false;
      }
      return true;
    }

    return false;
  };

  const refreshUser = useCallback(async () => {
    if (!user || !user.id) return;

    try {
      // #[20260829-1700] 重构：以服务端 verify-session 为唯一权威源。
      // 绑定/解绑/换绑（微信、手机、邮箱）、等级、积分、hasPassword 等即时同步，
      // 修复「非管理员绑定微信后状态不及时生效 / 解绑后状态不刷新」问题。
      const sessionToken = safeGetItem('session_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['x-user-token'] = sessionToken;

      const verifyRes = await fetch('/api/auth/verify-session', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(sessionToken ? { token: sessionToken } : {}),
      }).catch(() => null);

      if (!verifyRes) {
        // 网络异常：保留现有状态，不影响基本功能
        return;
      }
      if (!verifyRes.ok) {
        // 会话失效/被撤销（如「全部设备登出」）→ 按未登录处理，强制重新登录
        console.warn('[UserContext] refreshUser 会话失效，进入登出清理');
        doLoggedOutCleanup('session_expired');
        return;
      }

      const data = await verifyRes.json().catch(() => null);
      if (!data?.valid || !data.user) {
        doLoggedOutCleanup('session_expired');
        return;
      }

      const serverUser = data.user as Record<string, unknown>;
      // 本地头像兜底：dataURL 头像若服务端尚未回传，保留本地（服务端已覆盖则用服务端）
      const localDbUser = findUserById(user.id);
      const mergedUser = { ...serverUser } as any;
      if (
        localDbUser?.avatar &&
        typeof localDbUser.avatar === 'string' &&
        localDbUser.avatar.startsWith('data:image/') &&
        !mergedUser.avatar
      ) {
        mergedUser.avatar = localDbUser.avatar;
      }

      // 补充余额信息（失败不影响）
      try {
        const balanceResponse = await fetch('/api/user/billing/balance', { headers });
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          if (balanceData.success && balanceData.data?.balance) {
            mergedUser.currentPoints = balanceData.data.balance.pointsBalance;
            mergedUser.tokenBalance = balanceData.data.balance.tokenBalance;
          }
        }
      } catch {
        // 忽略余额刷新失败
      }

      const { password: _pwd, ...userWithoutPassword } = mergedUser;
      setUser(userWithoutPassword);
      safeSetItem(STORAGE_KEYS.USER, JSON.stringify(userWithoutPassword));
      // 同步到本地兜底库，保证头像上传/资料保存/绑定定位到该用户
      saveUserToDB(userWithoutPassword);
    } catch (error) {
      console.error('[UserContext] 刷新用户失败:', error);
    }
  }, [user, doLoggedOutCleanup]);

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
      const applications = JSON.parse(safeGetItem('enterprise_applications') || '[]');
      const newApplication = {
        id: applicationId,
        ...data,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        userId: user?.id,
      };
      applications.push(newApplication);
      safeSetItem('enterprise_applications', JSON.stringify(applications));

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
      const applications = JSON.parse(safeGetItem('enterprise_applications') || '[]');
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
      const enterpriseData = JSON.parse(safeGetItem('enterprise_data') || '{}');
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
        safeSetItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
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

        // 微信扫码登录成功回跳标记处理（#20260822-1302）：
        // OAuth 回调成功会 302 到 /?oauth=login，此时服务端已签发新 cookie。
        // 但若用户此前主动登出过，localStorage 残留 logged_out_flag 会阻断下方
        // restoreFromCookie 的 cookie 会话恢复，导致扫码登录后仍显示未登录（登录循环）。
        // 该标记证明用户刚完成一轮全新 OAuth 登录，应清除登出标记并清理 URL 参数。
        // （passwordLogin/phoneLogin 成功分支均有 safeRemoveItem(LOGGED_OUT_FLAG)，
        //   OAuth 走整页跳转没有该时机，故在此补齐。）
        if (typeof window !== 'undefined') {
          const oauthParams = new URLSearchParams(window.location.search);
          if (oauthParams.get('oauth') === 'login') {
            safeRemoveItem(STORAGE_KEYS.LOGGED_OUT_FLAG);
            oauthParams.delete('oauth');
            const oauthQuery = oauthParams.toString();
            window.history.replaceState(
              {},
              '',
              window.location.pathname + (oauthQuery ? `?${oauthQuery}` : '')
            );
          }
        }

        // 兜底：当 localStorage token 失效（过期/被篡改）时，尝试从 httpOnly cookie 恢复。
        // 这是双令牌架构的关键安全兜底——cookie 由服务端在登录时设置且更可信，
        // 不应因为浏览器残留了一个过期 token 就把已登录用户踢回登录页。
        const restoreFromCookie = async () => {
          // 用户主动登出后禁止从 cookie 恢复会话：
          // 若后端清 cookie 因网络异常失败导致 cookie 残留，这里也绝不能把已登出的用户拉回登录态
          if (safeGetItem(STORAGE_KEYS.LOGGED_OUT_FLAG)) {
            console.log('[UserContext] 检测到主动登出标记，跳过 Cookie 恢复');
            return;
          }
          try {
            const verifyRes = await fetch('/api/auth/verify-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({}),
            }).catch(() => null);

            if (verifyRes && verifyRes.ok) {
              const verifyData = await verifyRes.json().catch(() => ({}));
              if (verifyData.valid && verifyData.user) {
                setUser(verifyData.user);
                safeSetItem(STORAGE_KEYS.USER, JSON.stringify(verifyData.user));
                // 同步到 users_db，保证头像上传/资料保存/手机绑定可定位到该用户
                saveUserToDB(verifyData.user);
                console.log('[UserContext] 从 Cookie 恢复登录状态成功');
              }
            }
          } catch (e) {
            console.error('[UserContext] 从 Cookie 恢复会话失败:', e);
          }
        };

        // 从 localStorage 读取用户 + 校验 session token
        const localUser = safeGetItem(STORAGE_KEYS.USER);
        if (localUser) {
          try {
            const parsedUser = JSON.parse(localUser);
            // 校验 session token 有效性（发送轻量级验证请求）
            // 优先使用 localStorage 中的 token；若缺失则让后端从 httpOnly cookie 读取
            const sessionToken = safeGetItem('session_token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (sessionToken) {
              headers['x-user-token'] = sessionToken;
            }

            const verifyRes = await fetch('/api/auth/verify-session', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(sessionToken ? { token: sessionToken } : {}),
            }).catch(() => null);

            if (verifyRes && verifyRes.ok) {
              // 使用服务端返回的最新用户信息，避免 localStorage 中数据过期
              const verifyData = await verifyRes.json().catch(() => ({}));
              // 合并策略：身份字段（id/email/role/level 等）以服务端为准；
              // 个人资料字段（头像/姓名/公司/地址/手机号）本地优先，服务端兜底，
              // 避免服务端尚未同步到最新值时（如头像刚上传）覆盖导致刷新丢失
              const verifiedUser = verifyData.user
                ? {
                    ...verifyData.user,
                    name: parsedUser.name || verifyData.user.name,
                    avatar: parsedUser.avatar || verifyData.user.avatar,
                    company: parsedUser.company || verifyData.user.company,
                    address: parsedUser.address || verifyData.user.address,
                    phone: parsedUser.phone || verifyData.user.phone,
                  }
                : parsedUser;
              setUser(verifiedUser);
              safeSetItem(STORAGE_KEYS.USER, JSON.stringify(verifiedUser));
              // 同步到 users_db，保证头像上传/资料保存/手机绑定可定位到该用户
              saveUserToDB(verifiedUser);
            } else {
              // token 无效，清除本地残留的过期状态，然后尝试从 cookie 兜底恢复
              console.warn('[UserContext] session token 无效，清除登录状态并尝试 Cookie 兜底');
              safeRemoveItem(STORAGE_KEYS.USER);
              safeRemoveItem('session_token');
              safeRemoveItem(STORAGE_KEYS.TOKEN);
              await restoreFromCookie();
            }
          } catch (e) {
            console.error('[UserContext] 解析本地用户失败:', e);
            safeRemoveItem(STORAGE_KEYS.USER);
            safeRemoveItem('session_token');
            safeRemoveItem(STORAGE_KEYS.TOKEN);
            await restoreFromCookie();
          }
        } else {
          // localStorage 无用户数据，尝试从 httpOnly cookie 恢复会话
          await restoreFromCookie();
        }
      } catch (error) {
        console.error('[UserContext] 加载用户失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  // 加载公司信息（供方信息，#[20260827-1030]-7）
  const refreshCompanyInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/company-info', { credentials: 'include' }).catch(() => null);
      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.success) {
          setCompanyInfo(json.data || null);
          return;
        }
      }
      setCompanyInfo(null);
    } catch (e) {
      console.warn('[UserContext] 加载公司信息失败:', e);
      setCompanyInfo(null);
    }
  }, []);

  useEffect(() => {
    if (user) {
      refreshCompanyInfo();
    } else {
      setCompanyInfo(null);
    }
  }, [user, refreshCompanyInfo]);

  // #20260827-1600：全局监听微信绑定结果（bind-result → window.opener.postMessage）。
  // 任意页面/组件触发绑定成功后，自动从 DB 刷新用户状态，保证 UserContext.user 全局
  // 动态关联最新微信绑定信息（管理员/非管理员一致，不依赖各组件自行处理）。
  useEffect(() => {
    const handleWechatBound = (event: MessageEvent) => {
      const payload: any = event.data;
      if (!payload || payload.type !== 'wechat_bound' || payload.provider !== 'wechat') return;
      if (!payload.success) return;
      // 用户已登录时才需要刷新；未登录时绑定回调与当前会话无关
      if (!user) return;
      // 延迟到当前事件循环之外执行，避免与组件级监听器重复刷新冲突
      setTimeout(() => {
        refreshUser().catch(() => undefined);
      }, 100);
    };
    window.addEventListener('message', handleWechatBound);
    return () => window.removeEventListener('message', handleWechatBound);
  }, [user, refreshUser]);

  const value = {
    user,
    loading,
    isLoading: loading, // 添加 isLoading 别名
    error,
    companyInfo,
    refreshCompanyInfo,

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
    clearStaleSession,
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
