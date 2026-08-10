import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentUser, requireAuth, requireAdmin, AuthDatabaseError, getClientUser } from '@/lib/auth-utils';

// ═══════════════════════ Mock 工厂（vi.hoisted 提升） ═══════════════════════

const { mockGetUser, mockDbSingle, mockDbEq, mockDbSelect, mockDbFrom, mockVerifySessionToken, mockGetSupabaseServiceClient } = vi.hoisted(() => {
  const mockDbSingle = vi.fn();
  const mockDbEq = vi.fn(() => ({ single: mockDbSingle }));
  const mockDbSelect = vi.fn(() => ({ eq: mockDbEq }));
  const mockDbFrom = vi.fn(() => ({ select: mockDbSelect }));
  const mockGetSupabaseServiceClient = vi.fn(() => ({
    from: mockDbFrom,
    select: mockDbSelect,
    eq: mockDbEq,
    single: mockDbSingle,
  }));
  return {
    mockGetUser: vi.fn(),
    mockDbSingle,
    mockDbEq,
    mockDbSelect,
    mockDbFrom,
    mockVerifySessionToken: vi.fn(),
    mockGetSupabaseServiceClient,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseServiceClient: mockGetSupabaseServiceClient,
  getSupabaseClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/session-token', () => ({
  verifySessionToken: mockVerifySessionToken,
}));

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn((body: unknown, init?: unknown) => ({ body, status: (init as { status?: number })?.status, init })),
  },
}));

// ═══════════════════════ 辅助 ═══════════════════════

function createMockRequest(options: {
  cookieName?: string;
  cookieValue?: string;
  authHeader?: string;
  userToken?: string;
} = {}) {
  const cookies = new Map();
  if (options.cookieName && options.cookieValue) {
    cookies.set(options.cookieName, { name: options.cookieName, value: options.cookieValue });
  }
  const headers = new Map();
  if (options.authHeader !== undefined) headers.set('authorization', options.authHeader);
  if (options.userToken !== undefined) headers.set('x-user-token', options.userToken);
  return {
    cookies: { get: (name: string) => cookies.get(name) || undefined },
    headers: { get: (name: string) => headers.get(name) || null },
  } as any;
}

const MOCK_BUSINESS_USER = { id: 'u1', email: 'test@example.com', role: 'admin' };
const MOCK_SUPABASE_USER = { id: 'auth1', email: 'test@example.com', user_metadata: { name: 'Test' } };

function mockGetUserSuccess(user = MOCK_SUPABASE_USER) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}
function mockGetUserError() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });
}
function mockDbBusinessUser(user = MOCK_BUSINESS_USER) {
  mockDbSingle.mockResolvedValue({ data: user, error: null });
}
function mockDbNoUser() {
  mockDbSingle.mockResolvedValue({ data: null, error: null });
}
function mockDbError(error: Error) {
  mockDbSingle.mockRejectedValue(error);
}

// ═══════════════════════ 测试 ═══════════════════════

