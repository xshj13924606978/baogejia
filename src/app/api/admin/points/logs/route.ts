import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 积分流水记录 API（管理员）
 *
 * GET: 获取积分流水记录、类型配置及统计
 *       支持分页(page/limit)、搜索(keyword)、类型筛选(type)、用户筛选(userId)、日期范围
 *       每行记录附带 type_name/badge_class（来自 point_log_types，兜底为原始 type 值）
 * POST: 执行操作
 *       { action: 'reverse', logId: string } 撤销指定流水（反向冲正）
 *       { action: 'batch_edit_description', ids: string[], description: string } 批量编辑说明
 *       { action: 'batch_delete', ids: string[] } 批量软删除（移入 point_logs_deleted）
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface PointLogTypeConfig {
  type_code: string;
  type_name: string;
  category: 'reward' | 'consume' | 'system';
  badge_class: string;
  icon_name: string;
  display_order: number;
  is_active: boolean;
  is_reversible: boolean;
  is_editable: boolean;
  is_deletable: boolean;
  description: string;
}

async function loadTypeConfigs(supabase: ReturnType<typeof getSupabaseServiceClient>): Promise<PointLogTypeConfig[]> {
  // 优先从配置表读取；若表不存在或为空，则降级同步并再次读取
  const { data, error } = await supabase
    .from('point_log_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.warn('[PointsLogs API] 读取 point_log_types 失败:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    try {
      await supabase.rpc('sync_point_log_types_from_logs');
    } catch (syncErr: any) {
      console.warn('[PointsLogs API] 同步类型失败:', syncErr.message);
    }
    const { data: retryData } = await supabase
      .from('point_log_types')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    return (retryData || []) as PointLogTypeConfig[];
  }

  return data as PointLogTypeConfig[];
}

