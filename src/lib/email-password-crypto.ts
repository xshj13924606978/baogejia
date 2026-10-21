/**
 * SMTP 密码加密工具（#[20260831-1700] P1-11）
 *
 * 采用 AES-256-GCM：
 * - 密钥派生：scryptSync(EMAIL_PASSWORD_ENCRYPTION_KEY, 'email-salt', 32)
 * - IV：12 字节随机值（GCM 推荐长度）
 * - Auth Tag：16 字节认证标签
 * - 落库格式：`<base64-iv>:<base64-tag>:<base64-ciphertext>`
 *
 * 降级：未配置 EMAIL_PASSWORD_ENCRYPTION_KEY 时返回 null，调用方保持明文兼容。
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const KEY_TEXT = process.env.EMAIL_PASSWORD_ENCRYPTION_KEY;

function deriveKey(): Buffer | null {
  if (!KEY_TEXT || KEY_TEXT.length < 8) return null;
  try {
    return scryptSync(KEY_TEXT, 'email-salt', 32);
  } catch {
    return null;
  }
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  encrypted: string;
}

/** 加密 SMTP 密码；无密钥或空明文返回 null */
export function encryptSmtpPassword(plain: string): EncryptedPayload | null {
  const key = deriveKey();
  if (!key || !plain || typeof plain !== 'string') return null;

  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      encrypted: encrypted.toString('base64'),
    };
  } catch (err) {
    console.error('[EmailCrypto] 加密失败:', err);
    return null;
  }
}

/** 解密 SMTP 密码；无密钥或失败返回 null */
export function decryptSmtpPassword(payload: EncryptedPayload): string | null {
  const key = deriveKey();
  if (!key) return null;

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.encrypted, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[EmailCrypto] 解密失败:', err);
    return null;
  }
}

/** 紧凑格式：iv:tag:encrypted（便于单字段存储） */
export function encryptSmtpPasswordCompact(plain: string): string | null {
  const payload = encryptSmtpPassword(plain);
  if (!payload) return null;
  return `${payload.iv}:${payload.tag}:${payload.encrypted}`;
}

/** 从紧凑格式解密 */
export function decryptSmtpPasswordCompact(compact: string): string | null {
  const key = deriveKey();
  if (!key || !compact) return null;

  const parts = compact.split(':');
  if (parts.length !== 3) return null;

  return decryptSmtpPassword({
    iv: parts[0],
    tag: parts[1],
    encrypted: parts[2],
  });
}

/** 是否启用加密存储 */
export function isEmailPasswordEncryptionEnabled(): boolean {
  return deriveKey() !== null;
}
