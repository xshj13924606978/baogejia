import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { revoked, db, compare, sign } = vi.hoisted(() => ({ revoked: vi.fn(), db: vi.fn(), compare: vi.fn(), sign: vi.fn() }));
vi.mock('@/storage/database/supabase-client', () => ({ getSupabaseServiceClient: db }));
vi.mock('@/lib/session-token', () => ({ verifySessionToken: () => ({ userId: 'u1', sessionVersion: 0 }) }));
vi.mock('@/lib/session-version', async (original) => ({ ...await original<typeof import('@/lib/session-version')>(), isSessionRevoked: revoked, signSessionTokenForUser: sign }));
vi.mock('bcrypt', () => ({ default: { compare } }));
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('rejects revoked tokens before account updates or token renewal', async () => {
  revoked.mockResolvedValue(true);
  const { POST } = await import('./route');
  const result = await POST(new NextRequest('http://localhost/api/auth/sync-user', {
    method: 'POST', headers: { 'x-user-token': 'signed' }, body: JSON.stringify({ email: 'test@example.com' }),
  }));
  expect(result.status).toBe(401);
  expect(db).not.toHaveBeenCalled();
});

it.each([
  { username: 'victim' },
  { username: 'victim', password: '$2b$attacker-controlled-hash' },
  { username: 'victim', clearEmail: true },
])('does not update or renew an existing account using only its identifier: %j', async (body) => {
  const update = vi.fn();
  const query = { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'victim', status: 'active', password_hash: 'stored-hash' } }) };
  db.mockReturnValue({ from: () => ({ select: () => ({ eq: () => query }), update }) });
  const { POST } = await import('./route');
  const result = await POST(new NextRequest('http://localhost/api/auth/sync-user', {
    method: 'POST', body: JSON.stringify(body),
  }));
  expect(result.status).toBe(401);
  expect(update).not.toHaveBeenCalled();
});

it('preserves verified current-password access to an existing account', async () => {
  compare.mockResolvedValue(true);
  sign.mockResolvedValue('fresh-session');
  const user = { id: 'u1', username: 'existing', status: 'active', password_hash: 'stored', email: 'test@example.com', metadata: {} };
  const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: async () => ({ data: user, error: null }) }) }) }));
  db.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: user }) }) }), update }) });
  const { POST } = await import('./route');
  const response = await POST(new NextRequest('http://localhost/api/auth/sync-user', {
    method: 'POST', body: JSON.stringify({ username: 'existing', currentPassword: 'correct' }),
  }));
  expect(response.status).toBe(200);
  expect(compare).toHaveBeenCalledWith('correct', 'stored');
  expect(update).toHaveBeenCalledTimes(1);
  expect(sign).toHaveBeenCalled();
});
