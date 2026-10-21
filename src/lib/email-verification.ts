/**
 * 邮箱验证码（#[20260828-1345] → #[20260828-1345]-1）
 *
 * 双通道设计（数据库驱动，动态生效，不硬编码）：
 *  - provider='smtp'（email_settings 表配置，支持多套任意服务商 SMTP，迁移 089）→
 *    项目自持 SMTP 通道发送 8 位数字验证码，验证码持久化到
 *    email_verification_codes.current_email_otp，校验时本地比对。
 *  - 无可用 smtp 行（provider='supabase' 默认）→ signInWithOtp 触发 Supabase 内置 SMTP
 *    发送 magic link 邮件（含 {{ .Token }} 验证码），校验走 verifyOtp(type: magiclink)。
 *
 * 根因（#[20260828-1345]-1）：generateLink 仅生成链接/OTP、不会自动发送邮件，
 * 导致用户收不到验证码；且 Supabase 免费版内置邮件通道锁死 rate limit（2 封/小时/邮箱），
 * 必须配置自定义 SMTP 才能稳定投递。
 */
import nodemailer from 'nodemailer';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60; // 同邮箱 60s 冷却
export const EMAIL_CODE_DAILY_LIMIT = 10; // 单邮箱每日上限
export const EMAIL_CODE_TTL_SECONDS = 600; // 验证状态 10 分钟内有效
export const EMAIL_CODE_EXPIRES_SECONDS = 600; // 验证码过期时间
export const EMAIL_OTP_LENGTH = 8; // 数字验证码位数（与 Supabase mailer_otp_length 一致）

export type EmailSendResult = {
  ok: boolean;
  error?: string;
  cooldownSeconds?: number;
};

export type EmailVerifyResult = {
  ok: boolean;
  error?: string;
  method?: string;
};

export type EmailSettings = {
  id: number;
  provider: 'smtp' | 'supabase';
  priority: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_password_encrypted: string | null;
  password_encrypted: boolean;
  from_email: string | null;
  from_name: string | null;
  enabled: boolean;
};

// ---------- 邮件通道配置（数据库驱动 + 短缓存） ----------

let settingsCache: { data: EmailSettings[]; ts: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 30_000;

/**
 * 读取全部启用的 SMTP 邮件通道（30s 缓存；force=true 强制刷新，配置变更后立即可见）。
 * 多通道（迁移 089/090）：按 priority 升序（数值越小越优先）、同优先级按 id 升序排列，
 * 发送时依序逐通道尝试，当前通道失败自动降级到下一个（腾讯云 → 163 → QQ 等）。
 */
export async function getEmailSettingsList(force = false): Promise<EmailSettings[]> {
  if (!force && settingsCache && Date.now() - settingsCache.ts < SETTINGS_CACHE_TTL_MS) {
    return settingsCache.data;
  }
  const db = getSupabaseServiceClient();
  const { data } = await db
    .from('email_settings')
    .select(
      'id, provider, priority, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_password_encrypted, password_encrypted, from_email, from_name, enabled'
    )
    .eq('provider', 'smtp')
    .eq('enabled', true)
    .order('priority', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });
  const list = (data ?? []) as EmailSettings[];
  settingsCache = { data: list, ts: Date.now() };
  return list;
}

/**
 * 读取优先级最高的可用 SMTP 通道（兼容旧调用方）；
 * 返回 null 表示无可用 SMTP 通道，调用方 fallback 到 Supabase 内置邮件。
 */
export async function getEmailSettings(force = false): Promise<EmailSettings | null> {
  const list = await getEmailSettingsList(force);
  return list.find(isSmtpConfigured) ?? list[0] ?? null;
}

function isSmtpConfigured(
  s: EmailSettings | null
): s is EmailSettings & {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
} {
  if (!s || s.provider !== 'smtp' || !s.enabled) return false;
  const effectivePassword = getEffectiveSmtpPassword(s);
  return Boolean(s.smtp_host && s.smtp_port && s.smtp_user && effectivePassword && s.from_email);
}

/**
 * 获取实际 SMTP 密码（#[20260831-1700] P1-11）
 * 优先解密 smtp_password_encrypted；未加密则回退 smtp_password。
 */
function getEffectiveSmtpPassword(settings: EmailSettings): string | null {
  if (settings.password_encrypted && settings.smtp_password_encrypted) {
    // 动态导入避免构建时 bundling crypto（仅在服务端运行）
    const { decryptSmtpPasswordCompact } = require('@/lib/email-password-crypto');
    const decrypted = decryptSmtpPasswordCompact(settings.smtp_password_encrypted);
    if (decrypted) return decrypted;
  }
  return settings.smtp_password || null;
}

function generateEmailOtp(length = EMAIL_OTP_LENGTH): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

