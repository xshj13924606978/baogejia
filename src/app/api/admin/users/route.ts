export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * GET - 获取用户列表
 * 支持分页、搜索、角色筛选、状态筛选
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getSupabaseServiceClient();
    const filters: UserFilters = { keyword, role, status };

    // 列表查询：与统计共用同一结构化 filter contract（APP-R03/APP-R04）
    const query = applyUserFilters(
      db.from('users').select('*', { count: 'exact' }),
      filters,
    );

    const offset = (page - 1) * limit;
    const [{ data, error, count }, stats] = await Promise.all([
      query.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
      computeUserStats(db, filters),
    ]);

    if (error) {
      console.error('[Users API] 查询失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    // 格式化用户数据
    const formattedUsers = (data || []).map((u: any) => ({
      id: u.id,
      // #20260822-1630：与前端 display 规则一致（metadata?.name || full_name || username），
      // 否则用户改 metadata.name 后管理后台仍显示陈旧 full_name（如注册默认 "888"）
      name: u.metadata?.name || u.full_name || u.username,
      email: u.email,
      username: u.username,
      role: u.role || 'user',
      status: u.status || 'active',
      phone: u.metadata?.phone || '',
      avatar: u.avatar_url || u.metadata?.avatar_url || '',
      points: u.metadata?.points || 0,
      createdAt: u.created_at,
      lastLogin: u.last_login,
      metadata: u.metadata || {},
    }));

    // 批量获取用户等级
    const userIds = formattedUsers.map((u) => u.id);
    const { data: userLevels } = await db
      .from('user_levels')
      .select('user_id, level')
      .in('user_id', userIds);

    // #20260827-0826-4 修复：批量获取微信绑定状态（真实数据，来自 user_oauth_bindings）
    const { data: wechatBindings } = await db
      .from('user_oauth_bindings')
      .select('user_id, nickname')
      .in('user_id', userIds)
      .eq('provider', 'wechat');
    const wechatMap = new Map(
      (wechatBindings || []).map((b: any) => [b.user_id, b.nickname || '']),
    );

    const levelMap = new Map((userLevels || []).map((l: any) => [l.user_id, l.level]));
    const finalUsers = formattedUsers.map((u) => ({
      ...u,
      level: levelMap.get(u.id) || 1,
      wechat: wechatMap.has(u.id),
      wechatNickname: wechatMap.get(u.id) || '',
    }));

    return NextResponse.json({
      success: true,
      data: finalUsers,
      total: count || 0,
      page,
      limit,
      stats,
    });
  } catch (error: any) {
    console.error('[Users API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取用户列表失败' }, { status: 500 });
  }
}

interface UserFilters {
  keyword: string;
  role: string;
  status: string;
}

