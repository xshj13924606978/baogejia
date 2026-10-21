/**
 * 短信验证码：生成 / 入库 / 校验 / 消费
 * 存储于 Supabase 表 sms_verification_codes（迁移 057）
 * 仅服务端调用（service role，绕过 RLS）
 */
import { randomInt } from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/** 验证码有效期（秒），默认 5 分钟 */
export const SMS_CODE_TTL_SECONDS = Math.max(60, Number(process.env.SMS_CODE_TTL_SECONDS || 300));
/** 验证码最大尝试次数 */
export const SMS_MAX_ATTEMPTS = Math.max(1, Number(process.env.SMS_MAX_ATTEMPTS || 5));
export const SMS_CODE_LENGTH = 6;

/** 短信发送频率限制（多实例共享，持久化到 sms_verification_codes 表） */
export const SMS_SEND_COOLDOWN_MS = 60 * 1000; // 同一手机号 60s 冷却
export const SMS_SEND_DAILY_LIMIT = 10; // 同一手机号每日上限

export type SmsPurpose = 'register' | 'bind' | 'general';

const ALLOWED_PURPOSES = new Set<SmsPurpose>(['register', 'bind', 'general']);

export function isAllowedPurpose(purpose: unknown): purpose is SmsPurpose {
  return typeof purpose === 'string' && ALLOWED_PURPOSES.has(purpose as SmsPurpose);
}

/** 生成 6 位数字验证码（加密随机源） */
export function generateSmsCode(): string {
  let code = '';
  for (let i = 0; i < SMS_CODE_LENGTH; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/** 作废某手机号所有未消费验证码（防止旧码继续使用） */
export async function invalidatePhoneCodes(phone: string): Promise<void> {
  const db = getSupabaseServiceClient();
  await db
    .from('sms_verification_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('phone', phone)
    .is('consumed_at', null);
}

/** 写入一条验证码记录 */
export async function createSmsCodeRecord(
  phone: string,
  code: string,
  purpose: SmsPurpose,
  ip?: string
): Promise<void> {
  const db = getSupabaseServiceClient();
  await db.from('sms_verification_codes').insert({
    phone,
    code,
    purpose,
    attempts: 0,
    max_attempts: SMS_MAX_ATTEMPTS,
    expires_at: new Date(Date.now() + SMS_CODE_TTL_SECONDS * 1000).toISOString(),
    ip: ip || null,
  });
}

/**
 * 校验并消费验证码（一次性）
 * 规则：取该手机号 + purpose 下最新一条未消费记录
 *       - 过期 / 尝试超限 / 错误均失败，尝试超限后直接作废记录
 */
export async function verifySmsCode(
  phone: string,
  code: string,
  purpose: SmsPurpose = 'general'
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabaseServiceClient();
  const normalizedPhone = phone.trim();

  const { data: records, error } = await db
    .from('sms_verification_codes')
    .select('*')
    .eq('phone', normalizedPhone)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[SMS] 查询验证码失败:', error.message);
    return { ok: false, error: '验证码校验失败，请稍后再试' };
  }

  const record = records?.[0];
  if (!record) return { ok: false, error: '请先获取验证码' };

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, error: '验证码已过期，请重新获取' };
  }

  if (record.attempts >= record.max_attempts) {
    // 尝试次数超限：作废该记录，防止继续爆破
    await db
      .from('sms_verification_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', record.id);
    return { ok: false, error: '验证码错误次数过多，请重新获取' };
  }

  if (record.code !== code.trim()) {
    await db
      .from('sms_verification_codes')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id);
    return { ok: false, error: '验证码错误' };
  }

  await db
    .from('sms_verification_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', record.id);
  return { ok: true };
}

/**
 * 按手机号查找已注册用户
 * 匹配策略：users.metadata->>phone 或 username 恰为手机号（兼容历史注册的纯数字用户名）
 */
/**
 * 数据库级短信发送限流检查（#[20260829-1700]）
 * 内存限流仅在单实例有效，多实例（PM2 cluster / 多容器）下各进程独立计数会失效；
 * 此处基于 sms_verification_codes 表的 created_at 做持久化限制：
 * - 60 秒冷却：该手机号 60s 内已发送 → 拒绝；
 * - 每日上限：该手机号当天累计发送 ≥ SMS_SEND_DAILY_LIMIT → 拒绝。
 * 作为内存限流的补充，两者取交集（都通过才放行）。
 */
export async function checkSmsDbRateLimit(
  phone: string
): Promise<{ allowed: boolean; error?: string; retryAfterSeconds?: number }> {
  try {
    const db = getSupabaseServiceClient();
    const now = Date.now();
    const cooldownStart = new Date(now - SMS_SEND_COOLDOWN_MS).toISOString();
    const dayStart = new Date(new Date(now).setHours(0, 0, 0, 0)).toISOString();

    // 60s 冷却：查询最近一条
    const { data: recent, error: recentError } = await db
      .from('sms_verification_codes')
      .select('id, created_at')
      .eq('phone', phone)
      .gte('created_at', cooldownStart)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!recentError && recent?.length) {
      const seconds = Math.ceil(
        (SMS_SEND_COOLDOWN_MS - (Date.now() - new Date(recent[0].created_at).getTime())) / 1000
      );
      return { allowed: false, error: `请${Math.max(1, seconds)}秒后再试`, retryAfterSeconds: seconds };
    }

    // 每日上限
    const { count, error: countError } = await db
      .from('sms_verification_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', dayStart);
    if (!countError && (count || 0) >= SMS_SEND_DAILY_LIMIT) {
      return { allowed: false, error: '今日短信发送次数已用完，请明天再试' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('[SMS] 数据库限流检查异常（放行）:', error);
    return { allowed: true };
  }
}

export async function findUserByPhone(phone: string) {
  const db = getSupabaseServiceClient();
  const normalizedPhone = phone.trim();

  const { data: byMetadata } = await db
    .from('users')
    .select('id, username')
    .filter('metadata->>phone', 'eq', normalizedPhone)
    .limit(1);

  if (byMetadata?.length) return byMetadata[0];

  const { data: byUsername } = await db
    .from('users')
    .select('id, username')
    .eq('username', normalizedPhone)
    .limit(1);

  return byUsername?.[0] || null;
}
