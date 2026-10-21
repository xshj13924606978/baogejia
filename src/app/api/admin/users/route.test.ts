import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

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

// 单 route 导入 + per-test 可变 mock state（避免动态模块缓存导致的空跑断言）。
// 显式类型化 mock state：仅覆盖测试真正使用的 Supabase-like 查询 API（data/error/count），
// 解除 vi.hoisted 推断出的过窄返回类型（data 仅 {id}[]、error 仅 null、count 必填）导致
// 后续重赋值（data:null / error:{message} / 缺 count）的 TS 错误；运行期行为完全不变。
interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number;
}
interface AdminTestState {
  builders: any[];
  requireAdminImpl: (req?: unknown) => Promise<{ user: { id: string } | null; errorResponse: unknown }>;
  statsCallCount: number;
  statsHandler: (table: string, sel: unknown) => QueryResult;
  listingHandler: (table: string, sel: unknown) => QueryResult;
}
const testState = vi.hoisted<AdminTestState>(() => ({
  builders: [] as any[],
  requireAdminImpl: async () => ({ user: { id: '00000000-0000-0000-0000-000000000001' }, errorResponse: null }),
  statsCallCount: 0,
  statsHandler: (table: string, sel: any) => ({ data: [{ id: '00000000-0000-0000-0000-000000000001' }], error: null, count: 1 }),
  listingHandler: (table: string, sel: any) => ({ data: [{ id: '00000000-0000-0000-0000-000000000001' }], error: null, count: 1 }),
}));

function makeSupabaseMock() {
  const builders: any[] = [];
  const from = (table: string) => {
    const builder: any = {
      _table: table,
      _calls: [] as string[],
      _selectArg: null as any,
      _awaitCount: 0,
      select: (...a: any[]) => {
        builder._selectArg = a[0];
        return builder;
      },
      eq: (...a: any[]) => {
        builder._calls.push('eq:' + a[0] + '=' + a[1]);
        return builder;
      },
      or: (...a: any[]) => {
        builder._calls.push('or:' + a[0]);
        return builder;
      },
      order: (...a: any[]) => {
        builder._calls.push('order:' + a[0]);
        return builder;
      },
      range: () => builder,
      gt: (...a: any[]) => {
        builder._calls.push('gt:' + a[0] + '=' + a[1]);
        return builder;
      },
      limit: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      insert: () => builder,
      in: (...a: any[]) => {
        builder._calls.push('in:' + a[0]);
        return builder;
      },
      then: function (resolve: any, reject: any) {
        const sel = builder._selectArg;
        let resp: any;
        if (typeof sel === 'string' && sel.includes('points_int')) {
          resp = testState.statsHandler(table, sel);
        } else if (table === 'users') {
          resp = testState.listingHandler(table, sel);
        } else {
          resp = { data: [], error: null };
        }
        return Promise.resolve(resp).then(resolve, reject);
      },
    };
    builders.push(builder);
    return builder;
  };
  testState.builders = builders;
  return { from };
}

vi.mock('@/lib/auth-utils', () => ({ requireAdmin: (...a: any[]) => testState.requireAdminImpl(a[0]) }));
vi.mock('@/lib/error-handler', () => ({
  safeErrorMessage: (e: any) => (e?.message ? String(e.message) : 'error'),
}));
vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseServiceClient: () => makeSupabaseMock(),
}));

