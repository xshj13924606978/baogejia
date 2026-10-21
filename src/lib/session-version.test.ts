import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserSessionState, getUserSessionVersion, isSessionRevoked, SessionStateUnavailableError } from './session-version';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: query }) }) }) }),
}));
beforeEach(() => { query.mockReset(); });
describe('account state access boundary', () => {
  it('does not grant access when the database throws', async () => {
    query.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getUserSessionState('u1')).rejects.toBeInstanceOf(SessionStateUnavailableError);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('does not fall back on ordinary database errors', async () => {
    query.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failed' } });
    await expect(getUserSessionState('u1')).rejects.toBeInstanceOf(SessionStateUnavailableError);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('supports the confirmed legacy schema', async () => {
    query.mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column users.deleted_at does not exist' } })
      .mockResolvedValueOnce({ data: { session_version: 3, status: 'active' }, error: null });
    await expect(getUserSessionState('u1')).resolves.toEqual({ exists: true, sessionVersion: 3, role: null, status: 'active', deletedAt: null });
  });
  it('rejects errors in the legacy query', async () => {
    query.mockResolvedValueOnce({ data: null, error: { code: 'PGRST204', message: 'deleted_at missing from schema cache' } })
      .mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'connection failed' } });
    await expect(getUserSessionState('u1')).rejects.toBeInstanceOf(SessionStateUnavailableError);
  });
  it('does not treat unrelated missing columns as legacy schema', async () => {
    query.mockResolvedValue({ data: null, error: { code: '42703', message: 'session_version missing' } });
    await expect(getUserSessionState('u1')).rejects.toBeInstanceOf(SessionStateUnavailableError);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('preserves disabled and soft-deleted state', async () => {
    query.mockResolvedValue({ data: { session_version: 2, status: 'disabled', deleted_at: '2026-01-01' }, error: null });
    await expect(getUserSessionState('u1')).resolves.toEqual({ exists: true, sessionVersion: 2, role: null, status: 'disabled', deletedAt: '2026-01-01' });
  });
  it('rejects a missing account', async () => {
    query.mockResolvedValue({ data: null, error: null });
    expect((await getUserSessionState('u1')).exists).toBe(false);
  });
});

describe('revocation decisions', () => {
  it('never substitutes version zero for a failed lookup', async () => {
    query.mockRejectedValue(new Error('offline'));
    await expect(getUserSessionVersion('u1')).rejects.toBeInstanceOf(SessionStateUnavailableError);
    await expect(isSessionRevoked('u1', 0)).rejects.toBeInstanceOf(SessionStateUnavailableError);
  });
  it('treats disabled accounts as revoked', async () => {
    query.mockResolvedValue({ data: { status: 'disabled', session_version: 0, deleted_at: null }, error: null });
    await expect(isSessionRevoked('u1', 0)).resolves.toBe(true);
  });
  it('compares a valid account against its current version', async () => {
    query.mockResolvedValue({ data: { status: 'active', session_version: 3, deleted_at: null }, error: null });
    await expect(isSessionRevoked('u1', 2)).resolves.toBe(true);
    await expect(isSessionRevoked('u1', 3)).resolves.toBe(false);
  });
});
