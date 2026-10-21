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
      select: vi.fn((...a: any[]) => {
        builder._selectArg = a[0];
        return builder;
      }),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => builder),
      single: vi.fn(() => builder),
      maybeSingle: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      _response: responses[table] ?? { data: [], error: null },
      then: function (resolve: any, reject: any) {
        return Promise.resolve(builder._response).then(resolve, reject);
      },
    };
    builders.push(builder);
    return builder;
  });
  return { from, builders };
}

const META_BRAND = {
  data: [{ column_name: 'brand', data_category: 'text', ordinal_position: 1 }],
  error: null,
};

describe('products distinct route - physical column gate (APP-R22)', () => {
  let client: ReturnType<typeof makeSupabaseMock>;

  async function callGet(column: string) {
    vi.resetModules();
    vi.doMock('@/storage/database/supabase-client', () => ({
      getSupabaseServiceClient: () => client,
    }));
    vi.doMock('@/lib/permission-check', () => ({
      withAdmin: (handler: any) => handler,
    }));
    vi.doMock('@/lib/error-handler', () => ({
      safeErrorMessage: vi.fn((e: any) => (e?.message ? String(e.message) : 'error')),
    }));
    const { GET } = await import('./route');
    const req: any = { nextUrl: { searchParams: new URLSearchParams('column=' + column) } };
    const res = await GET(req);
    return { res, body: await res.json() };
  }

  it('已知物理列 + 可见 → 成功返回 distinct 计数', async () => {
    client = makeSupabaseMock({
      products_columns: META_BRAND,
      product_field_configs: { data: { field_key: 'brand', is_visible: true }, error: null },
      products: { data: [{ brand: 'A' }, { brand: 'A' }, { brand: 'B' }], error: null },
    });
    const { res, body } = await callGet('brand');
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ value: 'A', count: 2 });
  });

  it('物理但业务隐藏（pfc.is_visible=false）→ 拒绝 400', async () => {
    client = makeSupabaseMock({
      products_columns: META_BRAND,
      product_field_configs: { data: { field_key: 'brand', is_visible: false }, error: null },
      products: { data: [], error: null },
    });
    const { res } = await callGet('brand');
    expect(res.status).toBe(400);
  });

  it('未知物理列 → 拒绝 400（exact-membership gate，不进入 .select）', async () => {
    client = makeSupabaseMock({
      products_columns: META_BRAND,
      product_field_configs: { data: null, error: { message: 'x' } },
      products: { data: [], error: null },
    });
    const { res } = await callGet('evil_col');
    expect(res.status).toBe(400);
    expect(client.from).not.toHaveBeenCalledWith('products');
  });

  it('配置中存在但非物理列 → 拒绝 400（物理元数据先行）', async () => {
    client = makeSupabaseMock({
      products_columns: META_BRAND,
      product_field_configs: { data: { field_key: 'weird', is_visible: true }, error: null },
      products: { data: [], error: null },
    });
    const { res } = await callGet('weird');
    expect(res.status).toBe(400);
  });

  it('奇怪/恶意列选择器 → 仅因 exact membership 失败拒绝，不到 .select(column)', async () => {
    client = makeSupabaseMock({
      products_columns: META_BRAND,
      product_field_configs: { data: null, error: { message: 'x' } },
      products: { data: [], error: null },
    });
    const { res } = await callGet('brand OR 1=1');
    expect(res.status).toBe(400);
    const productsBuilder = client.builders.find((b) => b._table === 'products');
    expect(productsBuilder).toBeUndefined();
  });

  it('元数据查询失败 → 拒绝 500，不进入 .select', async () => {
    client = makeSupabaseMock({
      products_columns: { data: null, error: { message: 'meta fail' } },
      product_field_configs: { data: null, error: null },
      products: { data: [], error: null },
    });
    const { res } = await callGet('brand');
    expect(res.status).toBe(500);
    expect(client.from).not.toHaveBeenCalledWith('products');
  });
});
