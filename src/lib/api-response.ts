/**
 * 统一 API 响应构造（#[20260901-1100] P1-6）
 *
 * 目标结构：
 * - 成功：{ success: true, code: 'OK', data, message, ...meta }
 * - 失败：{ success: false, code: ErrorCode, message, error(=message 别名，兼容存量前端), ...extra }
 *
 * 兼容约定：
 * - 存量前端普遍判断 `res.success === false` 或读取 `error` 字段，
 *   因此错误响应同时携带 message 与 error（同值），新代码请使用 code + message。
 * - 新增路由一律使用本模块；存量路由逐步迁移。
 */

import { NextResponse } from 'next/server';
import {
  ERROR_CODE_DEFAULT_MESSAGES,
  ERROR_CODE_DEFAULT_STATUS,
  type ErrorCode,
} from './error-codes';

export interface ApiSuccessBody<T = unknown> {
  success: true;
  code: 'OK';
  data: T;
  message: string;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  success: false;
  code: ErrorCode | string;
  message: string;
  /** message 的别名，兼容存量前端 */
  error: string;
  [key: string]: unknown;
}

/**
 * 构造成功响应
 * @param data 业务数据载体（统一放 data 字段）
 * @param extra 附加元数据（如分页 total/page/limit）
 */
export function apiSuccess<T = unknown>(
  data: T,
  extra?: Record<string, unknown> & { message?: string; status?: number }
): NextResponse {
  const { message = '操作成功', status = 200, ...meta } = extra ?? {};
  const body: ApiSuccessBody<T> = {
    success: true,
    code: 'OK',
    data,
    message,
    ...meta,
  };
  return NextResponse.json(body, { status });
}

/**
 * 构造错误响应（用户友好文案，禁止传入 error.message/stack 等内部细节）
 * @param code 错误码（取 ERROR_CODES）
 * @param message 可选覆盖文案（必须对用户安全）
 * @param extra.status 可选覆盖 HTTP 状态码；extra 其余字段会并入响应体
 */
export function apiError(
  code: ErrorCode | string,
  message?: string,
  extra?: Record<string, unknown> & { status?: number }
): NextResponse {
  const { status, ...rest } = extra ?? {};
  const safeMessage =
    message ??
    (ERROR_CODE_DEFAULT_MESSAGES[code as ErrorCode] || '操作失败，请稍后重试');
  const httpStatus =
    status ?? ERROR_CODE_DEFAULT_STATUS[code as ErrorCode] ?? 400;
  const body: ApiErrorBody = {
    success: false,
    code,
    message: safeMessage,
    error: safeMessage,
    ...rest,
  };
  return NextResponse.json(body, { status: httpStatus });
}
