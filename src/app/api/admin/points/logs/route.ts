import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 积分流水记录 API（管理员）
 *
 * GET: 获取积分流水记录，支持分页、搜索、类型筛选、用户筛选
 */

export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const keyword = searchParams.get('keyword') || '';
    const type = searchParams.get('type') || '';
    const userId = searchParams.get('userId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    // 构建查询
    let query = supabase
      .from('point_logs')
      .select('*', { count: 'exact' });

    // 搜索（用户名）
    if (keyword) {
      query = query.ilike('description', `%${keyword}%`);
    }

    // 类型筛选
    if (type) {
      query = query.eq('type', type);
    }

    // 用户筛选
    if (userId) {
      query = query.eq('user_id', userId);
    }

    // 日期范围
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      query = query.lt('created_at', end.toISOString());
    }

    // 分页
    const offset = (page - 1) * limit;
    const { data: logs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[PointsLogs API] 查询失败:', error);
      return NextResponse.json({ success: false, error: '查询积分流水失败' }, { status: 500 });
    }

    // 获取关联用户信息
    const userIds = [...new Set((logs || []).map((l: any) => l.user_id))];
    let userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, full_name')
        .in('id', userIds);
      userMap = new Map(
        (users || []).map((u: any) => [u.id, u.full_name || u.username || '未知用户'])
      );
    }

    // 格式化数据
    const formattedLogs = (logs || []).map((log: any) => ({
      id: log.id,
      userId: log.user_id,
      username: userMap.get(log.user_id) || '未知用户',
      points: log.points,
      balance: log.balance,
      type: log.type,
      description: log.description,
      createdAt: log.created_at,
    }));

    // 统计数据（仅在无筛选时返回）
    let stats = null;
    if (!keyword && !type && !userId && !startDate && !endDate) {
      const { data: allLogs } = await supabase
        .from('point_logs')
        .select('points, type');

      if (allLogs) {
        const totalIn = allLogs.filter((l: any) => l.points > 0).reduce((s: number, l: any) => s + l.points, 0);
        const totalOut = allLogs.filter((l: any) => l.points < 0).reduce((s: number, l: any) => s + Math.abs(l.points), 0);

        // 按类型分组统计
        const typeStats: Record<string, number> = {};
        allLogs.forEach((l: any) => {
          typeStats[l.type] = (typeStats[l.type] || 0) + 1;
        });

        stats = {
          totalCount: allLogs.length,
          totalIn,
          totalOut,
          netFlow: totalIn - totalOut,
          typeStats,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: formattedLogs,
      total: count || 0,
      page,
      limit,
      ...(stats && { stats }),
    });
  } catch (error: any) {
    console.error('[PointsLogs API] 异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
