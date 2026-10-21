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

describe('product template route (APP-R17)', () => {
  let client: ReturnType<typeof makeSupabaseMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/lib/product-visibility', () => ({
      getProductFieldVisibility: vi.fn().mockResolvedValue(true),
      SENSITIVE_PRODUCT_FIELDS: [],
    }));
    vi.doMock('@/lib/error-handler', () => ({
      safeErrorMessage: vi.fn((e: any) => (e?.message ? String(e.message) : 'error')),
    }));
  });

  // metaResult 为 products_columns 的「原始 Supabase 结果」{ data, error }，直接作为 mock 响应，
  // 不得再次包入 data（否则 error=null 只会变成畸形 data，掩盖真实 query error）。
  async function callGet(pfcData: unknown, metaResult: unknown) {
    client = makeSupabaseMock({
      product_field_configs: { data: pfcData, error: null },
      products: { data: [], error: null },
      products_columns: metaResult,
    });
    vi.doMock('@/storage/database/supabase-client', () => ({
      getSupabaseServiceClient: () => client,
    }));
    const { GET } = await import('./route');
    const req: any = { method: 'GET', nextUrl: { searchParams: new URLSearchParams('') } };
    const res = await GET(req);
    return { res, body: await res.json() };
  }

  it('field_configs 有配置 → 使用 configured 路径（status 200）', async () => {
    const { res } = await callGet(
      [{ field_key: 'name', field_label: '名称', is_required: true, is_visible: true, display_order: 1 }],
      { data: [], error: null },
    );
    expect(res.status).toBe(200);
  });

  it('field_configs 为空 → 回退 products_columns 元数据视图（查询元数据）', async () => {
    const { res } = await callGet(
      [],
      {
        data: [
          { column_name: 'name', data_category: 'text', ordinal_position: 1 },
          { column_name: 'price', data_category: 'non_text', ordinal_position: 2 },
        ],
        error: null,
      },
    );
    expect(res.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith('products_columns');
  });

  it('元数据查询失败（data=null, error=object）→ fail-closed 500（真实 Supabase query error）', async () => {
    const { res } = await callGet([], { data: null, error: { message: 'meta fail' } });
    expect(res.status).toBe(500);
  });

  it('元数据返回畸形数据（error=null）→ helper 校验 fail-closed 500（非 query error）', async () => {
    const { res } = await callGet([], { data: { nested: 'object' }, error: null });
    expect(res.status).toBe(500);
  });
});