async function sendEmailViaSmtp(
  settings: EmailSettings,
  toEmail: string,
  otp: string
): Promise<void> {
  const smtpPassword = getEffectiveSmtpPassword(settings);
  if (!smtpPassword) {
    throw new Error('SMTP 密码不可用（未配置或解密失败）');
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host!,
    port: settings.smtp_port!,
    secure: settings.smtp_secure !== false,
    auth: { user: settings.smtp_user!, pass: smtpPassword },
  });
  await transporter.sendMail({
    from: `"${settings.from_name || '报价查询系统'}" <${settings.from_email}>`,
    to: toEmail,
    subject: '【报价查询】邮箱验证码',
    text: `您的邮箱验证码是：${otp}，${EMAIL_CODE_EXPIRES_SECONDS / 60} 分钟内有效。如非本人操作请忽略本邮件。`,
    html: `<div style="font-family:'Microsoft YaHei',Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#1e40af;color:#fff;padding:16px 24px;font-size:16px;font-weight:600">报价查询系统 · 邮箱验证</div>
      <div style="padding:24px">
        <p style="color:#374151">您好：</p>
        <p style="color:#374151">您的邮箱验证码是：</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#1e40af;text-align:center;margin:16px 0">${otp}</p>
        <p style="color:#6b7280;font-size:13px">验证码 ${EMAIL_CODE_EXPIRES_SECONDS / 60} 分钟内有效。如非本人操作，请忽略本邮件。</p>
      </div>
    </div>`,
  });
}

// ---------- 频率限制 ----------

/** 从 Request 提取客户端 IP */
export function getClientIp(req?: Request): string {
  if (!req) return 'unknown';
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * 频率限制：同一邮箱 60s 冷却 + 每日 10 次上限
 * 持久化（基于 email_verification_codes 表）
 */
export async function checkEmailRateLimit(email: string): Promise<{
  allowed: boolean;
  error?: string;
  cooldownSeconds?: number;
}> {
  const db = getSupabaseServiceClient();
  const now = Date.now();

  const { data: existing } = await db
    .from('email_verification_codes')
    .select('last_sent_at, send_count')
    .eq('email', email)
    .maybeSingle();

  // 冷却：60s
  if (existing?.last_sent_at) {
    const lastSent = new Date(existing.last_sent_at).getTime();
    const elapsed = (now - lastSent) / 1000;
    if (elapsed < EMAIL_CODE_RESEND_COOLDOWN_SECONDS) {
      const cooldown = Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_SECONDS - elapsed);
      return {
        allowed: false,
        cooldownSeconds: cooldown,
        error: `请等待 ${cooldown} 秒后再发送`,
      };
    }
  }

  // 每日上限：当日起累计发送次数
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count } = await db
    .from('email_verification_codes')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('last_sent_at', todayStart.toISOString());

  if ((count || 0) >= EMAIL_CODE_DAILY_LIMIT) {
    return { allowed: false, error: '今日发送次数已达上限，请明日再试' };
  }

  return { allowed: true };
}

// ---------- 发送验证码 ----------

