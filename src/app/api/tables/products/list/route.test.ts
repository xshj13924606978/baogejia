import { describe, it, expect, vi, beforeEach } from 'vitest';

// 构造 Mock NextResponse（支持 new NextResponse(buffer) 与 NextResponse.json）
class MockNextResponse {
  status: number;
  body: any;
  headers: any;
  constructor(body?: any, init?: any) {
    this.body = body;
    this.status = init?.status ?? 200;
    this.headers = init?.headers;
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
      _calls: [] as string[],
      select: vi.fn(() => builder),
      eq: vi.fn((...a: any[]) => {
        builder._calls.push('eq:' + a[0]);
        return builder;
      }),
      ilike: vi.fn((...a: any[]) => {
        builder._calls.push('ilike:' + a[0] + '=' + a[1]);
        return builder;
      }),
      filter: vi.fn((...a: any[]) => {
        builder._calls.push('filter:' + a[0] + '.' + a[1] + '=' + a[2]);
        return builder;
      }),
      or: vi.fn((...a: any[]) => {
        builder._calls.push('or:' + a[0]);
        return builder;
      }),
      in: vi.fn((...a: any[]) => {
        builder._calls.push('in:' + a[0]);
        return builder;
      }),
      order: vi.fn(() => builder),
      range: vi.fn(() => builder),
      gt: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(() => builder),
      maybeSingle: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      _response: responses[table] ?? { data: [], error: null, count: 0 },
      then: function (resolve: any, reject: any) {
        return Promise.resolve(builder._response).then(resolve, reject);
      },
    };
    builders.push(builder);
    return builder;
  });
  return { from, builders };
}

const META = {
  data: [
    { column_name: 'name', data_category: 'text', ordinal_position: 1 },
    { column_name: 'status_flag', data_category: 'non_text', ordinal_position: 2 },
  ],
  error: null,
};

