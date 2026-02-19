import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { consumePoints, getUserPoints } from '@/storage/database/points-utils';

// 积分兑换
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, item_id, item_type, item_name, points_cost, duration } = body;

    if (!user_id || !item_id || !item_type || !points_cost) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 检查用户积分是否足够
    const currentPoints = await getUserPoints(parseInt(user_id));
    if (currentPoints < points_cost) {
      return NextResponse.json(
        { error: '积分不足', currentPoints },
        { status: 400 }
      );
    }

    // 消耗积分
    await consumePoints(
      parseInt(user_id),
      points_cost,
      'redeem',
      `exchange_${item_id}`,
      `兑换：${item_name}`
    );

    // 创建兑换记录
    const { data: exchange, error } = await db
      .from('point_exchanges')
      .insert({
        user_id: parseInt(user_id),
        item_id,
        item_type,
        item_name,
        points_cost,
        status: 'completed',
        duration: duration || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 如果兑换的是排名体验，更新用户排名
    if (item_type === 'ranking') {
      const expireTime = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
      await db
        .from('users')
        .update({
          ranking_expires_at: expireTime,
        })
        .eq('id', parseInt(user_id));
    }

    // 如果兑换的是会员，更新用户会员状态
    if (item_type === 'membership') {
      const expireTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天
      await db
        .from('users')
        .update({
          membership_expires_at: expireTime,
          membership_type: 'premium',
        })
        .eq('id', parseInt(user_id));
    }

    // 获取最新积分
    const newPoints = await getUserPoints(parseInt(user_id));

    return NextResponse.json({
      success: true,
      exchange,
      newPoints,
      message: `成功兑换：${item_name}`,
    });
  } catch (error) {
    console.error('[PointsExchange] 请求失败:', error);
    const errorMessage = error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