// 第 1 层：PostgreSQL ILIKE 字面量转义（顺序：先 \ → \\，再 % → \%、_ → \_）。
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
// 第 2 层：PostgREST raw filter grammar 字面量编码（仅用于保留的 .or()）。
// 整个最终 pattern 包双引号；内部 \ → \\、" → \"。用户输入无法改变表达式结构。
function quotePostgrestLiteral(pattern: string): string {
  return '"' + pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
// 字面量子串 ILIKE pattern：代码控制前后通配符 + 先转义用户输入中的 LIKE 元字符。
function buildSubstringPattern(value: string): string {
  return '%' + escapeLikePattern(value) + '%';
}
// POSIX 正则字面量转义：PostgREST 的 ilike 把字面量 `*` 当作 `%` 别名，故含 `*` 的 keyword
// 改走 imatch（PostgreSQL ~*）；此处把用户输入转义为纯字面量正则文本，与 LIKE 层转义相互独立。
function escapePosixRegexLiteral(value: string): string {
  return value.replace(/[\\.^$|?*+()[\]{}]/g, '\\$&');
}

// 列表与统计共用的结构化 filter contract（APP-R03/APP-R04）：
// keyword → 跨 email/username/full_name 的 OR 子串（仅此处保留 .or()，值经有界编码）；
// role/status → 等值过滤，字段名/操作符均为代码常量。
// 用非递归的 FilterableBuilder 仅作为 cast 目标，避免对 Supabase 深层查询构造类型做
// `T extends <递归接口>` 约束检查而触发 TS2589（类型实例化过深）。函数保持非约束泛型 <T>，
// 返回原始深层 builder（调用方仍需 .order/.range/.gt/.limit/.then）；运行期 or/eq 链式与
// 结构化 filter contract 完全不变。b 与 q 指向同一 builder 对象，or/eq 调用即对 q 生效。
type FilterableBuilder = {
  or: (expr: string) => FilterableBuilder;
  eq: (column: string, value: string) => FilterableBuilder;
};
function applyUserFilters<T>(q: T, filters: UserFilters): T {
  const b = q as FilterableBuilder;
  if (filters.keyword) {
    // keyword 跨 3 个固定字段 OR 子串；字段名/operator 均为代码常量；逗号仅作为代码生成的 term 分隔符。
    // 含 `*` → 各字段 imatch（regex 字面量子串）；否则 ilike（LIKE 字面量子串，先转义 \ % _）。
    // 值整体经双引号 literal 编码 → 不可逃逸表达式结构。
    if (filters.keyword.includes('*')) {
      const lit = quotePostgrestLiteral(escapePosixRegexLiteral(filters.keyword));
      b.or(`email.imatch.${lit},username.imatch.${lit},full_name.imatch.${lit}`);
    } else {
      const pattern = quotePostgrestLiteral(buildSubstringPattern(filters.keyword));
      b.or(`email.ilike.${pattern},username.ilike.${pattern},full_name.ilike.${pattern}`);
    }
  }
  if (filters.role) b.eq('role', filters.role);
  if (filters.status) b.eq('status', filters.status);
  return q;
}

interface CollectedUserRow {
  id: string;
  role: string | null;
  status: string | null;
  points: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 规范化 UUID 文本并按 hex 字典序比较（等价于 PostgreSQL UUID 字节序，仅对 canonical UUID 成立）。
function uuidHex(u: string): string {
  return u.toLowerCase().replace(/-/g, '');
}
function uuidGreater(a: string, b: string): boolean {
  return uuidHex(a) > uuidHex(b);
}

// points 由 PostgreSQL 在 REST 序列化前执行：select 固定包含 points_int:metadata->>points::int
// （无 request 插值，纯代码常量）。因此此处只校验「数据库已 cast 出的 int4 结果」：
// null/undefined → 0；number 且为 int4 范围整数 → 接受；其余（string/小数/NaN/Infinity/越界）
// = 脏响应 → 抛错（fail-closed）。JS 不再重实现 PostgreSQL int4 词法。
const ADMIN_POINTS_PROJECTION = 'points_int:metadata->>points::int';
function validateProjectedPoints(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= -2147483648 && raw <= 2147483647) {
    return raw;
  }
  throw new Error('非法的 points_int 投影值');
}

// 扫描完整 filtered dataset（keyset 分页：稳定序 order('id') + gt('id',lastId)，每页重应用相同 filter）。
// 任一分页查询失败 / 主键非法 / 重复 / 不严格递增 / points 非法 → 抛错（fail-closed，不返回假 0）。
// REST 分页无法提供单事务快照，故仅保证：同数据集、同 filter、内存内一致计算（非快照隔离）。
async function collectFilteredUsers(
  db: SupabaseClient,
  filters: UserFilters,
): Promise<CollectedUserRow[]> {
  const PAGE_SIZE = 1000;
  const rows: CollectedUserRow[] = [];
  const seenIds = new Set<string>();
  let prevLastId: string | null = null;

  for (;;) {
    // 固定投影：id/role/status/metadata 供非 points 统计；points_int 由 DB 执行 (metadata->>'points')::int。
    // 无 request 插值，ADMIN_POINTS_PROJECTION 为纯代码常量。
    let q = applyUserFilters(
      db.from('users').select(`id, role, status, metadata, ${ADMIN_POINTS_PROJECTION}`),
      filters,
    );
    q = q.order('id', { ascending: true });
    if (prevLastId !== null) q = q.gt('id', prevLastId);
    q = q.limit(PAGE_SIZE);

    const { data, error } = await q;
    if (error) throw new Error('统计查询失败');
    const pageRows = (data || []) as Array<{
      id: string;
      role?: string | null;
      status?: string | null;
      metadata?: unknown | null;
      points_int?: unknown | null;
    }>;
    if (pageRows.length === 0) break;

    let prevInPage: string | null = null;
    for (const r of pageRows) {
      if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) {
        throw new Error('统计分页主键非法');
      }
      if (seenIds.has(r.id)) throw new Error('统计分页主键重复');
      if (prevLastId !== null && !uuidGreater(r.id, prevLastId)) {
        throw new Error('统计分页主键未严格递增');
      }
      if (prevInPage !== null && !uuidGreater(r.id, prevInPage)) {
        throw new Error('统计分页页内主键未严格递增');
      }
      seenIds.add(r.id);
      prevInPage = r.id;
      const points = validateProjectedPoints(r.points_int);
      rows.push({
        id: r.id,
        role: r.role ?? null,
        status: r.status ?? null,
        points,
      });
    }

    prevLastId = pageRows[pageRows.length - 1].id;
    if (pageRows.length < PAGE_SIZE) break;
  }
  return rows;
}

