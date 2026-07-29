/**
 * 服务端签名 Session Token
 *
 * 用于解决 x-user-id / x-user-email header 可被任意伪造的安全问题。
 * 登录成功后服务端使用 HMAC-SHA256 签发 token，后续请求通过
 * x-user-token header 携带，服务端验证签名后才信任其中的用户身份。
 *
 * token 格式：base64url(userId:email:role:expireAt:hmac)
 */

import crypto from 'crypto';

const SECRET = process.env.SESSION_TOKEN_SECRET;
if (!SECRET) {
  throw new Error(
    '[安全] 环境变量 SESSION_TOKEN_SECRET 未设置。请在 .env.local 中配置一个强随机字符串（至少 32 字符）。'
  );
}

/**
 * 签发 session token
 */
export function signSessionToken(userId: string, email: string, role: string, ttlSeconds = 7 * 24 * 3600): string {
  const expireAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}:${email}:${role}:${expireAt}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * 验证 session token 并返回 payload
 * 验证失败返回 null
 */
export function verifySessionToken(token: string): { userId: string; email: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, hmac] = parts;
    const expectedHmac = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');

    // 使用时间安全的比较防止时序攻击
    if (hmac.length !== expectedHmac.length || !crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return null;
    }

    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const [userId, email, role, expireAtStr] = payload.split(':');
    const expireAt = parseInt(expireAtStr, 10);

    if (!userId || !email || !role || isNaN(expireAt)) return null;
    if (Date.now() / 1000 > expireAt) return null;

    return { userId, email, role };
  } catch {
    return null;
  }
}