function buildLogQuery(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  table: 'point_logs' | 'point_records',
  params: {
    keyword: string;
    type: string;
    userId: string;
    startDate: string;
    endDate: string;
  }
) {
  let q = supabase.from(table).select('*', { count: 'exact' });
  if (params.keyword) {
    q = q.or(`description.ilike.%${params.keyword}%,type.ilike.%${params.keyword}%`);
  }
  if (params.type) q = q.eq('type', params.type);
  if (params.userId) q = q.eq('user_id', params.userId);
  if (params.startDate) q = q.gte('created_at', params.startDate);
  if (params.endDate) {
    const end = new Date(params.endDate);
    end.setDate(end.getDate() + 1);
    q = q.lt('created_at', end.toISOString());
  }
  return q;
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || String(DEFAULT_PAGE), 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)));
    const keyword = searchParams.get('keyword') || '';
    const type = searchParams.get('type') || '';
    const userId = searchParams.get('userId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const filterParams = { keyword, type, userId, startDate, endDate };

    // 加载类型配置
    const typeConfigs = await loadTypeConfigs(supabase);

    // 主表 point_logs 精确分页查询
    const offset = (page - 1) * limit;
    const logsQuery = await buildLogQuery(supabase, 'point_logs', filterParams)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsQuery.error) {
      console.error('[PointsLogs API] 查询 point_logs 失败:', logsQuery.error);
      return NextResponse.json({ success: false, error: '查询积分流水失败' }, { status: 500 });
    }

    const logs = logsQuery.data || [];
    const total = logsQuery.count || 0;

    // 获取关联用户信息（users 表；profiles 表不存在、users 表无 phone 列，故只查真实存在列）
    const userIds: string[] = [...new Set(logs.map((l: any) => l.user_id).filter(Boolean))];
    const userMap = new Map<string, { name: string; email?: string }>();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username, full_name, email')
        .in('id', userIds);

      if (usersError) {
        console.warn('[PointsLogs API] 查询用户失败:', usersError.message);
      }

      (users || []).forEach((u: any) => {
        userMap.set(u.id, {
          name: u.full_name || u.username || '未知用户',
          email: u.email,
        });
      });
    }

    // 格式化数据（附带类型名称与徽章样式，兜底为原始 type 值）
    const typeConfigMap = new Map(typeConfigs.map((t) => [t.type_code, t]));
    const formattedLogs = logs.map((log: any) => {
      const cfg = typeConfigMap.get(log.type);
      return {
        id: log.id,
        userId: log.user_id,
        username: userMap.get(log.user_id)?.name || '未知用户',
        userName: userMap.get(log.user_id)?.name || '未知用户',
        userEmail: userMap.get(log.user_id)?.email,
        points: log.points,
        balanceAfter: log.balance_after,
        type: log.type,
        typeName: cfg?.type_name || log.type,
        badgeClass: cfg?.badge_class || 'bg-slate-100 text-slate-700',
        description: log.description,
        referenceId: log.reference_id,
        metadata: log.metadata,
        createdAt: log.created_at,
        reversedAt: log.reversed_at,
        reversedBy: log.reversed_by,
      };
    });

    // 统计数据：合并 point_logs 与 point_records 去重
    const hasNoFilters = !keyword && !type && !userId && !startDate && !endDate;
    let stats = null;
    if (hasNoFilters) {
      const [logsStatResult, recordsStatResult] = await Promise.all([
        supabase.from('point_logs').select('id, user_id, points, type, created_at'),
        supabase.from('point_records').select('id, user_id, points, type, created_at'),
      ]);

      const allStatRows = [...(logsStatResult.data || []), ...(recordsStatResult.data || [])];
      const seenKeys = new Set<string>();
      const uniqueRows = allStatRows.filter((log: any) => {
        const key = `${log.user_id}|${log.points}|${log.type}|${log.created_at}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      const totalCount = uniqueRows.length;
      const totalIn = uniqueRows.filter((l: any) => l.points > 0).reduce((s: number, l: any) => s + l.points, 0);
      const totalOut = uniqueRows.filter((l: any) => l.points < 0).reduce((s: number, l: any) => s + Math.abs(l.points), 0);
      const netFlow = totalIn - totalOut;

      // 按类型分组统计
      const typeStats: Record<string, number> = {};
      uniqueRows.forEach((l: any) => {
        typeStats[l.type] = (typeStats[l.type] || 0) + 1;
      });

      stats = { totalCount, totalIn, totalOut, netFlow, typeStats };
    }

    return NextResponse.json({
      success: true,
      data: formattedLogs,
      total,
      page,
      limit,
      types: typeConfigs,
      ...(stats && { stats }),
    });
  } catch (error: any) {
    console.error('[PointsLogs API] 异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { errorResponse, user } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();
    const body = await request.json().catch(() => ({}));
    const { action, logId, ids, description } = body || {};

    // ============ 批量编辑说明 ============
    if (action === 'batch_edit_description') {
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ success: false, error: '请选择要操作的记录' }, { status: 400 });
      }
      if (typeof description !== 'string' || description.trim().length === 0) {
        return NextResponse.json({ success: false, error: '说明不能为空' }, { status: 400 });
      }

      const { data: logs, error: logsError } = await supabase
        .from('point_logs')
        .select('id, type, description')
        .in('id', ids);

      if (logsError || !logs || logs.length === 0) {
        return NextResponse.json({ success: false, error: '未找到对应流水记录' }, { status: 404 });
      }

      // 校验类型是否允许编辑（任一不可编辑则整体拒绝，防止误操作）
      const { data: typeConfigs } = await supabase
        .from('point_log_types')
        .select('type_code, is_editable, type_name')
        .in(
          'type_code',
          [...new Set(logs.map((l: any) => l.type))]
        );

      const typeMap = new Map((typeConfigs || []).map((t: any) => [t.type_code, t]));
      const blocked = logs.filter((l: any) => {
        const cfg = typeMap.get(l.type);
        return cfg ? !cfg.is_editable : false;
      });
      if (blocked.length > 0) {
        const names = [...new Set(blocked.map((l: any) => typeMap.get(l.type)?.type_name || l.type))];
        return NextResponse.json(
          { success: false, error: `类型「${names.join('、')}」不允许编辑说明` },
          { status: 400 }
        );
      }

      const newDescription = description.trim();

      const results = await Promise.all(
        logs.map(async (log: any) => {
          const { error: updateError } = await supabase
            .from('point_logs')
            .update({ description: newDescription })
            .eq('id', log.id);
          return updateError ? null : log.id;
        })
      );

      const successCount = results.filter(Boolean).length;
      const failCount = results.length - successCount;
      if (failCount > 0) {
        return NextResponse.json(
          { success: false, error: `部分记录更新失败（成功 ${successCount} 条，失败 ${failCount} 条）` },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: `已更新 ${successCount} 条记录说明` });
    }

    // ============ 批量删除（软删除，移入 point_logs_deleted） ============
    if (action === 'batch_delete') {
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ success: false, error: '请选择要操作的记录' }, { status: 400 });
      }

      const { data: logs, error: logsError } = await supabase
        .from('point_logs')
        .select('*')
        .in('id', ids);

      if (logsError || !logs || logs.length === 0) {
        return NextResponse.json({ success: false, error: '未找到对应流水记录' }, { status: 404 });
      }

      // 校验类型是否允许删除（任一不可删除则整体拒绝，防止误操作）
      const { data: typeConfigs } = await supabase
        .from('point_log_types')
        .select('type_code, is_deletable, type_name')
        .in(
          'type_code',
          [...new Set(logs.map((l: any) => l.type))]
        );

      const typeMap = new Map((typeConfigs || []).map((t: any) => [t.type_code, t]));
      const blocked = logs.filter((l: any) => {
        const cfg = typeMap.get(l.type);
        return cfg ? !cfg.is_deletable : false;
      });
      if (blocked.length > 0) {
        const names = [...new Set(blocked.map((l: any) => typeMap.get(l.type)?.type_name || l.type))];
        return NextResponse.json(
          { success: false, error: `类型「${names.join('、')}」不允许删除` },
          { status: 400 }
        );
      }

      const adminName = user?.email || user?.name || user?.id;
      const now = new Date().toISOString();

      const results = await Promise.all(
        logs.map(async (log: any) => {
          // 软删除：将记录移入 point_logs_deleted 表（如果存在），否则直接删除
          const { error: insertDeletedError } = await supabase.from('point_logs_deleted').insert({
            original_id: log.id,
            user_id: log.user_id,
            points: log.points,
            type: log.type,
            description: log.description,
            balance_after: log.balance_after,
            reference_id: log.reference_id,
            metadata: log.metadata,
            created_at: log.created_at,
            deleted_by: adminName,
            deleted_at: now,
          });

          if (insertDeletedError && insertDeletedError.code !== '42P01') {
            return { id: log.id, ok: false, reason: insertDeletedError.message };
          }

          const { error: deleteError } = await supabase.from('point_logs').delete().eq('id', log.id);
          if (deleteError) {
            return { id: log.id, ok: false, reason: deleteError.message };
          }
          return { id: log.id, ok: true };
        })
      );

      const failItems = results.filter((r: any) => !r.ok);
      const successCount = results.length - failItems.length;
      if (failItems.length > 0) {
        return NextResponse.json(
          { success: false, error: `部分记录删除失败（成功 ${successCount} 条，失败 ${failItems.length} 条）` },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: `已删除 ${successCount} 条记录` });
    }

    if (!logId || action !== 'reverse') {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    // 读取原记录
    const { data: originalLog, error: originalError } = await supabase
      .from('point_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (originalError || !originalLog) {
      return NextResponse.json({ success: false, error: '流水记录不存在' }, { status: 404 });
    }

    if (originalLog.reversed_at) {
      return NextResponse.json({ success: false, error: '该记录已被撤销' }, { status: 400 });
    }

    // 校验类型是否允许撤销
    const { data: typeConfig } = await supabase
      .from('point_log_types')
      .select('is_reversible, type_name')
      .eq('type_code', originalLog.type)
      .single();

    if (typeConfig && !typeConfig.is_reversible) {
      return NextResponse.json(
        { success: false, error: `类型「${typeConfig.type_name || originalLog.type}」不允许撤销` },
        { status: 400 }
      );
    }

    // 执行反向冲正：RPC 内部已自动写入 point_logs + point_records 流水，无需手动 INSERT
    const reversePoints = -originalLog.points;
    const reverseReferenceId = `reverse_${originalLog.id}_${Date.now()}`;

    // 完整传参匹配 5 参数版 add_points_atomic（避免与 2 参数重载产生歧义）
    // p_points 保留 reversePoints 符号：扣减记录撤销为正（加回），充值记录撤销为负（扣回）
    const { data: rpcResult, error: rpcError } = await supabase.rpc('add_points_atomic', {
      p_user_id: originalLog.user_id,
      p_points: reversePoints,
      p_type: 'refund',
      p_description: `撤销${originalLog.type}记录：${originalLog.description || ''}`,
      p_reference_id: reverseReferenceId,
    });

    if (rpcError) {
      console.error('[PointsLogs API] 撤销流水失败:', rpcError);
      return NextResponse.json({ success: false, error: '撤销失败：' + rpcError.message }, { status: 500 });
    }

    const newBalance = rpcResult?.new_points ?? 0;
    const adminName = user?.email || user?.name || user?.id;
    const now = new Date().toISOString();

    // 标记原记录为已撤销（RPC 已自动写入 refund 流水，此处仅更新原记录状态）
    await supabase
      .from('point_logs')
      .update({
        reversed_at: now,
        reversed_by: adminName,
        metadata: {
          ...(originalLog.metadata || {}),
          reversed: true,
          reversed_by: adminName,
          reversed_at: now,
          reverse_reference_id: reverseReferenceId,
        },
      })
      .eq('id', logId);

    return NextResponse.json({
      success: true,
      message: '撤销成功',
      data: {
        originalLogId: logId,
        reversePoints,
        newBalance,
        reverseReferenceId,
      },
    });
  } catch (error: any) {
    console.error('[PointsLogs API] 撤销异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
