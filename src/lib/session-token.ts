/**
 * 服务端签名 Session Token
 *
 * 用于解决 x-user-id / x-user-email header 可被任意伪造的安全问题。
 * 登录成功后服务端使用 HMAC-SHA256 签发 token，后续请求通过
 * x-user-token header 携带，服务端验证签名后才信任其中的用户身份。
 *
 * token 格式：base64url(userId:email:role:expireAt[:sessionVersion]).hmac
 *
 * sessionVersion（#[20260829-1700]）：
 * - 会话版本号，取自 users.session_version（迁移 093）。
 * - 「全部设备登出」时服务端递增 users.session_version，旧 token（版本号 < 当前值）
 *   在 verify-session / getCurrentUser 中被判失效，强制重新登录。
 * - 历史 4 段 payload（无版本号）视为版本 0，向后兼容存量 token。
 *
 * 注意：SESSION_TOKEN_SECRET 的校验延迟到函数调用时执行（而非模块加载时），
 * 避免环境变量缺失导致整个模块加载失败、所有依赖路由全部 500。
 */

import crypto from 'crypto';

/**
 * 获取会话签名密钥。
 * 未配置时抛出明确错误——仅在真正需要签发 token（signSessionToken）时抛出；
 * 验证路径（verifySessionToken）会在内部捕获并返回 null，不会拖垮 API。
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      '[安全] 环境变量 SESSION_TOKEN_SECRET 未设置。请在 .env.local 中配置一个强随机字符串（至少 32 字符）。'
    );
  }
  return secret;
}

/**
 * 签发 session token
 * @param sessionVersion 签发时的用户会话版本号（迁移 093），未传按 0 处理
 */
export function signSessionToken(
  userId: string,
  email: string,
  role: string,
  ttlSeconds = 7 * 24 * 3600,
  sessionVersion = 0
): string {
  const expireAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const safeVersion = Number.isInteger(Number(sessionVersion)) ? Number(sessionVersion) : 0;
  const payload = `${userId}:${email}:${role}:${expireAt}:${safeVersion}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * 验证 session token 并返回 payload
 * 验证失败返回 null
 */
export function verifySessionToken(
  token: string
): { userId: string; email: string; role: string; sessionVersion: number } | null {
  try {
    const secret = getSessionSecret();
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, hmac] = parts;
    const expectedHmac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    // 使用时间安全的比较防止时序攻击
    if (hmac.length !== expectedHmac.length || !crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return null;
    }

    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const fields = payload.split(':');
    // 兼容两种 payload：4 段（旧）userId:email:role:expireAt / 5 段（新）…:sessionVersion
    const [userId, email, role, expireAtStr, versionStr] = fields;
    const expireAt = parseInt(expireAtStr, 10);
    // 邮箱/角色中不允许出现 ':'（注册校验已限制），split 安全
    if (fields.length < 4 || fields.length > 5) return null;
    if (!userId || !email || !role || isNaN(expireAt)) return null;
    if (Date.now() / 1000 > expireAt) return null;

    const sessionVersion = fields.length === 5 && versionStr ? parseInt(versionStr, 10) : 0;
    if (isNaN(sessionVersion)) return null;

    return { userId, email, role, sessionVersion };
  } catch {
    return null;
  }
}