describe('auth-utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ═══ getCurrentUser ═══

  describe('getCurrentUser', () => {
    it('优先级1: Supabase cookie 认证成功', async () => {
      mockGetUserSuccess();
      mockDbBusinessUser();
      const req = createMockRequest({ cookieName: 'sb-access-token', cookieValue: 'valid-token' });

      const user = await getCurrentUser(req);

      expect(user).toEqual({ id: 'u1', email: 'test@example.com', role: 'admin', name: 'Test' });
    });

    it('优先级1: cookie 存在但 getUser 返回 error，降级到 Bearer', async () => {
      mockGetUserError();
      mockGetUserSuccess();
      mockDbBusinessUser();
      const req = createMockRequest({
        cookieName: 'sb-access-token', cookieValue: 'bad-token',
        authHeader: 'Bearer valid-jwt',
      });

      const user = await getCurrentUser(req);
      expect(user).not.toBeNull();
      expect(user!.email).toBe('test@example.com');
    });

    it('优先级1: cookie getUser 成功但业务表无记录，降级到 x-user-token', async () => {
      mockGetUserSuccess();
      mockDbNoUser();
      mockVerifySessionToken.mockReturnValue({ userId: 'local1', email: 'local@test.com', role: 'user' });
      const req = createMockRequest({
        cookieName: 'sb-access-token', cookieValue: 'token',
        userToken: 'valid-session',
      });

      const user = await getCurrentUser(req);
      expect(user).toEqual({ id: 'local1', email: 'local@test.com', role: 'user', name: 'local@test.com' });
    });

    it('优先级2: Bearer token 认证成功', async () => {
      mockGetUserSuccess();
      mockDbBusinessUser();
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

      const user = await getCurrentUser(req);
      expect(user).not.toBeNull();
      expect(user!.email).toBe('test@example.com');
    });

    it('优先级2: Bearer getUser 返回 error，降级到 x-user-token', async () => {
      mockGetUserError();
      mockVerifySessionToken.mockReturnValue({ userId: 'local1', email: 'local@test.com', role: 'user' });
      const req = createMockRequest({ authHeader: 'Bearer bad-token', userToken: 'valid-session' });

      const user = await getCurrentUser(req);
      expect(user).not.toBeNull();
      expect(user!.id).toBe('local1');
    });

    it('优先级2: Bearer 用户有效但业务表无记录，降级到 x-user-token', async () => {
      mockGetUserSuccess();
      mockDbNoUser();
      mockVerifySessionToken.mockReturnValue({ userId: 'local1', email: 'local@test.com', role: 'user' });
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt', userToken: 'valid-session' });

      const user = await getCurrentUser(req);
      expect(user).not.toBeNull();
      expect(user!.id).toBe('local1');
    });

    it('优先级3: x-user-token 验证成功', async () => {
      mockVerifySessionToken.mockReturnValue({ userId: 's1', email: 'session@test.com', role: 'admin' });
      const req = createMockRequest({ userToken: 'valid-session' });

      const user = await getCurrentUser(req);
      expect(user).toEqual({ id: 's1', email: 'session@test.com', role: 'admin', name: 'session@test.com' });
    });

    it('优先级3: x-user-token 无效返回 null', async () => {
      mockVerifySessionToken.mockReturnValue(null);
      const req = createMockRequest({ userToken: 'invalid-session' });

      const user = await getCurrentUser(req);
      expect(user).toBeNull();
    });

    it('无凭据时返回 null', async () => {
      const req = createMockRequest();
      const user = await getCurrentUser(req);
      expect(user).toBeNull();
    });

    it('所有优先级均无凭据返回 null', async () => {
      const req = createMockRequest();
      const user = await getCurrentUser(req);
      expect(user).toBeNull();
    });

    // ═══ 数据库连接错误（通过 Bearer 路径触发 DB 查询） ═══

    const DB_ERROR_CASES = [
      { name: 'fetch failed', error: new TypeError('fetch failed') },
      { name: 'ENOTFOUND', error: new Error('getaddrinfo ENOTFOUND db.example.com') },
      { name: 'ECONNREFUSED', error: new Error('connect ECONNREFUSED 127.0.0.1:5432') },
      { name: 'ETIMEDOUT', error: new Error('connect ETIMEDOUT 10.0.0.1:5432') },
      { name: 'EAI_AGAIN', error: new Error('getaddrinfo EAI_AGAIN db.example.com') },
      { name: 'NXDOMAIN', error: new Error('getaddrinfo NXDOMAIN db.example.com') },
      { name: 'network', error: new Error('network error') },
      { name: 'timeout', error: new Error('request timeout') },
      { name: 'TypeError (non-fetch)', error: new TypeError('Failed to fetch data from network') },
    ];

    for (const { name, error } of DB_ERROR_CASES) {
      it(`数据库连接错误抛出 AuthDatabaseError: ${name}`, async () => {
        mockGetUserSuccess();
        mockDbError(error);
        const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

        await expect(getCurrentUser(req)).rejects.toThrow(AuthDatabaseError);
      });
    }

    it('非 DB 连接错误返回 null（如 JSON 解析错误）', async () => {
      mockGetUserSuccess();
      mockDbError(new SyntaxError('Unexpected token'));
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

      const user = await getCurrentUser(req);
      expect(user).toBeNull();
    });

    it('用户无 user_metadata name 时用 email 作为 name', async () => {
      mockGetUserSuccess({ ...MOCK_SUPABASE_USER, user_metadata: { ...MOCK_SUPABASE_USER.user_metadata, name: '' } });
      mockDbBusinessUser();
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

      const user = await getCurrentUser(req);
      expect(user!.name).toBe('test@example.com');
    });

    it('用户 role 为空时默认为 user', async () => {
      mockGetUserSuccess();
      mockDbBusinessUser({ ...MOCK_BUSINESS_USER, role: '' });
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

      const user = await getCurrentUser(req);
      expect(user!.role).toBe('user');
    });
  });

  // ═══ requireAuth ═══

  describe('requireAuth', () => {
    it('认证成功返回 user', async () => {
      mockVerifySessionToken.mockReturnValue({ userId: 's1', email: 's@test.com', role: 'user' });
      const req = createMockRequest({ userToken: 'valid' });

      const result = await requireAuth(req);
      expect(result.user).not.toBeNull();
      expect(result.errorResponse).toBeNull();
    });

    it('未认证返回 401', async () => {
      const req = createMockRequest();

      const result = await requireAuth(req);
      expect(result.user).toBeNull();
      expect(result.errorResponse).toEqual({ body: { error: '未认证' }, status: 401, init: { status: 401 } });
    });

    it('数据库故障返回 503', async () => {
      mockGetUserSuccess();
      mockDbError(new TypeError('fetch failed'));
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

      const result = await requireAuth(req);
      expect(result.user).toBeNull();
      expect(result.errorResponse!.status).toBe(503);
    });
  });

  // ═══ requireAdmin ═══

  describe('requireAdmin', () => {
    it('admin 用户认证成功', async () => {
      mockVerifySessionToken.mockReturnValue({ userId: 'a1', email: 'a@test.com', role: 'admin' });
      const req = createMockRequest({ userToken: 'valid' });

      const result = await requireAdmin(req);
      expect(result.user).not.toBeNull();
      expect(result.errorResponse).toBeNull();
    });

    it('super_admin 用户认证成功', async () => {
      mockVerifySessionToken.mockReturnValue({ userId: 'sa1', email: 'sa@test.com', role: 'super_admin' });
      const req = createMockRequest({ userToken: 'valid' });

      const result = await requireAdmin(req);
      expect(result.user).not.toBeNull();
      expect(result.errorResponse).toBeNull();
    });

    it('普通 user 返回 403', async () => {
      mockVerifySessionToken.mockReturnValue({ userId: 'u1', email: 'u@test.com', role: 'user' });
      const req = createMockRequest({ userToken: 'valid' });

      const result = await requireAdmin(req);
      expect(result.user).toBeNull();
      expect(result.errorResponse!.status).toBe(403);
    });

    it('未认证返回 401', async () => {
      const req = createMockRequest();

      const result = await requireAdmin(req);
      expect(result.user).toBeNull();
      expect(result.errorResponse!.status).toBe(401);
    });

    it('数据库故障返回 503', async () => {
      mockGetUserSuccess();
      mockDbError(new Error('connect ETIMEDOUT'));
      const req = createMockRequest({ authHeader: 'Bearer valid-jwt' });

      const result = await requireAdmin(req);
      expect(result.user).toBeNull();
      expect(result.errorResponse!.status).toBe(503);
    });
  });

  // ═══ AuthDatabaseError ═══

  describe('AuthDatabaseError', () => {
    it('构造函数设置正确的 name 和 message', () => {
      const err = new AuthDatabaseError('数据库连接失败');
      expect(err.name).toBe('AuthDatabaseError');
      expect(err.message).toBe('数据库连接失败');
    });

    it('支持 cause 选项', () => {
      const cause = new TypeError('fetch failed');
      const err = new AuthDatabaseError('服务暂不可用', { cause });
      expect(err.cause).toBe(cause);
      expect(err.message).toBe('服务暂不可用');
    });

    it('是 Error 的实例', () => {
      const err = new AuthDatabaseError('test');
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ═══ getClientUser ═══

  describe('getClientUser', () => {
    it('客户端 localStorage 有有效用户数据', () => {
      const userData = JSON.stringify({ id: '1', email: 'test@test.com' });
      (localStorage.getItem as any).mockReturnValue(userData);

      const result = getClientUser();
      expect(result).toEqual({ id: '1', email: 'test@test.com' });
    });

    it('客户端 localStorage 为空返回 null', () => {
      (localStorage.getItem as any).mockReturnValue(null);

      const result = getClientUser();
      expect(result).toBeNull();
    });

    it('客户端 localStorage 有无效 JSON 返回 null', () => {
      (localStorage.getItem as any).mockReturnValue('{invalid json}');

      const result = getClientUser();
      expect(result).toBeNull();
    });
  });
});
