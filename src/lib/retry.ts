/**
 * 统一重试模块（#[20260901-1100] P1-7）
 *
 * 策略：指数退避 + 全抖动（Full Jitter），避免多实例同时重试造成的惊群效应。
 * 延迟序列：random(0, min(maxDelay, baseDelay * 2^attempt))
 *
 * 适用：外部 HTTP 调用（AI 网关、短信、支付、OCR Service）等存在瞬时故障的场景。
 * 注意：仅对可重试错误（网络错误 / 429 / 5xx / 超时）重试，业务错误（4xx）不重试。
 */

export interface RetryOptions {
  /** 最大重试次数（不含首次调用），默认 2（即最多调用 3 次） */
  retries?: number;
  /** 基础退避毫秒数，默认 500 */
  baseDelayMs?: number;
  /** 最大退避毫秒数，默认 8000 */
  maxDelayMs?: number;
  /** 自定义错误可重试判定，默认 isRetryableError */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** 每次重试前回调（用于日志），attempt 从 1 开始 */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
  retries: 2,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 默认可重试错误判定：网络层错误、HTTP 429、HTTP 5xx、超时
 */
export function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // 网络瞬断 / DNS / 超时
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|timeout|timed out/i.test(message)) {
    return true;
  }
  // HTTP 状态码：429 限流 / 5xx 服务端错误
  const status =
    (error as { status?: number })?.status ??
    (error as { statusCode?: number })?.statusCode ??
    (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number') {
    return status === 429 || status >= 500;
  }
  if (/\b(429|5\d{2})\b/.test(message) && /too many|rate limit|internal|bad gateway|unavailable|server error/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * 带指数退避+抖动的重试执行
 *
 * @param fn 待执行的异步函数
 * @param options 重试配置
 * @returns fn 的成功结果；重试耗尽后抛出最后一次错误
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries, baseDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };
  const shouldRetry = options.shouldRetry ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error, attempt + 1)) {
        throw error;
      }
      // 指数退避上界 + 全抖动：random(0, min(maxDelay, base * 2^attempt))
      const backoffCap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = Math.floor(Math.random() * backoffCap);
      options.onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
