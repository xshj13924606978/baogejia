import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { verifySessionToken } from '@/lib/session-token';
import { getUserSessionState, SessionStateUnavailableError } from '@/lib/session-version';
import { apiError } from '@/lib/api-response';
import { ERROR_CODES } from '@/lib/error-codes';
import { safeErrorMessage } from '@/lib/error-handler';
import {
  normalizeRole,
  loadAdminRoleCodes,
} from './admin-role-helper';

// 角色归一化（兼容历史 token 中的中文角色）和管理员角色集加载
// 都集中在 admin-role-helper 中，本文件仅做 requireAdmin/requireAuth 等路由 helper

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 判断错误是否为数据库连接/网络类故障
 * （DNS 解析失败、fetch 失败、超时等）
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|NXDOMAIN|network|timeout/i.test(msg) ||
    (error instanceof TypeError && /fetch/i.test(msg))
  );
}

/**
 * 获取当前用户身份
 *
 * 认证优先级（从高到低）：
 * 1. Supabase cookie (sb-access-token)  — OAuth 登录
 * 2. Authorization Bearer token           — Supabase JWT
 * 3. x-user-token header                  — 本地登录方式（HMAC签名token，防伪造）
 * 4. 开发环境降级                         — 仅 NODE_ENV=development 时生效，避免影响生产环境
 *
 * 返回值：
 * - 正常返回用户对象：认证成功
 * - 返回 null：未认证（无任何有效凭据）或账号不可用（已禁用/已删除）
 * - 抛出 AuthDatabaseError：数据库连接失败（调用方应返回 503 而非 401）
 *
 * #[20260831-1700] P0-1：三个认证分支均增加账号可用性校验。
 * 此前仅校验 HMAC 签名与 session_version，不查 users.status，
 * 导致管理员禁用/删除用户后，已签发 token 仍可调用全部业务 API。
 * 现在：用户行不存在 / deleted_at 非空 / status 非 'active' → 一律视为未认证。
 */
export async function getCurrentUser(request: NextRequest) {
  try {
    const dbClient = getSupabaseServiceClient();

    // 优先级1: Supabase cookie
    const cookie = request.cookies.get('sb-access-token')?.value;
    if (cookie) {
      const { data: { user }, error } = await supabase.auth.getUser(cookie);
      if (!error && user) {
        const { data: businessUser, error: businessError } = await dbClient
          .from('users').select('id, email, role, status').eq('email', user.email).maybeSingle();
        if (businessError) throw new SessionStateUnavailableError(businessError);
        if (businessUser) {
          // P0-1：账号被禁用/删除 → 视为未认证
          const st = (businessUser as any).status as string | null;
          if (st !== null && st !== 'active') return null;
          const state = await getUserSessionState(businessUser.id);
          if (!state.exists || state.deletedAt || (state.status !== null && state.status !== 'active')) return null;
          return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'user', name: user.user_metadata?.name || businessUser.email };
        }
      }
    }

    // 优先级2: Authorization Bearer token
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        const { data: businessUser, error: businessError } = await dbClient
          .from('users').select('id, email, role, status').eq('email', user.email).maybeSingle();
        if (businessError) throw new SessionStateUnavailableError(businessError);
        if (businessUser) {
          // P0-1：账号被禁用/删除 → 视为未认证
          const st = (businessUser as any).status as string | null;
          if (st !== null && st !== 'active') return null;
          const state = await getUserSessionState(businessUser.id);
          if (!state.exists || state.deletedAt || (state.status !== null && state.status !== 'active')) return null;
          return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'user', name: user.user_metadata?.name || businessUser.email };
        }
      }
    }

    // 优先级3: x-user-token header 或 httpOnly session_token cookie（本地登录方式，HMAC签名token，防伪造）
    // cookie 兜底：公开路径（如 /api/contributor/*）下 middleware 不会注入 header，
    // 但登录接口会同时写入 httpOnly cookie，这里直接读取 cookie 即可恢复认证，不依赖前端 localStorage
    const sessionToken = request.headers.get('x-user-token') || request.cookies.get('session_token')?.value;
    if (sessionToken) {
      const verified = verifySessionToken(sessionToken);
      if (verified) {
        // P0-1 + #[20260829-1700]：一次查询同时拿到会话版本与账号状态，
        // 避免认证热路径上重复查询数据库
        const state = await getUserSessionState(verified.userId);

        // 「全部设备登出」撤销检查：token 版本落后 → 视为未认证
        if ((Number(verified.sessionVersion) || 0) < state.sessionVersion) {
          return null;
        }
        // 账号已被物理删除或软删除 → 视为未认证
        if (!state.exists || state.deletedAt) {
          return null;
        }
        // 账号被禁用/停用（status 非 active）→ 视为未认证，禁用立即生效
        if (state.status !== null && state.status !== 'active') {
          return null;
        }

        return {
          id: verified.userId,
          email: verified.email,
          role: state.role || 'user',
          name: verified.email,
        };
      }
    }

    return null;
  } catch (error) {
    // 区分错误类型：
    // - 数据库连接失败（DNS、网络、超时）→ 抛出 AuthDatabaseError，调用方应返回 503
    // - 其他错误（如 JSON 解析、代码 bug）→ 记录日志，按未认证处理返回 null
    if (error instanceof SessionStateUnavailableError || isDatabaseConnectionError(error)) {
      console.error('[Auth] 数据库连接失败:', error instanceof Error ? error.message : error);
      throw new AuthDatabaseError('数据库连接失败，服务暂不可用', { cause: error });
    }
    console.error('[Auth] 获取用户失败:', error);
    return null;
  }
}

