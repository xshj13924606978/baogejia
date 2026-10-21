/**
 * 前端用户操作日志上报工具
 *
 * 用法：
 * ```ts
 * import { trackUserAction } from '@/lib/user-log-tracker';
 * trackUserAction('download', { file_name: 'xxx' });
 * ```
 *
 * 特性：
 * - fire-and-forget：失败静默，不影响主流程
 * - 自动生成/复用 session_id（sessionStorage 持久化到标签页关闭）
 * - 未登录时不上报（静默跳过）
 * - 支持 duration 计时：trackUserAction('download', {...}, { durationMs }) 或
 *   const end = startTrack(); ... end('download', {...});
 */

/** 与 user-log-service.ts 保持一致的 action_type 白名单 */
export const USER_LOG_ACTION_TYPES = [
  'login',
  'logout',
  'upload',
  'download',
  'delete',
  'update',
  'view',
  'share',
  'export',
  'search',
] as const;

export type UserLogActionType = (typeof USER_LOG_ACTION_TYPES)[number];

const SESSION_KEY = 'user_log_session_id';
const TRACK_ENDPOINT = '/api/user-logs';

/** 获取或生成当前会话 ID（标签页生命周期内稳定） */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

interface TrackOptions {
  sessionId?: string | null;
  durationMs?: number;
}

/**
 * 上报一条用户操作日志（fire-and-forget）。
 * 未登录时静默跳过（服务端会再次校验身份）。
 */
export function trackUserAction(
  actionType: UserLogActionType,
  actionDetails?: Record<string, unknown>,
  options?: TrackOptions,
): void {
  if (typeof window === 'undefined') return;

  // 未登录直接跳过，避免无谓请求
  try {
    if (!localStorage.getItem('user')) return;
  } catch {
    return;
  }

  const payload = {
    actionType,
    actionDetails: actionDetails ?? {},
    sessionId: options?.sessionId ?? getSessionId(),
    durationMs: options?.durationMs ?? null,
  };

  fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // 静默失败，不影响用户操作
  });
}

/**
 * 创建一个带计时的跟踪器：
 * const stop = trackStart();
 * // ... 操作 ...
 * stop('download', { file_name: 'x' }); // 自动带上耗时
 */
export function trackStart(): (
  actionType: UserLogActionType,
  actionDetails?: Record<string, unknown>,
) => void {
  const startTime = performance.now();
  return (actionType, actionDetails) => {
    trackUserAction(actionType, actionDetails, {
      durationMs: Math.round(performance.now() - startTime),
    });
  };
}
