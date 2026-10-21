import { describe, it, expect, afterEach, vi } from 'vitest';

describe('session-token missing secret', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('loads safely, rejects verification and refuses signing without a secret', async () => {
    vi.stubEnv('SESSION_TOKEN_SECRET', '');
    const tokens = await import('@/lib/session-token');
    expect(tokens.verifySessionToken('untrusted.token')).toBeNull();
    expect(() => tokens.signSessionToken('u1', 'test@example.com', 'user'))
      .toThrow('SESSION_TOKEN_SECRET 未设置');
  });
});
