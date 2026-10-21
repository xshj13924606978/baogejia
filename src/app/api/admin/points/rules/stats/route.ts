import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';
import { PointsRuleStats } from '@/types/points-rules';

/**
 * 积分规则统计 API
 * 
 * 功能：
 * - GET: 获取积分规则统计信息（支持按规则类型、时间范围筛选）
 * 
 * 权限要求：需要管理员权限
 */

// 查询参数接口
interface StatsQueryParams {
  ruleType?: string;
  operationType?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * 获取积分规则统计信息
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
    const queryParams: StatsQueryParams = {
      ruleType: url.searchParams.get('ruleType') || undefined,
      operationType: url.searchParams.get('operationType') || undefined,
      isActive: url.searchParams.get('isActive') === 'true' ? true : 
                url.searchParams.get('isActive') === 'false' ? false : undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '50'),
    };

    // 验证参数
    if (queryParams.limit && (queryParams.limit < 1 || queryParams.limit > 100)) {
      queryParams.limit = 50;
    }

    // 构建基础查询
    let query = supabase
      .from('points_rules_stats')
      .select('*');

    // 应用筛选条件
    if (queryParams.ruleType) {
      query = query.eq('rule_type', queryParams.ruleType);
    }

    if (queryParams.operationType) {
      query = query.eq('operation_type', queryParams.operationType);
    }

    if (queryParams.isActive !== undefined) {
      query = query.eq('is_active', queryParams.isActive);
    }

    // 按总执行次数排序
    query = query.order('total_executions', { ascending: false });

    // 应用限制
    if (queryParams.limit) {
      query = query.limit(queryParams.limit);
    }

    // 执行查询
    const { data: stats, error } = await query;

    if (error) {
      console.error('[PointsStatsAPI] 获取规则统计失败:', error);
      return NextResponse.json({ 
        success: false, 
        error: '获取规则统计失败' 
      }, { status: 500 });
    }

    // 转换数据格式
    const formattedStats = (stats || []).map(stat => ({
      ruleId: stat.rule_id,
      ruleKey: stat.rule_key,
      ruleName: stat.rule_name,
      ruleType: stat.rule_type,
      operationType: stat.operation_type,
      basePoints: stat.base_points,
      isActive: stat.is_active,
      totalExecutions: stat.total_executions,
      totalPointsAwarded: stat.total_points_awarded,
      uniqueUsers: stat.unique_users,
      firstExecution: stat.first_execution,
      lastExecution: stat.last_execution,
    }));

    // 计算总体统计
    const overallStats = {
      totalRules: formattedStats.length,
      totalExecutions: formattedStats.reduce((sum, stat) => sum + stat.totalExecutions, 0),
      totalPointsAwarded: formattedStats.reduce((sum, stat) => sum + stat.totalPointsAwarded, 0),
      totalUniqueUsers: formattedStats.reduce((sum, stat) => sum + stat.uniqueUsers, 0),
      activeRules: formattedStats.filter(stat => stat.isActive).length,
      avgPointsPerExecution: formattedStats.length > 0 
        ? Math.round(formattedStats.reduce((sum, stat) => sum + stat.totalPointsAwarded, 0) / 
                    formattedStats.reduce((sum, stat) => sum + stat.totalExecutions, 1))
        : 0,
    };

    const response = {
      success: true,
      data: {
        stats: formattedStats,
        overall: overallStats,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[PointsStatsAPI] 获取规则统计异常:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器错误' 
    }, { status: 500 });
  }
}