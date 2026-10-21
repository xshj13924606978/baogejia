import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';
import { PointsRuleHistory, ExecutionStatus } from '@/types/points-rules';

/**
 * 积分规则执行历史 API
 * 
 * 功能：
 * - GET: 获取执行历史列表（支持分页、筛选）
 * 
 * 权限要求：需要管理员权限
 */

// 查询参数接口
interface HistoryQueryParams {
  page?: number;
  limit?: number;
  ruleId?: string;
  userId?: string;
  operationType?: string;
  status?: ExecutionStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 构建查询条件
function buildQueryConditions(params: HistoryQueryParams, query: any) {
  const { ruleId, userId, operationType, status, startDate, endDate, search } = params;

  if (ruleId) {
    query = query.eq('rule_id', ruleId);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (operationType) {
    query = query.eq('operation_type', operationType);
  }

  if (status) {
    query = query.eq('execution_status', status);
  }

  if (startDate) {
    query = query.gte('executed_at', startDate);
  }

  if (endDate) {
    query = query.lte('executed_at', endDate);
  }

  if (search) {
    query = query.or(`operation_type.ilike.%${search}%,failure_reason.ilike.%${search}%`);
  }

  return query;
}

/**
 * 获取执行历史列表
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const supabase = getSupabaseServiceClient();
    const url = new URL(request.url);
    
    // 解析查询参数
    const queryParams: HistoryQueryParams = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      ruleId: url.searchParams.get('ruleId') || undefined,
      userId: url.searchParams.get('userId') || undefined,
      operationType: url.searchParams.get('operationType') || undefined,
      status: url.searchParams.get('status') as ExecutionStatus || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      search: url.searchParams.get('search') || undefined,
      sortBy: url.searchParams.get('sortBy') || 'executed_at',
      sortOrder: url.searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc',
    };

    // 验证参数
    const page = queryParams.page ?? 1;
    const limit = queryParams.limit ?? 20;
    
    if (page < 1) queryParams.page = 1;
    else queryParams.page = page;
    
    if (limit < 1 || limit > 100) queryParams.limit = 20;
    else queryParams.limit = limit;

    // 构建基础查询
    let query = supabase
      .from('points_rule_history')
      .select('*', { count: 'exact' });

    // 应用筛选条件
    query = buildQueryConditions(queryParams, query);

    // 应用排序
    const sortField = queryParams.sortBy === 'points_awarded' ? 'points_awarded' :
                     queryParams.sortBy === 'execution_status' ? 'execution_status' :
                     'executed_at';
    
    query = query.order(sortField, { ascending: queryParams.sortOrder === 'asc' });

    // 应用分页
    const start = (queryParams.page! - 1) * queryParams.limit!;
    const end = start + queryParams.limit! - 1;
    query = query.range(start, end);

    // 执行查询
    const { data: history, error, count } = await query;

    if (error) {
      console.error('[PointsHistoryAPI] 获取执行历史失败:', error);
      return NextResponse.json({ 
        success: false, 
        error: '获取执行历史失败' 
      }, { status: 500 });
    }

    // 转换数据格式
    const formattedHistory = (history || []).map(record => ({
      id: record.id,
      ruleId: record.rule_id,
      userId: record.user_id,
      pointsAwarded: record.points_awarded,
      pointsExpected: record.points_expected,
      operationType: record.operation_type,
      contextData: record.context_data,
      conditionsMatched: record.conditions_matched,
      conditionsEvaluated: record.conditions_evaluated,
      conditionsPassed: record.conditions_passed,
      executionStatus: record.execution_status,
      failureReason: record.failure_reason,
      executedAt: record.executed_at,
    }));

    const response = {
      success: true,
      data: formattedHistory,
      total: count || 0,
      page: queryParams.page!,
      limit: queryParams.limit!,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[PointsHistoryAPI] 获取执行历史异常:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器错误' 
    }, { status: 500 });
  }
}