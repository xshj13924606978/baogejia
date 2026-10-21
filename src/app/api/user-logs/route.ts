import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-utils';
import { logUserAction, isValidUserLogActionType, extractClientIp } from '@/lib/user-log-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST /api/user-logs — 客户端上报一条用户操作日志
 *
 * 请求体：{ actionType, actionDetails?, sessionId?, durationMs? }
 * 认证：必须登录（user_id 取服务端解析的用户，不接受客户端伪造）
 * 说明：服务端用 service_role 写入（RLS 禁止 anon 直接 INSERT）
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '无效的 JSON 请求体' }, { status: 400 });
  }

  const actionType = typeof body.actionType === 'string' ? body.actionType : '';
  if (!isValidUserLogActionType(actionType)) {
    return NextResponse.json(
      { error: `非法操作类型，允许：login, logout, upload, download, delete, update, view, share, export, search` },
      { status: 400 }
    );
  }

  const actionDetails =
    body.actionDetails && typeof body.actionDetails === 'object'
      ? (body.actionDetails as Record<string, unknown>)
      : {};

  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null;
  const durationMs =
    typeof body.durationMs === 'number' && Number.isFinite(body.durationMs)
      ? Math.max(0, Math.round(body.durationMs))
      : null;

  const ok = await logUserAction({
    userId: user.id,
    actionType,
    actionDetails,
    sessionId,
    durationMs,
    ipAddress: extractClientIp(request),
    userAgent: request.headers.get('user-agent'),
  });

  if (!ok) {
    return NextResponse.json({ error: '日志写入失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * GET /api/user-logs — 查询操作日志
 *
 * 权限：
 * - 普通用户：仅能查询自己的日志
 * - admin / super_admin：可查询全部（传 userId 可筛选）
 *
 * 查询参数：
 * - page, pageSize（分页）
 * - actionType（可选，操作类型过滤）
 * - userId（可选，仅管理员可用，指定用户）
 * - startDate, endDate（可选，时间范围）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20));
  const actionType = searchParams.get('actionType');
  const requestedUserId = searchParams.get('userId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  // 管理员权限判断
  const { user: adminUser, errorResponse: adminError } = await requireAdmin(request);
  const isAdmin = !adminError && adminUser !== null;

  let user;
  if (!isAdmin) {
    // 普通用户必须认证，且只能看自己
    const { user: normalUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    user = normalUser;
  }

  const effectiveUserId = isAdmin
    ? requestedUserId || undefined
    : user!.id;

  try {
    const supabase = (await import('@/storage/database/supabase-client')).getSupabaseServiceClient();

    // 构建查询
    let query = supabase
      .from('user_logs')
      .select('*', { count: 'exact' });

    if (effectiveUserId) {
      query = query.eq('user_id', effectiveUserId);
    }
    if (actionType && isValidUserLogActionType(actionType)) {
      query = query.eq('action_type', actionType);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: `查询日志失败: ${safeErrorMessage(error)}` }, { status: 500 });
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
      isAdmin,
    });
  } catch (err) {
    console.error('[user-log] GET 查询失败:', err);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
