import { describe, it, expect, vi, beforeEach } from 'vitest';

class MockNextResponse {
  status: number;
  body: any;
  constructor(body?: any, init?: any) {
    this.body = body;
    this.status = init?.status ?? 200;
  }
  async json() {
    return this.body;
  }
  static json(body: any, init?: any) {
    return new MockNextResponse(body, init);
  }
}
vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));

function makeSupabaseMock(responses: Record<string, any>) {
  const builders: any[] = [];
  const from = vi.fn((table: string) => {
    const builder: any = {
      _table: table,
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      range: vi.fn(() => builder),
      single: vi.fn(() => builder),
      maybeSingle: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      _response: responses[table] ?? { data: [{}], error: null },
      then: function (resolve: any, reject: any) {
        return Promise.resolve(builder._response).then(resolve, reject);
      },
    };
    builders.push(builder);
    return builder;
  });
  return { from, builders };
}

describe('product import route (APP-R01 / R25)', () => {
  const requiredKeysMock = vi.fn();

  beforeEach(() => {
    requiredKeysMock.mockReset();
    vi.resetModules();
    // 所有依赖 mock 必须在 import route 之前注册（Vitest hoisting / doMock 顺序）
    vi.doMock('@/lib/error-handler', () => ({
      safeErrorMessage: vi.fn((e: any) => (e?.message ? String(e.message) : 'error')),
    }));
    vi.doMock('@/lib/knowledge/api-utils', () => ({
      resolveAuthContext: vi.fn().mockResolvedValue({
        isAuthenticated: true,
        currentUserId: 'u1',
        contextError: null,
      }),
    }));
    vi.doMock('@/lib/auth-utils', () => ({
      getCurrentUser: vi.fn().mockResolvedValue({ name: 'tester', email: 't@e.com' }),
    }));
    vi.doMock('@/lib/product-field-merge', () => ({
      getProductRequiredFieldKeys: requiredKeysMock,
    }));
    vi.doMock('@/lib/duplicate-checker', () => ({
      createDuplicateChecker: vi.fn().mockResolvedValue({
        getConfig: () => ({ fields: ['name'], matchRule: 'and' }),
        checkDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false, reason: '' }),
      }),
    }));
    vi.doMock('@/lib/contributor/service', () => ({
      submitProductUpdateRequest: vi.fn().mockResolvedValue({ success: true }),
    }));
  });

  async function callPost(body: any, client: any) {
    vi.doMock('@/storage/database/supabase-client', () => ({
      getSupabaseClient: () => client,
      getSupabaseServiceClient: () => client,
    }));
    const { POST } = await import('./route');
    const req: any = {
      method: 'POST',
      json: async () => body,
      nextUrl: { searchParams: new URLSearchParams('') },
      headers: { get: () => '' },
    };
    const res = await POST(req);
    return { res, body: await res.json() };
  }

  it('必填字段元数据获取失败 → fail-closed 500，且不得进行插入 mutation', async () => {
    requiredKeysMock.mockRejectedValue(new Error('meta fail'));
    const client = makeSupabaseMock({});
    const { res, body } = await callPost({ products: [{ name: 'X' }] }, client);
    expect(res.status).toBe(500);
    expect(body.error).toContain('必填字段配置失败');
    expect(client.from).not.toHaveBeenCalledWith('products');
  });

  it('必填字段元数据成功 → 正常校验并插入（正确 payload 形状 products[]）', async () => {
    requiredKeysMock.mockResolvedValue(['name']);
    const client = makeSupabaseMock({
      products: { data: [{ id: 'p1' }], error: null },
      import_logs: { data: [{ id: 'l1' }], error: null },
    });
    const { res, body } = await callPost({ products: [{ name: 'X', price: 1 }] }, client);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const productsBuilder = client.builders.find((b: any) => b._table === 'products');
    expect(productsBuilder.insert).toHaveBeenCalled();
  });
});
