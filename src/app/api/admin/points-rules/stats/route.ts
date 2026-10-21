import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';

/**
 * 积分规则统计 API（统一路径 /api/admin/points-rules/stats）
 *
 * GET - 获取积分规则统计信息（基于 points_rules_stats 视图）
 *
 * 返回:
 *   data.stats   - 每条规则的执行统计
 *   data.overall - 总体统计（含 totalRules/activeRules 等）
 *   data.summary - 规则分类汇总 { total, reward, consume, token, enabled }
 *
 * 权限要求: 拥有 admin.manage_points_rules 权限（super_admin 角色）
 */

export async function GET(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const supabase = getSupabaseServiceClient();
    const url = new URL(request.url);

    // 解析查询参数
    const ruleType = url.searchParams.get('ruleType') || undefined;
    const operationType = url.searchParams.get('operationType') || undefined;
    const isActiveParam = url.searchParams.get('isActive');
    const isActive = isActiveParam === 'true' ? true
      : isActiveParam === 'false' ? false
      : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // 构建查询
    let query = supabase
      .from('points_rules_stats')
      .select('*');

    if (ruleType) {
      query = query.eq('rule_type', ruleType);
    }
    if (operationType) {
      query = query.eq('operation_type', operationType);
    }
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    query = query.order('total_executions', { ascending: false });
    query = query.limit(Math.min(Math.max(limit, 1), 100));

    const { data: stats, error } = await query;

    if (error) {
      console.error('[PointsStatsAPI] 获取规则统计失败:', error);
      return NextResponse.json(
        { success: false, error: '获取规则统计失败' },
        { status: 500 }
      );
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

    // 总体统计
    const overall = {
      totalRules: formattedStats.length,
      totalExecutions: formattedStats.reduce((sum, stat) => sum + stat.totalExecutions, 0),
      totalPointsAwarded: formattedStats.reduce((sum, stat) => sum + stat.totalPointsAwarded, 0),
      totalUniqueUsers: formattedStats.reduce((sum, stat) => sum + stat.uniqueUsers, 0),
      activeRules: formattedStats.filter(stat => stat.isActive).length,
      avgPointsPerExecution: formattedStats.length > 0
        ? Math.round(
            formattedStats.reduce((sum, stat) => sum + stat.totalPointsAwarded, 0) /
            formattedStats.reduce((sum, stat) => sum + stat.totalExecutions, 1)
          )
        : 0,
    };

    // 规则分类汇总
    const summary = {
      total: formattedStats.length,
      reward: formattedStats.filter(stat => stat.ruleType === 'reward').length,
      consume: formattedStats.filter(stat => stat.ruleType === 'consume' || stat.ruleType === 'consumption').length,
      token: formattedStats.filter(stat => stat.ruleType === 'token').length,
      enabled: formattedStats.filter(stat => stat.isActive).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        stats: formattedStats,
        overall,
        summary,
      },
    });
  } catch (error) {
    console.error('[PointsStatsAPI] 获取规则统计异常:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