// 复现 route 精确编码（与 production 同步）：含 `*` → imatch + POSIX regex 转义 + PostgREST 引号；
// 否则 ilike + LIKE 转义 + PostgREST 引号。用于断言 captured 表达式与预期编码一致。
function expectedListTerm(value: string): string {
  if (value.includes('*')) {
    const rx = value.replace(/[\\.^$|?*+()[\]{}]/g, '\\$&');
    return `name.imatch."${rx.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  const like = value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `name.ilike."%${like.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;
}
// 复现 route 单值 .filter() 的 POSIX 正则字面量转义（与 production 同步）；单值 .filter() 不做 PostGREST 引号。
function escapePosixRegexLiteral(value: string): string {
  return value.replace(/[\\.^$|?*+()[\]{}]/g, '\\$&');
}

describe('products list route - dynamic column filter (APP-R02)', () => {
  let client: ReturnType<typeof makeSupabaseMock>;

  beforeEach(() => {
    client = makeSupabaseMock({
      products: { data: [{ id: '1' }], error: null, count: 1 },
      products_columns: META,
    });
    vi.resetModules();
    vi.doMock('@/storage/database/supabase-client', () => ({
      getSupabaseClient: () => client,
    }));
    vi.doMock('@/lib/product-visibility', () => ({
      getProductFieldVisibilityContextMap: vi.fn().mockResolvedValue({
        visibility: {},
        currentUserId: null,
      }),
      buildFullVisibility: vi.fn(() => ({})),
      maskProductFieldsByVisibility: vi.fn((row: any) => row),
    }));
    vi.doMock('@/lib/error-handler', () => ({
      safeErrorMessage: vi.fn((e: any) => (e?.message ? String(e.message) : 'error')),
    }));
  });

  function builderFor(table: string) {
    return client.builders.find((b) => b._table === table);
  }

  async function callGet(search: string) {
    const { GET } = await import('./route');
    const req: any = { nextUrl: { searchParams: new URLSearchParams(search) } };
    const res = await GET(req);
    return { res, body: await res.json() };
  }

  it('文本列 → .ilike（子串，LIEK 元字符已转义）', async () => {
    const { res, body } = await callGet('name=foo');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b._calls.some((c: string) => c.startsWith('ilike:name=%foo%'))).toBe(true);
  });

  it('非文本列 → .eq', async () => {
    const { res } = await callGet('status_flag=1');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b.in).not.toHaveBeenCalled();
    expect(b.or).not.toHaveBeenCalled();
    expect(b._calls.some((c: string) => c.startsWith('eq:status_flag'))).toBe(true);
  });

  it('多值非文本 → .in', async () => {
    const { res } = await callGet('status_flag=1,2');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b.in).toHaveBeenCalledWith('status_flag', ['1', '2']);
    expect(b.or).not.toHaveBeenCalled();
  });

  it('多值文本 → .or 仅保留，每值整体双引号 literal 编码', async () => {
    const { res } = await callGet('name=alpha,beta');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b.or).toHaveBeenCalledTimes(1);
    const orArg = b.or.mock.calls[0][0] as string;
    // 两个由代码生成、分别完整双引号包裹的 term；分隔逗号仅出现在 term 之间
    expect(orArg).toBe('name.ilike."%alpha%",name.ilike."%beta%"');
  });

  it('多值文本含保留字符 → 整体双引号 literal，用户值无法改变表达式结构', async () => {
    const { res } = await callGet('name=a"b,c"d');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    const orArg = b.or.mock.calls[0][0] as string;
    // 用户双引号被转义为 \"，逗号仅作为 term 分隔符；字段名/operator 固定
    expect(orArg).toContain('name.ilike."%a\\"b%"');
    expect(orArg).toContain('name.ilike."%c\\"d%"');
    // 不能出现未转义的结构破坏：额外字段/operator 或裸 '='
    expect(orArg).not.toMatch(/ilike\.%a"b%,\s*[^n]/);
  });

  it('单值文本含 LIKE 通配符/保留字符 → .ilike 子串字面量（值参数，非 raw grammar）', async () => {
    const { res } = await callGet('name=a%b_c.d');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b.or).not.toHaveBeenCalled();
    expect(b._calls.some((c: string) => c.startsWith('ilike:name=%a\\%b\\_c.d%'))).toBe(true);
  });

  it('单值文本含用户反斜杠 → LIKE 层先行转义为字面反斜杠（无通配符扩大）', async () => {
    const { res } = await callGet('name=a\\b');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b.or).not.toHaveBeenCalled();
    // 用户 \ → LIKE 层 \\ → 最终 pattern %a\\b%（2 个字面反斜杠）
    expect(b._calls.some((c: string) => c.startsWith('ilike:name=%a\\\\b%'))).toBe(true);
  });

  it('单值文本 a\\%b → 用户反斜杠+百分号均按字面量匹配', async () => {
    const { res } = await callGet('name=a\\%b');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    // 先转义 \ → \\，再 % → \% ⇒ 3 个字面反斜杠后跟 %
    expect(b._calls.some((c: string) => c.startsWith('ilike:name=%a\\\\\\%b%'))).toBe(true);
  });

  it('单值文本 a\\_b → 用户反斜杠+下划线均按字面量匹配', async () => {
    const { res } = await callGet('name=a\\_b');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b._calls.some((c: string) => c.startsWith('ilike:name=%a\\\\\\_b%'))).toBe(true);
  });

  it('多值文本含反斜杠 → 每个 term 整体双引号 literal，反斜杠被 PostgREST 引号层再次转义', async () => {
    const { res } = await callGet('name=a\\b,c\\d');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    const orArg = b.or.mock.calls[0][0] as string;
    const terms = orArg.split(',');
    expect(terms).toHaveLength(2);
    for (const t of terms) {
      expect(t.startsWith('name.ilike."%')).toBe(true);
      expect(t.endsWith('%"')).toBe(true);
    }
  });

  it('无动态筛选参数 → 不查询 products_columns 元数据（无必要依赖）', async () => {
    await callGet('keyword=abc&page=2&limit=5');
    expect(client.from).not.toHaveBeenCalledWith('products_columns');
  });

  it('未知动态筛选字段 → 拒绝 400（authoritative exact-membership gate）', async () => {
    const { res, body } = await callGet('evil_col=x');
    expect(res.status).toBe(400);
    const b = builderFor('products');
    expect(b._calls.some((c: string) => c.includes('evil_col'))).toBe(false);
  });

  it('单值文本含字面量 `*` → 不走 ilike，改 imatch（regex 字面量子串，无外层 PostGREST 引号）', async () => {
    const { res } = await callGet('name=a*b');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    expect(b.ilike).not.toHaveBeenCalled();
    expect(b.filter).toHaveBeenCalledTimes(1);
    expect(b.filter.mock.calls[0][0]).toBe('name');
    expect(b.filter.mock.calls[0][1]).toBe('imatch');
    // 单值 .filter() 仅做 regex 转义，值无外层双引号；内部 `*` 转义为 \*，不原样出现
    const val = b.filter.mock.calls[0][2] as string;
    expect(val).toBe(escapePosixRegexLiteral('a*b'));
    expect(val.startsWith('"')).toBe(false);
    expect(val.endsWith('"')).toBe(false);
  });

  it('多值文本混合普通与含 `*` → .or 内 ilike 与 imatch 共存，operator 均固定', async () => {
    const { res } = await callGet('name=alpha,a*b');
    expect(res.status).toBe(200);
    const b = builderFor('products');
    const orArg = b.or.mock.calls[0][0] as string;
    expect(orArg).toContain(expectedListTerm('alpha'));
    expect(orArg).toContain(expectedListTerm('a*b'));
    expect(orArg).not.toMatch(/name\.ilike\.[^,]*\*[^,]/);
  });

  it('list 含 `*` 文本列筛选：regex 元字符全部转义（单值 .filter 无外层引号）', async () => {
    const cases = ['a*b', 'a.*b', 'a+b*', 'a?b*', 'a|b*', 'a(b)*', 'a[b]*', 'a{1}*', '^foo*$', 'a\\*b', 'Unicode*', 'foo.or.*bar'];
    for (const v of cases) {
      // 记录本 case 前已累积的 builders，调用后只取本次新产生的，绝不读历史首个
      const beforeCount = client.builders.length;
      const { res } = await callGet('name=' + encodeURIComponent(v));
      expect(res.status).toBe(200);
      const newBuilders = client.builders.slice(beforeCount);
      expect(newBuilders.length).toBeGreaterThan(0);
      const b = newBuilders.find((x: any) => x._table === 'products');
      expect(b).toBeDefined();
      expect(b.ilike).not.toHaveBeenCalled();
      const call = b._calls.find((c: string) => c.startsWith('filter:name.imatch='));
      expect(call).toBeDefined();
      const val = call!.slice('filter:name.imatch='.length);
      // 值 = regex 字面量（无外层 PostGREST 引号），与 route 同款转义一致；无结构破坏
      expect(val).toBe(escapePosixRegexLiteral(v));
      expect(val.startsWith('"')).toBe(false);
      expect(val.endsWith('"')).toBe(false);
    }
  });

  it('元数据查询失败 → fail-closed 500', async () => {
    client = makeSupabaseMock({
      products: { data: [], error: null, count: 0 },
      products_columns: { data: null, error: { message: 'meta fail' } },
    });
    vi.doMock('@/storage/database/supabase-client', () => ({
      getSupabaseClient: () => client,
    }));
    const { res } = await callGet('name=foo');
    expect(res.status).toBe(500);
  });
});
