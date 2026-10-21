/**
 * 会话版本管理（#[20260829-1700]）
 *
 * 「全部设备登出」真实生效的支撑：
 * - users.session_version（迁移 093）为当前用户的会话版本号；
 * - 签发 token 时把当前版本号嵌入 payload；
 * - 校验路径（verify-session / getCurrentUser）比对 token 内版本号与 DB 当前值，
 *   小于当前值即判定该会话已被撤销（强制重新登录）；
 * - logoutAllDevices 递增版本号，使所有已签发 token 一次性失效。
 *
 * #[20260831-1700] P0-1：新增用户可用状态查询（getUserSessionState / isUserActive）。
 * 此前 getCurrentUser 仅校验 HMAC 签名与 session_version，不查 users.status，
 * 导致管理员禁用/删除用户后，已签发 token 仍可调用全部业务 API。
 * 本文件统一提供「一次查询拿到 会话版本 + 状态 + 软删除标记」的能力，
 * 避免认证热路径上重复查询数据库。
 */
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { signSessionToken } from '@/lib/session-token';

/** 读取当前版本；查询不可用时拒绝继续，避免将已撤销会话当作版本 0。 */
export async function getUserSessionVersion(userId: string): Promise<number> {
  const state = await getUserSessionState(userId);
  if (!state.exists || state.deletedAt || (state.status !== null && state.status !== 'active')) {
    throw new SessionStateUnavailableError(new Error('Account unavailable'));
  }
  return state.sessionVersion;
}

/** 用户会话状态快照（#[20260831-1700] P0-1） */
export interface UserSessionState {
  /** 当前会话版本号 */
  sessionVersion: number;
  /** 当前数据库角色；不能使用旧 token 角色进行授权。 */
  role: string | null;
  /** users.status 原值（null 视为 active） */
  status: string | null;
  /** 软删除时间（迁移 124 新增列）；null = 未删除 */
  deletedAt: string | null;
  /** 用户行是否存在 */
  exists: boolean;
}

/**
 * 一次查询获取「会话版本 + 账号状态 + 软删除标记」（#[20260831-1700] P0-1）
 *
 * 兼容降级：迁移 124 未应用时 users 表没有 deleted_at 列，
 * select 会失败，此时自动降级为只查 session_version + status，
 * deletedAt 置 null（按未删除处理），保证老库环境不被误登出。
 */
export class SessionStateUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Account state temporarily unavailable', { cause });
    this.name = 'SessionStateUnavailableError';
  }
}

export async function getUserSessionState(userId: string): Promise<UserSessionState> {
  const db = getSupabaseServiceClient();
  let row: Record<string, any> | null = null;

  try {
    const result = await db.from('users')
      .select('session_version, status, deleted_at, role').eq('id', userId).maybeSingle();
    if (result.error) {
      // Only a confirmed missing deleted_at column permits legacy-schema fallback.
      const { code, message } = result.error;
      if (!(['42703', 'PGRST204'].includes(code) && /deleted_at/i.test(message))) {
        throw result.error;
      }
      const legacy = await db.from('users')
        .select('session_version, status, role').eq('id', userId).maybeSingle();
      if (legacy.error) throw legacy.error;
      row = legacy.data ? { ...legacy.data, deleted_at: null } : null;
    } else {
      row = result.data;
    }
  } catch (error) {
    throw new SessionStateUnavailableError(error);
  }

  if (!row) {
    return { sessionVersion: 0, role: null, status: null, deletedAt: null, exists: false };
  }

  return {
    sessionVersion: Number(row.session_version) || 0,
    role: (row.role as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    exists: true,
  };
}

/**
 * 判定账号是否可用（#[20260831-1700] P0-1）
 * - 用户行不存在 → 不可用（已被物理删除）
 * - deleted_at 非空 → 不可用（软删除）
 * - status 非 'active'（含 'disabled'/'suspended'/'deleted'/'pending' 等）→ 不可用
 * - 查询失败 → 抛出服务不可用错误，不授予未经确认的访问权限
 */
export async function isUserActive(userId: string): Promise<boolean> {
  const state = await getUserSessionState(userId);
  if (!state.exists) return false;
  if (state.deletedAt) return false;
  return state.status === null || state.status === 'active';
}

/** 判定 token 携带的版本号是否已落后于 DB 当前值（已撤销） */
export async function isSessionRevoked(userId: string, tokenVersion: number): Promise<boolean> {
  const state = await getUserSessionState(userId);
  if (!state.exists || state.deletedAt || (state.status !== null && state.status !== 'active')) return true;
  return (Number(tokenVersion) || 0) < state.sessionVersion;
}

/** 递增用户会话版本号，使全部已签发 token 失效（「全部设备登出」） */
export async function revokeAllUserSessions(userId: string): Promise<boolean> {
  try {
    const db = getSupabaseServiceClient();
    const current = await getUserSessionVersion(userId);
    const { error } = await db
      .from('users')
      .update({ session_version: current + 1 })
      .eq('id', userId);
    if (error) {
      console.error('[SessionVersion] 递增会话版本失败:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[SessionVersion] revokeAllUserSessions 异常:', error);
    return false;
  }
}

/**
 * 携带当前会话版本号签发 token（统一入口，替代裸 signSessionToken）。
 * 用户行不存在/读取失败时按版本 0 签发，不阻塞登录流程。
 */
export async function signSessionTokenForUser(
  userId: string,
  email: string,
  role: string,
  ttlSeconds = 7 * 24 * 3600
): Promise<string> {
  const version = await getUserSessionVersion(userId);
  return signSessionToken(userId, email, role, ttlSeconds, version);
}
