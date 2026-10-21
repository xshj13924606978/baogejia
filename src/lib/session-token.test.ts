import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

// Set the env var before any import of the session-token module
// (module-level code checks process.env.SESSION_TOKEN_SECRET)
process.env.SESSION_TOKEN_SECRET = 'test-secret-key-for-vitest-at-least-32-chars-long';

const { signSessionToken, verifySessionToken } = await import('@/lib/session-token');

const SECRET = process.env.SESSION_TOKEN_SECRET!;

function makeTamperedToken(
  userId: string,
  email: string,
  role: string,
  expireAt: number,
): string {
  const payload = `${userId}:${email}:${role}:${expireAt}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

describe('session-token', () => {
  const userId = 'user-123';
  const email = 'test@example.com';
  const role = 'admin';

  // --- signSessionToken ---
  describe('signSessionToken', () => {
    it('should return a token with exactly one dot', () => {
      const token = signSessionToken(userId, email, role);
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('should generate different tokens for different TTL', () => {
      const token1 = signSessionToken(userId, email, role, 3600);
      const token2 = signSessionToken(userId, email, role, 7200);
      expect(token1).not.toBe(token2);
    });

    it('should accept custom TTL', () => {
      const token = signSessionToken(userId, email, role, 3600);
      expect(token).toContain('.');
      const result = verifySessionToken(token);
      expect(result).toEqual({ userId, email, role, sessionVersion: 0 });
    });
  });

  // --- sign + verify roundtrip ---
  describe('sign + verify roundtrip', () => {
    it('should successfully verify a freshly signed token', () => {
      const token = signSessionToken(userId, email, role);
      const result = verifySessionToken(token);
      expect(result).toEqual({ userId, email, role, sessionVersion: 0 });
    });

    it('should roundtrip a token with explicit sessionVersion', () => {
      const token = signSessionToken(userId, email, role, 7 * 24 * 3600, 42);
      const result = verifySessionToken(token);
      expect(result).toEqual({ userId, email, role, sessionVersion: 42 });
    });

    it('should correctly extract userId, email, role', () => {
      const result = verifySessionToken(signSessionToken(userId, email, role));
      expect(result!.userId).toBe(userId);
      expect(result!.email).toBe(email);
      expect(result!.role).toBe(role);
    });
  });

  // --- tampering ---
  describe('verifySessionToken — tampering', () => {
    it('should return null when payload is tampered', () => {
      const token = signSessionToken(userId, email, role);
      const [payloadB64, hmac] = token.split('.');
      const tampered = Buffer.from(
        Buffer.from(payloadB64, 'base64url').toString('utf8') + 'x',
        'utf8',
      ).toString('base64url') + '.' + hmac;
      expect(verifySessionToken(tampered)).toBeNull();
    });

    it('should return null when hmac is tampered', () => {
      const token = signSessionToken(userId, email, role);
      const [payloadB64, hmac] = token.split('.');
      const tamperedHmac =
        hmac.length > 0 ? (hmac[0] === 'A' ? 'B' : 'A') + hmac.slice(1) : 'X';
      expect(verifySessionToken(`${payloadB64}.${tamperedHmac}`)).toBeNull();
    });
  });

  // --- invalid format ---
  describe('verifySessionToken — invalid format', () => {
    it('should return null for token with no dot', () => {
      expect(verifySessionToken('nodothere')).toBeNull();
    });

    it('should return null for token with multiple dots', () => {
      expect(verifySessionToken('a.b.c')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(verifySessionToken('')).toBeNull();
    });

    it('should return null for random unknown string', () => {
      expect(verifySessionToken('random-token-string')).toBeNull();
    });
  });

  // --- expiration ---
  describe('verifySessionToken — expiration', () => {
    it('should return null for expired token', () => {
      const token = signSessionToken(userId, email, role, -1);
      expect(verifySessionToken(token)).toBeNull();
    });
  });

  // --- missing payload fields ---
  describe('verifySessionToken — missing payload fields', () => {
    const futureExpireAt = Math.floor(Date.now() / 1000) + 3600;

    it('should return null when userId is empty', () => {
      const token = makeTamperedToken('', email, role, futureExpireAt);
      expect(verifySessionToken(token)).toBeNull();
    });

    it('should return null when email is empty', () => {
      const token = makeTamperedToken(userId, '', role, futureExpireAt);
      expect(verifySessionToken(token)).toBeNull();
    });

    it('should return null when role is empty', () => {
      const token = makeTamperedToken(userId, email, '', futureExpireAt);
      expect(verifySessionToken(token)).toBeNull();
    });

    it('should return null when crypto throws unexpected error', () => {
      const token = signSessionToken(userId, email, role);
      const spy = vi.spyOn(crypto, 'timingSafeEqual').mockImplementation(() => {
        throw new Error('unexpected crypto error');
      });
      try {
        expect(verifySessionToken(token)).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
