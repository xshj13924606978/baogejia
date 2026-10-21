import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { pointsService } from '@/lib/points-service';
import { requireAuth } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

// 积分兑换
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { user_id, item_id, item_type, item_name, points_cost, duration } = body;

    if (!user_id || !item_id || !item_type || !points_cost) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // 检查用户积分是否足够
    const pointsInfo = await pointsService.getUserPoints(user_id);
    const currentPoints = pointsInfo?.points ?? 0;
    if (currentPoints < points_cost) {
      return NextResponse.json(
        { error: '积分不足', currentPoints },
        { status: 400 }
      );
    }

    // 消耗积分（referenceId 幂等）
    const deductResult = await pointsService.deductPoints(
      user_id,
      points_cost,
      'exchange',
      `兑换：${item_name}`,
      `exchange_${item_id}`
    );

    if (!deductResult.success) {
      return NextResponse.json(
        { error: deductResult.reason || '积分扣减失败' },
        { status: 400 }
      );
    }

    // 创建兑换记录
    const { data: exchange, error } = await db
      .from('point_exchanges')
      .insert({
        user_id,
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
      // 兑换记录创建失败时回滚积分
      await pointsService.refundPoints(
        user_id,
        points_cost,
        `exchange_${item_id}`,
        `兑换 ${item_name} 记录创建失败退款`
      );
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
        .eq('id', user_id);
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
        .eq('id', user_id);
    }

    // 获取最新积分
    const newPointsInfo = await pointsService.getUserPoints(user_id);
    const newPoints = newPointsInfo?.points ?? 0;

    return NextResponse.json({
      success: true,
      exchange,
      newPoints,
      message: `成功兑换：${item_name}`,
    });
  } catch (error) {
    console.error('[PointsExchange] 请求失败:', error);
    const errorMessage = error instanceof Error ? safeErrorMessage(error) : '服务器错误';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
