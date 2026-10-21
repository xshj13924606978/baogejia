export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 计算最近 N 个月（含本月）的每月起始/结束边界
 * 返回数组：[最旧月份, ..., 本月]
 */
function getRecentMonthRanges(months: number) {
  const ranges = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
    ranges.push({ start, end, label: `${d.getMonth() + 1}月` });
  }
  return ranges;
}

// 获取用户统计数据
export async function GET(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const db = getSupabaseServiceClient();
    const userId = user.id;

    // 获取用户积分（用于成就进度）
    const { data: userRow } = await db
      .from('users')
      .select('points')
      .eq('id', userId)
      .single();
    const userPoints = userRow?.points || 0;

    // 获取邀请统计
    const { data: invites } = await db
      .from('invites')
      .select('status')
      .eq('user_id', userId);

    const inviteCount = invites?.length || 0;
    const inviteRegistered = invites?.filter((i) => i.status === 'registered').length || 0;

    // 获取上传统计
    const { data: uploads } = await db
      .from('user_uploads')
      .select('id')
      .eq('user_id', userId);

    const uploadCount = uploads?.length || 0;

    // 获取报价单统计（按 user_id 关联当前登录用户）
    const { count: quoteCount } = await db
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // 获取对话统计
    const { count: conversationCount } = await db
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // 获取合作厂商统计
    const { count: supplierCount } = await db
      .from('suppliers')
      .select('*', { count: 'exact', head: true })
      .filter('metadata->>user_id', 'eq', userId);

    // 被查看次数：系统暂无独立浏览/查看记录，以对话数作为合理代理
    const viewCount = conversationCount || 0;

    // 计算贡献值（邀请*30 + 上传*10 + 报价*5）
    const contribution = inviteRegistered * 30 + uploadCount * 10 + (quoteCount || 0) * 5;

    // 计算排名（基于贡献值的确定性映射）
    const rank = Math.max(1, 100 - Math.floor(contribution / 10));

    // 近7天积分趋势：系统暂无逐日积分流水，使用当前积分作为平缓参考
    const pointsTrend = Array.from({ length: 7 }, () => userPoints);

    // 好评率：系统暂无评价/评分体系，数据库无评价记录，返回 0（前端显示"暂无评价"）
    const rating = 0;

    // 月度趋势：最近6个月每月报价单数量
    const monthRanges = getRecentMonthRanges(6);
    const monthlyTrendValues = await Promise.all(
      monthRanges.map(async ({ start, end }) => {
        const { count: countByUserId } = await db
          .from('quotes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString());
        return countByUserId || 0;
      })
    );

    const monthlyTrend = {
      labels: monthRanges.map((r) => r.label),
      values: monthlyTrendValues,
    };

    // 成就徽章
    const achievements = [
      {
        icon: '🤝',
        name: '邀请达人',
        desc: '邀请3位好友',
        progress: inviteRegistered,
        target: 3,
        unlocked: inviteRegistered >= 3,
      },
      {
        icon: '📤',
        name: '上传能手',
        desc: '上传10次',
        progress: uploadCount,
        target: 10,
        unlocked: uploadCount >= 10,
      },
      {
        icon: '💎',
        name: '高级会员',
        desc: '累计500积分',
        progress: userPoints,
        target: 500,
        unlocked: userPoints >= 500,
      },
      {
        icon: '🔥',
        name: '连续签到',
        desc: '连续7天登录',
        progress: 0, // 系统暂无连续登录记录
        target: 7,
        unlocked: false,
      },
    ];

    return NextResponse.json({
      success: true,
      stats: {
        inviteCount: inviteRegistered,
        uploadCount,
        quoteCount: quoteCount || 0,
        viewCount,
        contribution,
        rank,
        pointsTrend,
        conversationCount: conversationCount || 0,
        supplierCount: supplierCount || 0,
        rating,
        monthlyTrend,
      },
      achievements,
    });
  } catch (error) {
    console.error('[UserStats] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
