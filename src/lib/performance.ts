/**
 * 性能监控工具（#[20260901-1100] P1-8）
 *
 * 能力：
 * 1. 慢查询日志：数据库操作耗时超过阈值时输出 [SlowQuery] 警告日志
 * 2. 通用计时包装：measureAsync 为任意异步操作计时
 *
 * 阈值均可通过环境变量调整，无需改代码：
 * - SLOW_QUERY_THRESHOLD_MS（默认 1000ms）
 *
 * 日志均输出到 PM2 stdout/stderr（生产日志统一由 PM2 接管，配合 pm2-logrotate 轮转，
 * 部署侧执行：pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 100M）。
 */

/** 慢查询阈值（毫秒） */
export const SLOW_QUERY_THRESHOLD_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 1000;

/**
 * 记录一次数据库操作耗时；超过慢查询阈值时输出警告日志
 *
 * @param operation 操作描述（如 'select products'、'exec_sql'）
 * @param durationMs 耗时毫秒
 * @param detail 可选附加上下文（表名/行数等，禁止包含敏感数据内容）
 */
export function logQueryDuration(operation: string, durationMs: number, detail?: string): void {
  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
    console.warn(
      `[SlowQuery] ${operation} ${durationMs}ms${detail ? ` | ${detail}` : ''} (阈值 ${SLOW_QUERY_THRESHOLD_MS}ms)`
    );
  }
}

/**
 * 通用异步计时包装：执行 fn 并记录耗时，慢操作输出警告日志
 *
 * @param label 日志标签（如 'QuotesService.list'）
 * @param fn 待执行异步函数
 * @param slowThresholdMs 慢操作阈值（默认取 SLOW_QUERY_THRESHOLD_MS）
 */
export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  slowThresholdMs: number = SLOW_QUERY_THRESHOLD_MS
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - start;
    if (duration >= slowThresholdMs) {
      console.warn(`[SlowOp] ${label} ${duration}ms (阈值 ${slowThresholdMs}ms)`);
    }
  }
}