/**
 * 数据库连接失败错误
 * 调用方捕获后应返回 503 Service Unavailable，而非 401 Unauthorized
 */
export class AuthDatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AuthDatabaseError';
  }
}

/**
 * 统一的认证校验辅助函数
 *
 * 使用方式：
 * ```ts
 * const { user, errorResponse } = await requireAuth(request);
 * if (errorResponse) return errorResponse; // 401 或 503 已自动构造
 * // 此后可安全使用 user（TypeScript 知道此处 user 非空）
 * ```
 *
 * 返回值：
 * - 认证成功：{ user, errorResponse: null }
 * - 未认证（无凭据）：{ user: null, errorResponse: 401 }
 * - 数据库故障：{ user: null, errorResponse: 503 }
 */
type AuthSuccess = { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; errorResponse: null };
type AuthFailure = { user: null; errorResponse: NextResponse };

export async function requireAuth(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return {
        user: null,
        // #[20260901-1100] P1-5：统一响应结构 { success:false, code, message, error }
        errorResponse: apiError(ERROR_CODES.AUTH_UNAUTHORIZED, '未认证', { status: 401 }),
      };
    }
    return { user, errorResponse: null };
  } catch (error) {
    if (error instanceof AuthDatabaseError) {
      return {
        user: null,
        // #[20260901-1100] P0-2/P1-5：detail 生产脱敏 + 统一响应结构
        errorResponse: apiError(ERROR_CODES.SYS_SERVICE_UNAVAILABLE, '服务暂不可用，请稍后重试', {
          status: 503,
          detail: safeErrorMessage(error, '数据库服务异常'),
        }),
      };
    }
    // 非预期错误，按 500 处理
    console.error('[Auth] requireAuth 意外错误:', error);
    return {
      user: null,
      errorResponse: apiError(ERROR_CODES.SYS_INTERNAL_ERROR, '服务器内部错误', { status: 500 }),
    };
  }
}

/**
 * 管理员认证校验辅助函数（数据库角色集驱动，0 硬编码 ADMIN_ROLES）
 *
 * 通过 admin-role-helper.loadAdminRoleCodes() 从数据库 roles 表实时读取管理员角色集。
 *   - 数据库迁移 075_unified_admin_roles.sql 应用后 → 实时联动 roles.is_admin=true
 *   - 未应用迁移 → fallback 包含中文/英文/全大写历史角色值（兼容 token role 字段）
 *
 * 替换历史硬编码 `user.role !== 'admin' && user.role !== 'super_admin'` 反模式。
 *
 * 使用方式：
 * ```ts
 * const { user, errorResponse } = await requireAdmin(request);
 * if (errorResponse) return errorResponse; // 401/403/503 已自动构造
 * // 此后可安全使用 user
 * ```
 */
type AdminSuccess = { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; errorResponse: null };
type AdminFailure = { user: null; errorResponse: NextResponse };

async function isAdminRole(userRoleStr: string): Promise<boolean> {
  const normalized = normalizeRole(userRoleStr);
  const supabase = getSupabaseServiceClient();
  const allowed = await loadAdminRoleCodes(supabase);
  return allowed.some((r) => normalizeRole(String(r)) === normalized);
}

export async function requireAdmin(request: NextRequest): Promise<AdminSuccess | AdminFailure> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return {
        user: null,
        errorResponse: NextResponse.json({ error: '未认证' }, { status: 401 }),
      };
    }
    // 数据库角色集驱动：token.role 经过 normalizeRole 后与 DB roles.is_admin=true 比较
    // 兼容中文 token role、历史大写角色、未来 roles 表内任意管理员新角色
    if (!(await isAdminRole(user.role || ''))) {
      return {
        user: null,
        errorResponse: NextResponse.json(
          {
            error: '权限不足',
            code: 'ADMIN_REQUIRED',
            userRole: user.role,
            hint: '请联系超管在数据库 roles 表（is_admin=true）确认你的角色；生产环境请运行迁移 075_unified_admin_roles.sql',
          },
          { status: 403 }
        ),
      };
    }
    return { user, errorResponse: null };
  } catch (error) {
    if (error instanceof AuthDatabaseError) {
      return {
        user: null,
        errorResponse: NextResponse.json(
          { error: '服务暂不可用，请稍后重试', detail: error.message },
          { status: 503 }
        ),
      };
    }
    console.error('[Auth] requireAdmin 意外错误:', error);
    return {
      user: null,
      errorResponse: NextResponse.json({ error: '服务器内部错误' }, { status: 500 }),
    };
  }
}

// 用于客户端的 hook（已迁移到 client-utils.ts）
export function getClientUser() {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) return JSON.parse(userStr);
  } catch (e) {
    console.error('[Auth] 解析用户数据失败:', e);
  }
  return null;
}
