import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { verifySessionToken } from '@/lib/session-token';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 判断错误是否为数据库连接/网络类故障
 * （DNS 解析失败、fetch 失败、超时等）
 */
function isDatabaseConnectionError(error: unknown): boolean {
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
 * - 返回 null：未认证（无任何有效凭据）
 * - 抛出 AuthDatabaseError：数据库连接失败（调用方应返回 503 而非 401）
 */
export async function getCurrentUser(request: NextRequest) {
  try {
    const dbClient = getSupabaseServiceClient();

    // 优先级1: Supabase cookie
    const cookie = request.cookies.get('sb-access-token')?.value;
    if (cookie) {
      const { data: { user }, error } = await supabase.auth.getUser(cookie);
      if (!error && user) {
        const { data: businessUser } = await dbClient
          .from('users').select('id, email, role').eq('email', user.email).single();
        if (businessUser) {
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
        const { data: businessUser } = await dbClient
          .from('users').select('id, email, role').eq('email', user.email).single();
        if (businessUser) {
          return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'user', name: user.user_metadata?.name || businessUser.email };
        }
      }
    }

    // 优先级3: x-user-token header（本地登录方式，HMAC签名token，防伪造）
    const sessionToken = request.headers.get('x-user-token');
    if (sessionToken) {
      const verified = verifySessionToken(sessionToken);
      if (verified) {
        return {
          id: verified.userId,
          email: verified.email,
          role: verified.role || 'user',
          name: verified.email,
        };
      }
    }

    // 优先级4: 开发环境降级（保持向后兼容，避免影响其他未传 header 的 API）
    if (process.env.NODE_ENV === 'development') {
      const { data: businessUser } = await dbClient
        .from('users').select('id, email, role').eq('email', 'admin2@test.com').single();
      if (businessUser) {
        return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'user' };
      }
    }

    return null;
  } catch (error) {
    // 区分错误类型：
    // - 数据库连接失败（DNS、网络、超时）→ 抛出 AuthDatabaseError，调用方应返回 503
    // - 其他错误（如 JSON 解析、代码 bug）→ 记录日志，按未认证处理返回 null
    if (isDatabaseConnectionError(error)) {
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
        errorResponse: NextResponse.json({ error: '未认证' }, { status: 401 }),
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
    // 非预期错误，按 500 处理
    console.error('[Auth] requireAuth 意外错误:', error);
    return {
      user: null,
      errorResponse: NextResponse.json({ error: '服务器内部错误' }, { status: 500 }),
    };
  }
}

/**
 * 管理员认证校验辅助函数
 * 同时检查认证状态和管理员权限（role 为 admin 或 super_admin）
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

export async function requireAdmin(request: NextRequest): Promise<AdminSuccess | AdminFailure> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return {
        user: null,
        errorResponse: NextResponse.json({ error: '未认证' }, { status: 401 }),
      };
    }
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return {
        user: null,
        errorResponse: NextResponse.json({ error: '权限不足，需要管理员权限' }, { status: 403 }),
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
