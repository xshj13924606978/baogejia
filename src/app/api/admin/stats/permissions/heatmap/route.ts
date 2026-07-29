import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 权限使用热力图API
 *
 * 功能：
 * - GET: 获取权限使用热力图数据，包括每日使用量、权限使用统计、API拒绝统计
 * 权限：仅超级管理员
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.stats.view'] },
  async (request: NextRequest, _context: any) => {
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser(request);
      if (!currentUser || !currentUser.id) {
        return NextResponse.json({ error: '无权限' }, { status: 403 });
      }

      // 查询用户角色
      const supabase = getSupabaseClient();
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (roleError || !userRole) {
        console.error('[Heatmap API] 获取用户角色失败:', roleError);
        return NextResponse.json({ error: '无权限' }, { status: 403 });
      }

      // 检查超级管理员权限
      if (userRole.role !== 'super_admin') {
        return NextResponse.json({ error: '无权限，需要超级管理员权限' }, { status: 403 });
      }

      // 获取查询参数
      const { searchParams } = new URL(request.url);
      const days = parseInt(searchParams.get('days') || '30', 10);


      // 获取权限使用统计（从token_consumption_log表）
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: usageStats, error: usageError } = await supabase
        .from('token_consumption_log')
        .select('user_id, created_at, points_consumed, tokens_used')
        .gte('created_at', startDate);

      if (usageError) {
        console.error('[Heatmap API] 获取使用统计失败:', usageError);
      }

      // 获取权限拒绝统计（从permission_audit_logs表）
      const { data: denyStats, error: denyError } = await supabase
        .from('permission_audit_logs')
        .select('resource_type, resource_id, created_at, user_id')
        .eq('status', 'failure')
        .gte('created_at', startDate);

      if (denyError) {
        console.error('[Heatmap API] 获取拒绝统计失败:', denyError);
      }

      // 整理热力图数据
      const heatmap = {
        daily: [] as Array<{ date: string; value: number; tokenUsage: number }>,
        permissions: {} as Record<string, number>,
        deniedApis: {} as Record<string, number>,
        deniedUsers: {} as Record<number, number>,
        summary: {
          totalUsage: 0,
          totalTokens: 0,
          totalDenied: 0,
          activeUsers: new Set<number>(),
          averageDailyUsage: 0}};

      // 处理每日使用量
      const dailyMap = new Map<string, { points: number; tokens: number; users: Set<number> }>();
      usageStats?.forEach((log) => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        const userId = log.user_id;

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { points: 0, tokens: 0, users: new Set() });
        }

        const dayData = dailyMap.get(date)!;
        dayData.points += log.points_consumed || 0;
        dayData.tokens += log.tokens_used || 0;
        dayData.users.add(userId);

        heatmap.summary.totalUsage += log.points_consumed || 0;
        heatmap.summary.totalTokens += log.tokens_used || 0;
        heatmap.summary.activeUsers.add(userId);
      });

      heatmap.daily = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        value: data.points,
        tokenUsage: data.tokens}));

      // 处理权限拒绝统计
      denyStats?.forEach((log) => {
        const resourcePath = log.resource_type || 'unknown';
        const userId = log.user_id;

        heatmap.deniedApis[resourcePath] = (heatmap.deniedApis[resourcePath] || 0) + 1;

        if (userId) {
          heatmap.deniedUsers[userId] = (heatmap.deniedUsers[userId] || 0) + 1;
        }
      });

      heatmap.summary.totalDenied = denyStats?.length || 0;
      heatmap.summary.averageDailyUsage =
        dailyMap.size > 0 ? Math.round(heatmap.summary.totalUsage / dailyMap.size) : 0;


      return NextResponse.json(heatmap);
    } catch (error) {
      console.error('[Heatmap API] 获取热力图失败:', error);
      return NextResponse.json({ error: '获取失败' }, { status: 500 });
    }
  }
);
