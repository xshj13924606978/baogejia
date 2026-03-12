import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 积分流水记录 API（管理员）
 *
 * 功能：
 * - GET: 获取积分流水记录，支持日期筛选
 */

/**
 * 获取积分流水记录
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.points.logs'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 });
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[PointsLogs API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      return NextResponse.json(
        { error: '需要管理员权限' },
        { status: 403 }
      );
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    console.log('[PointsLogs API] 获取积分流水记录', { start, end });

    // 构建查询（不使用关联查询，因为point_logs表没有外键）
    let query = supabase
      .from('point_logs')
      .select('*')
      .order('created_at', { ascending: false });

    // 添加日期筛选
    if (start) {
      query = query.gte('created_at', start);
    }
    if (end) {
      const endDate = new Date(end);
      endDate.setDate(endDate.getDate() + 1);
      query = query.lt('created_at', endDate.toISOString());
    }

    const { data: logs, error } = await query.limit(100);

    if (error) {
      console.error('[PointsLogs API] 查询积分流水失败:', error);
      return NextResponse.json(
        { error: '查询积分流水失败' },
        { status: 500 }
      );
    }

    // 获取所有相关的用户信息
    const userIds = [...new Set(logs.map((log: any) => log.user_id))];
    const { data: users } = await supabase
      .from('users')
      .select('id, username')
      .in('id', userIds);

    const userMap = new Map(users?.map((u: any) => [u.id, u.username]) || []);

    // 格式化返回数据
    const formattedLogs = logs.map((log: any) => ({
      id: log.id,
      userId: log.user_id,
      username: userMap.get(log.user_id) || '未知用户',
      points: log.points,
      type: log.type,
      description: log.description,
      createdAt: new Date(log.created_at).toLocaleString('zh-CN'),
    }));

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
    });
  } catch (error) {
    console.error('[PointsLogs API] 获取积分流水记录异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