export async function sendEmailVerificationCode(
  email: string
): Promise<EmailSendResult> {
  const db = getSupabaseServiceClient();

  const limit = await checkEmailRateLimit(email);
  if (!limit.allowed) {
    return { ok: false, error: limit.error, cooldownSeconds: limit.cooldownSeconds };
  }

  const smtpChannels = (await getEmailSettingsList()).filter(isSmtpConfigured);

  const { data: existing } = await db
    .from('email_verification_codes')
    .select('send_count')
    .eq('email', email)
    .maybeSingle();

  const sendCount = (existing?.send_count || 0) + 1;
  const expiresAt = new Date(Date.now() + EMAIL_CODE_EXPIRES_SECONDS * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // ---- 通道 1：自定义 SMTP（数据库驱动，按 priority 多通道降级） ----
  // 依序尝试：腾讯云邮件推送(1) → 163邮箱(2) → QQ邮箱(3) → ...，当前通道失败自动降级下一个
  if (smtpChannels.length > 0) {
    const otp = generateEmailOtp();

    // 先持久化验证码（发送成功后消费），再发送邮件
    const { error: upsertError } = await db.from('email_verification_codes').upsert({
      email,
      verified: false,
      verified_at: null,
      last_sent_at: nowIso,
      send_count: sendCount,
      current_hashed_token: null,
      current_verification_type: 'smtp_otp',
      current_email_otp: otp,
      current_action_link: null,
      current_expires_at: expiresAt,
      last_verified_method: null,
      updated_at: nowIso,
    });

    if (upsertError) {
      console.error('[Email] SMTP 模式持久化失败:', upsertError.message);
      return { ok: false, error: '系统繁忙，请稍后重试' };
    }

    let lastError: unknown = null;
    for (const channel of smtpChannels) {
      try {
        await sendEmailViaSmtp(channel, email, otp);
        console.log(`[Email] SMTP 发送成功，通道=${channel.smtp_host} to=${email}`);
        return { ok: true };
      } catch (err) {
        lastError = err;
        console.error(
          `[Email] SMTP 通道 ${channel.smtp_host} 发送失败，降级到下一通道:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    console.error('[Email] 所有 SMTP 通道发送失败:', lastError);
    return { ok: false, error: '邮件发送失败，请稍后重试' };
  }

  // ---- 通道 2：Supabase 内置邮件（signInWithOtp 真实发送 magic link，模板含验证码） ----
  const { data, error } = await db.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: 'https://xs-bj.com/contributor/upload?email_verify_callback=1',
      data: { source: 'contributor_email_verify' },
    },
  });

  if (error) {
    console.error('[Email] signInWithOtp 失败:', error.message);
    return { ok: false, error: '邮件发送失败：' + (error?.message || '未知错误') };
  }

  const { error: upsertError } = await db.from('email_verification_codes').upsert({
    email,
    verified: false,
    verified_at: null,
    last_sent_at: nowIso,
    send_count: sendCount,
    current_hashed_token: null,
    current_verification_type: 'magiclink',
    current_email_otp: null,
    current_action_link: null,
    current_expires_at: expiresAt,
    last_verified_method: null,
    updated_at: nowIso,
  });

  if (upsertError) {
    console.error('[Email] 持久化失败:', upsertError.message);
    return { ok: false, error: '邮件已发送，但记录保存失败，请重试' };
  }

  return { ok: true };
}

// ---------- 校验验证码 ----------

/**
 * 校验用户输入的验证码
 * - SMTP 模式：本地比对 email_verification_codes.current_email_otp
 * - Supabase 模式：verifyOtp(magiclink/email/signup)，兼容 8 位数字 OTP 与完整链接粘贴
 */
export async function verifyEmailCode(
  email: string,
  code: string
): Promise<EmailVerifyResult> {
  const db = getSupabaseServiceClient();
  const trimmedCode = code.trim();

  if (!trimmedCode) {
    return { ok: false, error: '请输入验证码' };
  }

  // 先查当前记录，判断通道类型
  const { data: rec } = await db
    .from('email_verification_codes')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  // ---- SMTP 模式：本地比对 ----
  if (rec?.current_verification_type === 'smtp_otp' && rec.current_email_otp) {
    const expiresAt = rec.current_expires_at ? new Date(rec.current_expires_at).getTime() : 0;
    if (Date.now() > expiresAt) {
      return { ok: false, error: '验证码已过期，请重新发送' };
    }
    if (trimmedCode === rec.current_email_otp) {
      await markEmailVerified(email, 'smtp_otp');
      return { ok: true, method: 'smtp_otp' };
    }
    return { ok: false, error: '验证码不正确，请重新输入' };
  }

  // ---- Supabase 模式：verifyOtp ----
  // 提取 token：用户可能粘贴了完整 URL（含 #access_token=xxx 或 ?token=xxx）
  let extractedToken = trimmedCode;
  const tokenMatch = trimmedCode.match(/(?:[#?&](?:token|access_token)=)([^&#\s]+)/);
  if (tokenMatch) {
    extractedToken = decodeURIComponent(tokenMatch[1]);
  }

  // 尝试 1：magiclink 类型（Supabase 默认邮件模板形式）
  const r1 = await db.auth.verifyOtp({
    email,
    token: extractedToken,
    type: 'magiclink',
  });
  if (!r1.error && r1.data?.user) {
    await markEmailVerified(email, 'magiclink');
    return { ok: true, method: 'magiclink' };
  }

  // 尝试 2：email 类型（数字 OTP）
  const r2 = await db.auth.verifyOtp({
    email,
    token: extractedToken,
    type: 'email',
  });
  if (!r2.error && r2.data?.user) {
    await markEmailVerified(email, 'email_otp');
    return { ok: true, method: 'email_otp' };
  }

  // 尝试 3：signup 类型（确认注册邮件）
  const r3 = await db.auth.verifyOtp({
    email,
    token: extractedToken,
    type: 'signup',
  });
  if (!r3.error && r3.data?.user) {
    await markEmailVerified(email, 'signup');
    return { ok: true, method: 'signup' };
  }

  // 全部失败
  const lastError = r3.error?.message || r2.error?.message || r1.error?.message || '未知错误';
  return { ok: false, error: '验证码无效或已过期：' + lastError };
}

/** 标记邮箱已验证（持久化） */
async function markEmailVerified(email: string, method: string): Promise<void> {
  const db = getSupabaseServiceClient();
  await db.from('email_verification_codes').upsert({
    email,
    verified: true,
    verified_at: new Date().toISOString(),
    last_verified_method: method,
    current_hashed_token: null, // 清空敏感信息
    current_email_otp: null,
    current_action_link: null,
    updated_at: new Date().toISOString(),
  });
}

/** 检查邮箱是否已验证（在 TTL 窗口内有效） */
export async function isEmailVerified(email: string): Promise<boolean> {
  const db = getSupabaseServiceClient();
  const { data } = await db
    .from('email_verification_codes')
    .select('verified, verified_at')
    .eq('email', email)
    .maybeSingle();

  if (!data?.verified || !data.verified_at) return false;

  const verifiedAt = new Date(data.verified_at).getTime();
  const ttlMs = EMAIL_CODE_TTL_SECONDS * 1000;
  return Date.now() - verifiedAt <= ttlMs;
}

/** 检查邮箱是否已注册（避免给已注册用户发送验证邮件） */
export async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const db = getSupabaseServiceClient();
  const { data } = await db
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  return data || null;
}