// canonical UUID（仅格式合法 + 末 12 位 hex 递增，可比较）
function uuid(i: number): string {
  return '00000000-0000-0000-0000-' + String(i).padStart(12, '0');
}
function makeRows(n: number, startId: number, pointsInt = 10) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: uuid(startId + i),
      role: i % 4 === 0 ? 'vip' : i % 3 === 0 ? 'enterprise_admin' : 'user',
      status: i % 2 === 0 ? 'active' : 'pending',
      metadata: {},
      points_int: pointsInt,
    });
  }
  return rows;
}
// 复现 route 精确编码（与 production 同步）：no-star → ilike + LIKE 转义 + PostgREST 引号；
// 含 `*` → imatch + POSIX regex 转义 + PostgREST 引号。用于断言 .or() 每字段 term 与预期编码一致。
function expectedAdminTerm(field: string, kw: string): string {
  if (kw.includes('*')) {
    const rx = kw.replace(/[\\.^$|?*+()[\]{}]/g, '\\$&');
    return `${field}.imatch."${rx.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  const like = kw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `${field}.ilike."%${like.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;
}

let GET: any;
beforeAll(async () => {
  ({ GET } = await import('./route'));
});

describe('admin users route (APP-R03 / APP-R04)', () => {
  beforeEach(() => {
    testState.builders = [];
    testState.statsCallCount = 0;
    testState.requireAdminImpl = async () => ({ user: { id: '00000000-0000-0000-0000-000000000001' }, errorResponse: null });
    testState.statsHandler = () => ({ data: [{ id: uuid(1), points_int: 10 }], error: null, count: 1 });
    testState.listingHandler = () => ({ data: [{ id: uuid(1) }], error: null, count: 1 });
  });

  function userBuilders(): any[] {
    return testState.builders.filter((b: any) => b._table === 'users');
  }
  function reqFor(search: string): any {
    return { nextUrl: { searchParams: new URLSearchParams(search) } };
  }

  it('requireAdmin 失败 → 不查询 DB（在 DB 操作前）', async () => {
    testState.requireAdminImpl = async () => ({
      user: null,
      errorResponse: MockNextResponse.json({ success: false }, { status: 401 }),
    });
    const res = await GET(reqFor(''));
    expect(res.status).toBe(401);
    expect(userBuilders().length).toBe(0);
  });

  it('stats .select() 固定包含 DB 侧 points_int 投影（无 request 插值）', async () => {
    await GET(reqFor(''));
    const statsBuilder = userBuilders().find(
      (b) => typeof b._selectArg === 'string' && b._selectArg.includes('points_int'),
    );
    expect(statsBuilder).toBeDefined();
    expect(statsBuilder!._selectArg).toBe(
      'id, role, status, metadata, points_int:metadata->>points::int',
    );
    expect(statsBuilder!._selectArg).not.toMatch(/points_int:metadata->>points::int[^,]*\$\{/);
  });

  it('keyword 进入 .or() 且按 `*` 有无选择 ilike/imatch（字段/operator 固定，整体双引号 literal）', async () => {
    const noStar = ['john', 'john@example.com', 'a,b', 'a.b', 'a:b', 'a(b', 'a"b', 'a\\b', 'a%b', 'a_b', 'a\\%b', 'a\\_b', '中文', 'foo.or.bar', 'or', 'and', 'not', 'eq'];
    const withStar = ['a*b', 'a.*b', 'a+b', 'a?b', 'a|b', 'a(b)', 'a[b]', 'a{1}', '^foo$', 'a\\*b', '中文*测试', 'foo.or.*bar'];
    for (const kw of [...noStar, ...withStar]) {
      // 成功路径必须使用合法 canonical UUID（否则生产先拒主键 → 500）
      testState.statsHandler = () => ({ data: [{ id: uuid(1), points_int: 10 }], error: null, count: 1 });
      testState.listingHandler = () => ({ data: [{ id: uuid(1) }], error: null, count: 1 });
      const res = await GET(reqFor('keyword=' + encodeURIComponent(kw)));
      expect(res.status).toBe(200);
      const ubs = userBuilders();
      expect(ubs.length).toBeGreaterThan(0);
      const statsBuilder = ubs.find((b) => b._calls.some((c: string) => c.startsWith('or:')));
      expect(statsBuilder).toBeDefined();
      const arg = statsBuilder!._calls.find((c: string) => c.startsWith('or:'))!.slice(3);
      // 3 个固定字段 + 统一 operator 选择（no-star→ilike，含 *→imatch）；用户值完全在引号内
      for (const f of ['email', 'username', 'full_name']) {
        expect(arg).toContain(`${f}.${kw.includes('*') ? 'imatch' : 'ilike'}.`);
        expect(arg).toContain(expectedAdminTerm(f, kw));
      }
    }
  });

  it('keyword/role/status 组合 → .or(keyword) + .eq(role) + .eq(status) 同时应用', async () => {
    const res = await GET(reqFor('keyword=x&role=vip&status=pending'));
    expect(res.status).toBe(200);
    for (const b of userBuilders()) {
      expect(b._calls.some((c: string) => c.startsWith('or:'))).toBe(true);
      expect(b._calls.some((c: string) => c.startsWith('eq:role=vip'))).toBe(true);
      expect(b._calls.some((c: string) => c.startsWith('eq:status=pending'))).toBe(true);
    }
  });

  it('listing 与 stats 共用同一 filter contract（调用集合一致）', async () => {
    await GET(reqFor('keyword=x&role=vip&status=pending'));
    const ubs = userBuilders();
    expect(ubs.length).toBeGreaterThanOrEqual(2);
    const filterCalls = (b: any) => b._calls.filter((c: string) => c.startsWith('or:') || c.startsWith('eq:'));
    expect(filterCalls(ubs[0]).sort()).toEqual(filterCalls(ubs[1]).sort());
  });

  it('stats 第一页满 PAGE_SIZE → 第二页 execution（gt(id)=EXACT_FIRST_PAGE_LAST_ID）且计入统计', async () => {
    testState.statsHandler = () => {
      testState.statsCallCount++;
      if (testState.statsCallCount === 1) return { data: makeRows(1000, 1), error: null };
      return { data: makeRows(2, 1001), error: null };
    };
    const res = await GET(reqFor(''));
    const body = await res.json();
    expect(res.status).toBe(200);
    const statsBuilder = userBuilders().find((b) => b._calls.some((c: string) => c.startsWith('gt:')));
    expect(statsBuilder).toBeDefined();
    expect(statsBuilder!._calls).toContain('gt:id=' + uuid(1000));
    expect(body.stats.total).toBe(1002);
    expect(body.stats.totalPoints).toBe(10020);
  });

  it('stats 分页查询失败 → fail-closed 500（不返回假 0）', async () => {
    testState.statsHandler = () => ({ data: null, error: { message: 'stats fail' } });
    const res = await GET(reqFor(''));
    expect(res.status).toBe(500);
  });

  it('stats 主键非法（非 UUID）→ fail-closed 500', async () => {
    testState.statsHandler = () => ({
      data: [{ id: 'not-a-uuid', role: 'user', status: 'active', metadata: {}, points_int: 0 }],
      error: null,
    });
    const res = await GET(reqFor(''));
    expect(res.status).toBe(500);
  });

  it('stats 主键重复 → fail-closed 500', async () => {
    testState.statsHandler = () => ({
      data: [
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: 0 },
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: 0 },
      ],
      error: null,
    });
    const res = await GET(reqFor(''));
    expect(res.status).toBe(500);
  });

  it('stats 页内主键不严格递增 → fail-closed 500', async () => {
    testState.statsHandler = () => ({
      data: [
        { id: uuid(2), role: 'user', status: 'active', metadata: {}, points_int: 0 },
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: 0 },
      ],
      error: null,
    });
    const res = await GET(reqFor(''));
    expect(res.status).toBe(500);
  });

  it('stats 第二页首 id 不大于上一页末 → fail-closed 500', async () => {
    testState.statsHandler = () => {
      testState.statsCallCount++;
      if (testState.statsCallCount === 1) return { data: makeRows(1000, 1), error: null };
      return { data: [{ id: uuid(500), role: 'user', status: 'active', metadata: {}, points_int: 0 }], error: null };
    };
    const res = await GET(reqFor(''));
    expect(res.status).toBe(500);
  });

  it('points_int=null → 计入 0', async () => {
    testState.statsHandler = () => ({
      data: [
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: null },
        { id: uuid(2), role: 'user', status: 'active', metadata: {}, points_int: null },
      ],
      error: null,
    });
    const res = await GET(reqFor(''));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stats.totalPoints).toBe(0);
  });

  it('points_int 合法整数 → 正确累加（含 0 / -1 / INT4 上下界）', async () => {
    testState.statsHandler = () => ({
      data: [
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: 0 },
        { id: uuid(2), role: 'user', status: 'active', metadata: {}, points_int: 1 },
        { id: uuid(3), role: 'user', status: 'active', metadata: {}, points_int: -1 },
        { id: uuid(4), role: 'user', status: 'active', metadata: {}, points_int: 2147483647 },
        { id: uuid(5), role: 'user', status: 'active', metadata: {}, points_int: -2147483648 },
      ],
      error: null,
    });
    const res = await GET(reqFor(''));
    const body = await res.json();
    expect(res.status).toBe(200);
    // 0 + 1 + (-1) + 2147483647 + (-2147483648) = -1
    expect(body.stats.totalPoints).toBe(-1);
  });

  it('points_int 脏投影值（bool/obj/array/string/小数/NaN/Infinity/越界）→ fail-closed 500', async () => {
    for (const bad of [true, false, {}, [], 'abc', 1.5, NaN, Infinity, 2147483648, -2147483649]) {
      testState.statsHandler = () => ({
        data: [{ id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: bad }],
        error: null,
      });
      const res = await GET(reqFor(''));
      expect(res.status).toBe(500);
    }
  });

  it('points_int 总和越界 int4 → fail-closed 500', async () => {
    testState.statsHandler = () => ({
      data: [
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: 2147483647 },
        { id: uuid(2), role: 'user', status: 'active', metadata: {}, points_int: 1 },
      ],
      error: null,
    });
    expect((await GET(reqFor(''))).status).toBe(500);

    testState.statsHandler = () => ({
      data: [
        { id: uuid(1), role: 'user', status: 'active', metadata: {}, points_int: -2147483648 },
        { id: uuid(2), role: 'user', status: 'active', metadata: {}, points_int: -1 },
      ],
      error: null,
    });
    expect((await GET(reqFor(''))).status).toBe(500);
  });

  it('空 dataset → total_points=0', async () => {
    testState.statsHandler = () => ({ data: [], error: null });
    const res = await GET(reqFor(''));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stats.total).toBe(0);
    expect(body.stats.totalPoints).toBe(0);
  });
});
