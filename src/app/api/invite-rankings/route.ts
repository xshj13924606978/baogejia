export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// 更新排行榜数据
async function updateRankings(period: string = 'week') {
  const db = getSupabaseServiceClient();

  let startDate = new Date();
  if (period === 'day') {
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === 'month') {
    startDate.setMonth(startDate.getMonth() - 1);
  } else {
    startDate = new Date(0); // 总榜从开始算
  }

  // 查询该时间段内的邀请数据
  let query = db.from('invite_relations').select('inviter_id, points_awarded').eq('level', 1);

  if (period !== 'total') {
    query = query.gte('created_at', startDate.toISOString());
  }

  const { data: relations, error } = await query;

  if (error) {
    // 表不存在时跳过更新
    if (error.code === '42P01' || error.code === 'PGRST205') return 0;
    throw error;
  }

  // 统计每个用户的邀请数量和积分
  const userStats = new Map();
  relations?.forEach((r: any) => {
    const userId = r.inviter_id;
    if (!userStats.has(userId)) {
      userStats.set(userId, { inviteCount: 0, pointsEarned: 0 });
    }
    const stats = userStats.get(userId);
    stats.inviteCount++;
    stats.pointsEarned += r.points_awarded;
  });

  // 按邀请数量排序
  const sortedUsers = Array.from(userStats.entries())
    .sort((a, b) => b[1].inviteCount - a[1].inviteCount)
    .slice(0, 100); // 取前100名

  // 批量 upsert 排行榜记录
  const records = sortedUsers.map(([userId, stats], i) => ({
    user_id: userId,
    period,
    invite_count: stats.inviteCount,
    points_earned: stats.pointsEarned,
    rank: i + 1,
    update_time: new Date(),
  }));

  if (records.length > 0) {
    const { error: upsertError } = await db.from('invite_rankings').upsert(records);

    if (upsertError) throw upsertError;
  }

  return sortedUsers.length;
}

// 获取排行榜
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'week'; // day/week/month/total
    const user_id = searchParams.get('user_id');

    const db = getSupabaseServiceClient();

    // 先更新排行榜数据
    await updateRankings(period);

    // 获取排行榜前10名
    const { data: rankings, error } = await db
      .from('invite_rankings')
      .select(
        `
        *,
        user:users!invite_rankings_user_id_fkey (
          id,
          username,
          avatar
        )
      `
      )
      .eq('period', period)
      .order('rank', { ascending: true })
      .limit(10);

    if (error) {
      // 表不存在时优雅降级
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({
          success: true,
          data: { rankings: [], userRank: null },
        });
      }
      throw error;
    }

    // 如果指定了user_id，找到该用户的排名
    let userRank = null;
    if (user_id) {
      const { data: userRankData } = await db
        .from('invite_rankings')
        .select('*')
        .eq('period', period)
        .eq('user_id', user_id)
        .single();

      if (userRankData) {
        userRank = userRankData;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        rankings: rankings || [],
        userRank,
      },
    });
  } catch (error) {
    console.error('[InviteRankings] 获取排行榜失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 手动刷新排行榜（管理员功能）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { period = 'week' } = body;

    const count = await updateRankings(period);

    return NextResponse.json({
      success: true,
      message: `排行榜已刷新，更新了 ${count} 条记录`,
    });
  } catch (error) {
    console.error('[InviteRankings] 刷新排行榜失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
