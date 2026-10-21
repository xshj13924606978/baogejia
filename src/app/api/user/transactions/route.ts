import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

/**
 * 用户积分流水查询 API（普通用户专用，只读）
 *
 * GET /api/user/transactions?page=1&limit=20
 * - 鉴权：强制从 session/token 获取当前登录用户，忽略前端传入的 user_id 参数（防止越权）
 * - 分页：page、limit（默认 1 / 20，上限 50）
 * - 数据源：point_logs + point_records 双表合并去重（与管理后台一致），仅返回当前用户记录
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const offset = (page - 1) * limit;
    // 跨双表合并去重需要多取一部分原始数据，保证分页完整性
    const fetchCount = Math.min(offset + limit + 50, 1000);

    const supabase = getSupabaseServiceClient();

    // 仅查询当前登录用户（user.id 来自 session/token，不接受前端传入）
    const buildQuery = (table: 'point_logs' | 'point_records') =>
      supabase
        .from(table)
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, fetchCount - 1);

    const [logsResult, recordsResult, typeResult] = await Promise.all([
      buildQuery('point_logs'),
      buildQuery('point_records'),
      supabase.from('point_log_types').select('type_code, type_name'),
    ]);

    if (logsResult.error) {
      console.error('[UserTransactions] 查询 point_logs 失败:', logsResult.error);
      return NextResponse.json({ success: false, error: '查询积分流水失败' }, { status: 500 });
    }
    if (recordsResult.error) {
      console.error('[UserTransactions] 查询 point_records 失败:', recordsResult.error);
    }

    // 合并双表并按业务内容去重（point_logs / point_records 双写时 id 不同，用业务字段组合识别）
    const seenKeys = new Set<string>();
    const merged = [...(logsResult.data || []), ...(recordsResult.data || [])].filter((log: any) => {
      const key = `${log.user_id}|${log.points}|${log.type}|${log.description}|${log.created_at}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    merged.sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // 双表双写同一业务（RPC/fallback 均同时写 point_logs + point_records），total 以去重后的真实条数为准；
    // 若数据量超出单次拉取上限（fetchCount）则退化为两表 count 之和的近似值
    const coveredAll =
      (logsResult.count || 0) <= fetchCount && (recordsResult.count || 0) <= fetchCount;
    const total = coveredAll ? merged.length : (logsResult.count || 0) + (recordsResult.count || 0);
    const items = merged.slice(offset, offset + limit).map((log: any) => ({
      id: log.id,
      points: log.points,
      type: log.type,
      description: log.description || log.type || '积分变动',
      balanceAfter: log.balance_after ?? null,
      createdAt: log.created_at,
    }));

    // 类型中文映射（优先从 point_log_types 表读取，无需前端硬编码）
    const typeLabels: Record<string, string> = {};
    (typeResult.data || []).forEach((t: any) => {
      if (t.type_code && t.type_name) typeLabels[t.type_code] = t.type_name;
    });

    return NextResponse.json({
      success: true,
      data: items,
      total,
      page,
      limit,
      typeLabels,
    });
  } catch (error: any) {
    console.error('[UserTransactions] 异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
