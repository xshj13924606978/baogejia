/**
 * 简易内存限流器
 * 用于短信验证码防刷：同一手机号 60 秒冷却、每天最多 10 条
 * 生产环境建议使用 Redis 或 Supabase 持久化
 */

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

// 内存存储（单进程有效）
const store = new Map<string, RateLimitEntry>();

// 定时清理过期条目（每 5 分钟）
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.lastRequest > CLEANUP_INTERVAL) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL).unref();

interface RateLimitConfig {
  windowMs: number;       // 时间窗口（毫秒）
  maxRequests: number;    // 窗口内最大请求数
  blockDurationMs?: number; // 超限后封锁时间（毫秒）
}

const SMS_RATE_LIMITS = {
  // 同一手机号：60 秒内只能发 1 条
  perPhoneShort: { windowMs: 60 * 1000, maxRequests: 1, blockDurationMs: 60 * 1000 } as RateLimitConfig,
  // 同一手机号：每天最多 10 条
  perPhoneDaily: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 10 } as RateLimitConfig,
  // 同一 IP：每分钟最多 5 条
  perIp: { windowMs: 60 * 1000, maxRequests: 5, blockDurationMs: 5 * 60 * 1000 } as RateLimitConfig,
};

/**
 * 检查是否超出限流
 * @param key 限流键（如 `sms:phone:138xxxx`、`sms:ip:1.2.3.4`）
 * @param config 限流配置
 * @returns { allowed: boolean, retryAfterMs?: number }
 */
function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfterMs?: number; remaining?: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now - entry.firstRequest > config.windowMs) {
    // 窗口过期，重置
    entry = { count: 0, firstRequest: now, lastRequest: now };
    store.set(key, entry);
  }

  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.blockDurationMs
      ? config.blockDurationMs - (now - entry.lastRequest)
      : config.windowMs - (now - entry.firstRequest);

    if (retryAfterMs > 0) {
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }
  }

  entry.count++;
  entry.lastRequest = now;
  store.set(key, entry);

  return { allowed: true, remaining: config.maxRequests - entry.count };
}

/**
 * 短信验证码发送限流检查
 * @param phone 手机号
 * @param ip 请求 IP
 * @returns 限流结果
 */
export function checkSmsRateLimit(
  phone: string,
  ip: string
): { allowed: boolean; error?: string; retryAfterSeconds?: number } {
  // 1. 手机号短期限制（60 秒冷却）
  const shortCheck = checkRateLimit(`sms:short:${phone}`, SMS_RATE_LIMITS.perPhoneShort);
  if (!shortCheck.allowed) {
    const seconds = Math.ceil((shortCheck.retryAfterMs || 60000) / 1000);
    return { allowed: false, error: `请${seconds}秒后再试`, retryAfterSeconds: seconds };
  }

  // 2. 手机号每日限制
  const dailyCheck = checkRateLimit(`sms:daily:${phone}`, SMS_RATE_LIMITS.perPhoneDaily);
  if (!dailyCheck.allowed) {
    return { allowed: false, error: '今日短信发送次数已用完，请明天再试' };
  }

  // 3. IP 限制
  const ipCheck = checkRateLimit(`sms:ip:${ip}`, SMS_RATE_LIMITS.perIp);
  if (!ipCheck.allowed) {
    const seconds = Math.ceil((ipCheck.retryAfterMs || 300000) / 1000);
    return { allowed: false, error: '请求过于频繁，请稍后再试', retryAfterSeconds: seconds };
  }

  return { allowed: true };
}

/**
 * 登录失败限流检查（防暴力破解）
 * @param account 账号标识
 * @param ip 请求 IP
 * @param maxAttempts 最大尝试次数，默认 5
 * @param lockoutMinutes 锁定时长（分钟），默认 30
 */
export function checkLoginRateLimit(
  account: string,
  ip: string,
  maxAttempts = 5,
  lockoutMinutes = 30
): { allowed: boolean; error?: string; retryAfterSeconds?: number } {
  const LOGIN_RATE_LIMIT: RateLimitConfig = {
    windowMs: 15 * 60 * 1000,  // 15 分钟
    maxRequests: Math.max(1, maxAttempts),
    blockDurationMs: Math.max(1, lockoutMinutes) * 60 * 1000,
  };

  // 按 IP + 账号组合限流
  const key = `login:${ip}:${account}`;
  const result = checkRateLimit(key, LOGIN_RATE_LIMIT);

  if (!result.allowed) {
    const seconds = Math.ceil((result.retryAfterMs || 60000) / 1000);
    return { allowed: false, error: `登录失败次数过多，请${seconds}秒后再试`, retryAfterSeconds: seconds };
  }

  return { allowed: true };
}

/**
 * 登录成功后清除该账号的失败计数
 */
export function clearLoginFailures(account: string, ip: string): void {
  const key = `login:${ip}:${account}`;
  store.delete(key);
}
