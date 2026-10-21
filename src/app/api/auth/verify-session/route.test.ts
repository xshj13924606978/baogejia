import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { SessionStateUnavailableError } from '@/lib/session-version';
const { revoked, single, verify } = vi.hoisted(() => ({ revoked: vi.fn(), single: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/session-token', () => ({ verifySessionToken: verify }));
vi.mock('@/lib/session-version', async (original) => ({
  ...await original<typeof import('@/lib/session-version')>(), isSessionRevoked: revoked,
}));
vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  verify.mockReturnValue({ userId: 'u1', sessionVersion: 0 });
  revoked.mockResolvedValue(false);
});
function request() {
  return new NextRequest('http://localhost/api/auth/verify-session', { method: 'POST', body: JSON.stringify({ token: 'signed' }) });
}
describe('verify-session access boundary', () => {
  it('rejects revoked sessions before reading user details', async () => {
    revoked.mockResolvedValue(true);
    expect((await POST(request())).status).toBe(401);
    expect(single).not.toHaveBeenCalled();
  });
  it('rejects a soft-deleted user even if status is active', async () => {
    single.mockResolvedValue({ data: { id: 'u1', status: 'active', deleted_at: '2026-01-01' } });
    expect((await POST(request())).status).toBe(401);
  });
  it('reports unavailable account verification as 503', async () => {
    revoked.mockRejectedValue(new SessionStateUnavailableError(new Error('offline')));
    expect((await POST(request())).status).toBe(503);
  });
  it('restores an active user without password fields', async () => {
    single.mockResolvedValueOnce({ data: { id: 'u1', status: 'active', password: 'secret', password_hash: 'hash' } })
      .mockResolvedValueOnce({ data: { level: 2 } });
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.valid).toBe(true);
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('password_hash');
  });
});
