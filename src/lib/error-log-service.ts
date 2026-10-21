/**
 * 系统异常日志服务（#[20260831-1700] P1-6）
 *
 * 背景：此前全系统异常仅 `console.error` 输出到 stdout（PM2 日志），
 * 无结构化落库、无堆栈留存、无法按用户/接口/时间查询，线上故障难以定位。
 *
 * 本服务提供：
 *  1. `logSystemError()`  —— 异常落库到 `system_error_logs`（迁移 124 新建）
 *  2. `captureException()` —— 便捷捕获：打印控制台 + 落库
 *  3. `withErrorCapture()` —— API 路由包装器：统一 try/catch，
 *     捕获未处理异常 → 落库（含堆栈）→ 返回统一 500 JSON，
 *     避免 Next.js 返回 HTML 错误页导致前端 JSON.parse 失败。
 *
 * 设计原则：
 * - 日志写入失败绝不阻断主流程（异步落库，失败仅 console）
 * - 禁止任何模拟数据，堆栈/消息均来自真实异常对象
 * - 敏感信息（Authorization、cookie、密码）不写入日志
 */
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export type ErrorLevel = 'error' | 'warn' | 'fatal';

export interface LogSystemErrorInput {
  /** 消息（必填） */
  message: string;
  /** 异常对象（自动提取 type / stack） */
  error?: unknown;
  /** 级别，默认 error */
  level?: ErrorLevel;
  /** 来源标识：api / lib / scheduler / route 名 */
  source?: string;
  /** 请求方法与路径 */
  requestMethod?: string;
  requestPath?: string;
  /** HTTP 状态码（已知时） */
  statusCode?: number;
  /** 关联用户 */
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** 附加上下文（已裁剪敏感字段） */
  metadata?: Record<string, unknown>;
}

/** 需要脱敏的键名（不写入日志） */
const SENSITIVE_KEYS = [
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'token',
  'authorization',
  'cookie',
  'session_token',
  'access_token',
  'smtp_password',
  'secret',
];

/** 裁剪对象中的敏感字段（浅层，够用且避免深度递归开销） */
function sanitizeMetadata(input?: Record<string, unknown>): Record<string, unknown> | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** 提取异常堆栈（最多保留 4000 字符，避免单条日志过大） */
function extractStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) {
    return error.stack.slice(0, 4000);
  }
  if (typeof error === 'string') return null;
  try {
    return String(error).slice(0, 4000);
  } catch {
    return null;
  }
}

function extractErrorType(error: unknown): string | null {
  if (error instanceof Error) return error.name || 'Error';
  if (error === null || error === undefined) return null;
  return typeof error;
}

/**
 * 写入系统异常日志。异步非阻塞，失败仅打印。
 * @returns 是否写入成功（调用方通常无需关心）
 */
export async function logSystemError(input: LogSystemErrorInput): Promise<boolean> {
  try {
    const supabase = getSupabaseServiceClient();

    // ip_address 为 inet 类型，非法值置 null
    let ip: string | null = input.ipAddress ?? null;
    if (ip && !/^[0-9a-fA-F.:]+$/.test(ip)) ip = null;

    const { error } = await supabase.from('system_error_logs').insert({
      level: input.level ?? 'error',
      source: input.source ?? null,
      error_type: extractErrorType(input.error),
      message: String(input.message).slice(0, 2000),
      stack: extractStack(input.error),
      request_method: input.requestMethod ?? null,
      request_path: input.requestPath ?? null,
      status_code: input.statusCode ?? null,
      user_id: input.userId ?? null,
      ip_address: ip,
      user_agent: input.userAgent ?? null,
      metadata: sanitizeMetadata(input.metadata) ?? null,
    });

    if (error) {
      console.error('[ErrorLog] 写入异常日志失败:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ErrorLog] 写入异常日志异常:', err);
    return false;
  }
}

/**
 * 便捷捕获：既打印控制台（保留既有运维习惯），又落库（新增）。
 * 不 await，避免阻塞主流程。
 */
export function captureException(
  error: unknown,
  context: Omit<LogSystemErrorInput, 'message' | 'error'> & { message?: string } = {}
): void {
  const message =
    context.message ?? (error instanceof Error ? error.message : String(error ?? '未知异常'));
  console.error(`[${context.source ?? 'app'}] ${message}`, error);
  void logSystemError({ ...context, message, error });
}

/**
 * API 路由统一异常包装器（#[20260831-1700] P1-6）
 *
 * 用法：
 * ```ts
 * export const GET = withErrorCapture('GET /api/admin/logs', async (request) => {
 *   // 业务逻辑，抛出的异常会被自动捕获落库
 *   return NextResponse.json({ success: true });
 * });
 * ```
 *
 * 行为：
 * - 正常执行 → 原样返回 handler 结果
 * - 抛出异常 → 落库（含堆栈）→ 返回统一 500 JSON（而非 HTML 错误页）
 */
export function withErrorCapture<TArgs extends any[]>(
  source: string,
  handler: (...args: TArgs) => Promise<NextResponse>
) {
  return async (...args: TArgs): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args.find(
        (a): a is Request => typeof a === 'object' && a !== null && typeof (a as any).headers?.get === 'function'
      ) as Request | undefined;

      let url: string | null = null;
      let method: string | null = null;
      try {
        url = request?.url ?? null;
        method = request?.method ?? null;
      } catch {
        /* 忽略 URL 解析失败 */
      }

      await logSystemError({
        error,
        source,
        message: error instanceof Error ? error.message : '未处理异常',
        requestMethod: method ?? undefined,
        requestPath: url ?? undefined,
        statusCode: 500,
        ipAddress:
          request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request?.headers.get('x-real-ip') ||
          null,
        userAgent: request?.headers.get('user-agent') ?? null,
      });

      return NextResponse.json(
        {
          error: '服务器内部错误',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  };
}
