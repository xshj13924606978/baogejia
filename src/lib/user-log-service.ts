import { createHash } from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 用户操作日志服务（服务端专用）
 * 通过 service_role 写入 user_logs 表（绕过 RLS），
 * RLS 禁止 anon 直接 INSERT，因此所有写入必须经此服务端入口。
 *
 * #[20260831-1700] P1-10：新增 `deriveSessionId()`。
 * user_logs.session_id 原为 uuid 类型，而会话标识只能由 session token 派生
 * （32 位 hex 字符串），类型不匹配导致插入被拒绝/回退为 NULL，
 * 造成 134 条日志中 131 条 session_id 为空，无法做会话级行为串联。
 * 迁移 124 已把该列放宽为 text，本函数提供稳定的会话标识生成。
 */

/** 允许记录的操作类型白名单（#[20260829-1700] 补充账号安全操作类型；#[20260831-1700] 补 login_failed） */
export const USER_LOG_ACTION_TYPES = [
  'login',
  'login_failed',
  'logout',
  'upload',
  'download',
  'delete',
  'update',
  'view',
  'share',
  'export',
  'search',
  'bind',
  'unbind',
  'rebind',
  'logout_all',
  'delete_account',
  'set_password',
  'reset_password',
] as const;

export type UserLogActionType = (typeof USER_LOG_ACTION_TYPES)[number];

export interface UserLogInput {
  /** 操作用户 ID */
  userId: string;
  /** 操作类型 */
  actionType: UserLogActionType;
  /** 操作详情 JSON（可选） */
  actionDetails?: Record<string, unknown>;
  /** 客户端 IP（可选） */
  ipAddress?: string | null;
  /** 客户端 User-Agent（可选） */
  userAgent?: string | null;
  /** 会话 ID（可选） */
  sessionId?: string | null;
  /** 操作耗时毫秒（可选） */
  durationMs?: number | null;
}

/** 校验操作类型是否合法 */
export function isValidUserLogActionType(actionType: string): actionType is UserLogActionType {
  return (USER_LOG_ACTION_TYPES as readonly string[]).includes(actionType);
}

/**
 * 记录一条用户操作日志。
 * 失败时仅打印错误，不抛出异常（日志写入不应影响主业务）。
 */
export async function logUserAction(input: UserLogInput): Promise<boolean> {
  try {
    if (!input.userId) return false;
    if (!isValidUserLogActionType(input.actionType)) return false;

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from('user_logs').insert({
      user_id: input.userId,
      action_type: input.actionType,
      action_details: input.actionDetails ?? {},
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      session_id: input.sessionId ?? null,
      duration_ms: input.durationMs ?? null,
    });

    if (error) {
      console.error('[user-log] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[user-log] unexpected error:', err);
    return false;
  }
}

/**
 * 批量记录多条用户操作日志（如批量导入/批量删除）。
 */
export async function logUserActions(inputs: UserLogInput[]): Promise<boolean> {
  try {
    const valid = inputs.filter(
      (i) => i.userId && isValidUserLogActionType(i.actionType),
    );
    if (valid.length === 0) return false;

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from('user_logs').insert(
      valid.map((i) => ({
        user_id: i.userId,
        action_type: i.actionType,
        action_details: i.actionDetails ?? {},
        ip_address: i.ipAddress ?? null,
        user_agent: i.userAgent ?? null,
        session_id: i.sessionId ?? null,
        duration_ms: i.durationMs ?? null,
      })),
    );

    if (error) {
      console.error('[user-log] batch insert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[user-log] batch unexpected error:', err);
    return false;
  }
}

/**
 * 清理 90 天前的日志（供 scheduler 每日调用）。
 * @returns 删除的行数，失败返回 -1
 */
export async function cleanupOldUserLogs(): Promise<number> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.rpc('cleanup_old_user_logs');
    if (error) {
      console.error('[user-log] cleanup failed:', error.message);
      return -1;
    }
    return typeof data === 'number' ? data : 0;
  } catch (err) {
    console.error('[user-log] cleanup unexpected error:', err);
    return -1;
  }
}

/**
 * 从 Next.js Request 提取客户端 IP（兼容代理链）。
 */
export function extractClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // 取链中第一个（真实客户端）
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return null;
}

/**
 * 由 session token 派生稳定的会话标识（#[20260831-1700] P1-10）
 *
 * 同一个 token 在有效期内派生结果恒定，因此同一会话下的所有操作
 * 共享同一个 session_id，可据此串联完整操作序列（此前该字段 97% 为空）。
 *
 * @param sessionToken HMAC session token（x-user-token / session_token cookie）
 * @returns 32 位小写 hex 字符串；无 token 时返回 null
 */
export function deriveSessionId(sessionToken?: string | null): string | null {
  if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length === 0) {
    return null;
  }
  try {
    return createHash('sha256').update(sessionToken, 'utf8').digest('hex').slice(0, 32);
  } catch {
    return null;
  }
}

/**
 * 从 NextRequest 提取会话标识（#[20260831-1700] P1-10）
 * 依次尝试 x-user-token header 与 httpOnly session_token cookie，
 * 与 auth-utils.getCurrentUser 的取值顺序保持一致。
 */
export function extractSessionId(req: Request): string | null {
  const headerToken =
    req.headers.get('x-user-token') ??
    // NextRequest 才有 cookies，普通 Request 需兜底解析
    (() => {
      const cookieHeader = req.headers.get('cookie');
      if (!cookieHeader) return null;
      const match = cookieHeader.match(/(?:^|;\s*)session_token=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    })();
  return deriveSessionId(headerToken);
}
