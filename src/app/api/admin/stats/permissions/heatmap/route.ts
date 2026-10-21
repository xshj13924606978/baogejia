export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { requireReportView } from '@/lib/permission-gate';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 权限使用热力图API
 *
 * 功能：
 * - GET: 获取权限使用热力图数据，包括每日使用量、权限使用统计、API拒绝统计
 * 权限：管理员 / 持有 report_view 权限的用户（#20260901-0900 P2-2）
 */

export async function GET(request: NextRequest) {
  const gate = await requireReportView(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
      const supabase = getSupabaseServiceClient();

      // 获取查询参数
      const { searchParams } = new URL(request.url);
      const days = parseInt(searchParams.get('days') || '30', 10);


      // 获取权限使用统计（从token_consumption_log表）
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // 注意：token_consumption_log 在历史迁移中存在两套列结构（014 版 total_tokens/points_consumed，
      // 039 版 tokens_used/points_cost），select('*') 读取后按列名容错，兼容两种环境
      const { data: usageStats, error: usageError } = await supabase
        .from('token_consumption_log')
        .select('*')
        .gte('created_at', startDate);

      if (usageError) {
        console.error('[Heatmap API] 获取使用统计失败:', usageError);
      }

      // 积分消耗记录（并入 point_logs 中的扣分流水，如报价生成、对话消耗等）
      const { data: pointConsumeStats, error: pointConsumeError } = await supabase
        .from('point_logs')
        .select('user_id, created_at, points')
        .lt('points', 0)
        .gte('created_at', startDate);

      if (pointConsumeError) {
        console.error('[Heatmap API] 获取积分消耗统计失败:', pointConsumeError);
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
        dailyStats: [] as Array<{
          date: string;
          totalRequests: number;
          allowedRequests: number;
          deniedRequests: number;
        }>,
        topDeniedEndpoints: [] as Array<{ endpoint: string; count: number; percentage: number }>,
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
      // token_consumption_log 与 point_logs 会同时记录同一笔消耗，
      // 为避免重复计算：积分消耗以 point_logs 为准，token 消耗以 token_consumption_log 为准
      const dailyMap = new Map<string, { points: number; tokens: number; users: Set<number> }>();
      usageStats?.forEach((log) => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        const userId = log.user_id;

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { points: 0, tokens: 0, users: new Set() });
        }

        const dayData = dailyMap.get(date)!;
        const tokensUsed = log.tokens_used ?? log.total_tokens ?? 0;
        dayData.tokens += tokensUsed;
        dayData.users.add(userId);

        heatmap.summary.totalTokens += tokensUsed;
        heatmap.summary.activeUsers.add(userId);
      });

      // 积分消耗记录（point_logs 中的扣分，points 为负数取绝对值）
      pointConsumeStats?.forEach((log) => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        const userId = log.user_id;
        const consumed = Math.abs(log.points || 0);

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { points: 0, tokens: 0, users: new Set() });
        }

        const dayData = dailyMap.get(date)!;
        dayData.points += consumed;
        dayData.users.add(userId);

        heatmap.summary.totalUsage += consumed;
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

      // 每日请求/拒绝统计（成功=token_consumption_log 调用条数；拒绝=permission_audit_logs failure 条数）
      const dailyReqMap = new Map<string, { allowed: number; denied: number }>();
      usageStats?.forEach((log) => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        if (!dailyReqMap.has(date)) dailyReqMap.set(date, { allowed: 0, denied: 0 });
        dailyReqMap.get(date)!.allowed += 1;
      });
      denyStats?.forEach((log) => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        if (!dailyReqMap.has(date)) dailyReqMap.set(date, { allowed: 0, denied: 0 });
        dailyReqMap.get(date)!.denied += 1;
      });
      heatmap.dailyStats = Array.from(dailyReqMap.entries())
        .map(([date, d]) => ({
          date,
          totalRequests: d.allowed + d.denied,
          allowedRequests: d.allowed,
          deniedRequests: d.denied,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Top 拒绝端点（按拒绝次数降序）
      const totalDeniedCount = denyStats?.length || 0;
      heatmap.topDeniedEndpoints = Object.entries(heatmap.deniedApis)
        .map(([endpoint, count]) => ({
          endpoint,
          count,
          percentage:
            totalDeniedCount > 0 ? Number(((count / totalDeniedCount) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return NextResponse.json(heatmap);
    } catch (error) {
      console.error('[Heatmap API] 获取热力图失败:', error);
      return NextResponse.json({ error: '获取失败' }, { status: 500 });
    }
}
