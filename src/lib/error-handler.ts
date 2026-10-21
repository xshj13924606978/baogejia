/**
 * 统一错误处理（#[20260901-1100] P0-2 / P1-6 / P1-9）
 *
 * 核心能力：
 * 1. safeErrorMessage：错误消息脱敏——生产环境返回用户友好兜底文案，
 *    开发环境返回真实 error.message 便于调试；服务端日志始终使用真实错误。
 * 2. withErrorHandler：API 路由顶层异常捕获包装器，handler 抛出的异常
 *    统一转为脱敏的 500 响应，杜绝内部细节泄露与未捕获异常。
 */

import { NextResponse } from 'next/server';
import { apiError } from './api-response';
import { ERROR_CODES } from './error-codes';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const DEFAULT_FALLBACK = '服务器内部错误，请稍后重试';

/**
 * 提取真实错误消息（仅供服务端日志使用，禁止直接返回给客户端）
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * 客户端安全的错误消息（#[20260901-1100] P0-2）
 *
 * - 生产环境：永远返回 fallback（用户友好文案），不暴露 error.message
 *   （其中可能包含 SQL 细节、表名列名、第三方网关原始错误、内网地址等）
 * - 非生产环境：返回真实 error.message，便于本地调试
 *
 * @param error 捕获到的异常
 * @param fallback 用户友好兜底文案（可按场景定制，如 '获取客户列表失败'）
 */
export function safeErrorMessage(error: unknown, fallback: string = DEFAULT_FALLBACK): string {
  if (IS_PRODUCTION) return fallback;
  return toErrorMessage(error) || fallback;
}

/**
 * API 路由顶层异常捕获包装器（#[20260901-1100] P1-9）
 *
 * 用法：
 * ```ts
 * export const GET = withErrorHandler(async (request) => {
 *   // 业务代码，抛出的异常会被统一捕获并脱敏
 * }, 'QuotesAPI');
 * ```
 *
 * @param handler 路由处理器（可带 NextJS 动态路由 ctx 第二参数）
 * @param label 日志标签（一般为路由名），用于定位日志来源
 * @param fallbackMessage 生产环境返回给客户端的兜底文案
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  label: string = 'API',
  fallbackMessage: string = DEFAULT_FALLBACK
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      // 服务端日志保留完整错误（含 stack），客户端只收到脱敏文案
      console.error(`[${label}] 未捕获异常:`, error);
      return apiError(ERROR_CODES.SYS_INTERNAL_ERROR, safeErrorMessage(error, fallbackMessage), {
        status: 500,
      });
    }
  }) as T;
}