// 基于同一 filtered dataset 在内存中计算全部统计指标（APP-R04，单一数据源）。
// points 用 BigInt 累加，最终按旧 SQL 的 SUM(... )::int 做 int4 范围校验：
// 任一单项已为合法 int4（见 validateProjectedPoints），但总和越界仍需抛错（fail-closed）。
const ADMIN_POINTS_INT4_MIN = -2147483648n;
const ADMIN_POINTS_INT4_MAX = 2147483647n;
function computeStatsFromRows(rows: CollectedUserRow[]): {
  total: number;
  active: number;
  pending: number;
  enterprise: number;
  vip: number;
  totalPoints: number;
} {
  let active = 0;
  let pending = 0;
  let enterprise = 0;
  let vip = 0;
  let totalPointsBigInt = 0n;
  for (const r of rows) {
    if (r.status === 'active') active++;
    if (r.status === 'pending') pending++;
    if (r.role === 'enterprise_admin') enterprise++;
    if (r.role === 'vip') vip++;
    totalPointsBigInt += BigInt(r.points);
  }
  if (totalPointsBigInt < ADMIN_POINTS_INT4_MIN || totalPointsBigInt > ADMIN_POINTS_INT4_MAX) {
    throw new Error('积分总和超出 int4 范围');
  }
  return { total: rows.length, active, pending, enterprise, vip, totalPoints: Number(totalPointsBigInt) };
}

async function computeUserStats(
  db: SupabaseClient,
  filters: UserFilters,
): Promise<{
  total: number;
  active: number;
  pending: number;
  enterprise: number;
  vip: number;
  totalPoints: number;
}> {
  const rows = await collectFilteredUsers(db, filters);
  return computeStatsFromRows(rows);
}

/**
 * POST - 创建新用户
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { email, username, password, fullName, role, phone } = body;

    if (!email || !username || !password) {
      return NextResponse.json(
        { success: false, error: '邮箱、用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // 密码加密（使用 bcrypt）
    const bcrypt = await import('bcrypt');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { data, error } = await db
      .from('users')
      .insert({
        email,
        username,
        password_hash: passwordHash,
        full_name: fullName || username,
        role: role || 'user',
        status: 'active',
        metadata: {
          phone: phone || '',
          points: 0,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[Users API] 创建失败:', error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return NextResponse.json(
          { success: false, error: '该邮箱或用户名已存在' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '用户创建成功',
      data: { id: data.id, email: data.email, username: data.username },
    });
  } catch (error: any) {
    console.error('[Users API] 创建异常:', error);
    return NextResponse.json({ success: false, error: '创建用户失败' }, { status: 500 });
  }
}
