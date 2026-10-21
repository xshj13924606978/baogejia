import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';

/**
 * 获取用户积分余额
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    
    // 支持 UUID 格式的用户 ID
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: '无效的用户ID' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();
    
    // 从 users 表获取用户积分信息（points 列与 metadata 兼容读取）
    const { data: user, error } = await supabase
      .from('users')
      .select('id, points, total_points, metadata')
      .eq('id', id)
      .single();
    

    if (error || !user) {
      // 表不存在或用户不存在时返回默认值
      return NextResponse.json({
        success: true,
        data: {
          userId: id,
          pointsBalance: 0,
          tokenBalance: 0,
          totalConsumedPoints: 0,
          totalRechargedPoints: 0,
          lastUpdated: new Date().toISOString(),
        }
      });
    }

    // 兼容历史数据：points 列与 metadata.points 并存，取两者较大值
    const metadataPoints = user.metadata?.points;
    const columnPoints = user.points || 0;
    const metaNum = typeof metadataPoints === 'number' ? metadataPoints : (parseInt(metadataPoints || '0', 10) || 0);
    const points = Math.max(columnPoints, metaNum);

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        pointsBalance: points,
        tokenBalance: 0,
        totalConsumedPoints: 0,
        totalRechargedPoints: points,
        lastUpdated: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[User Points API] 获取用户积分失败:', error);
    return NextResponse.json(
      { error: '获取用户积分失败' },
      { status: 500 }
    );
  }
}

/**
 * 设置用户积分（管理员功能）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const body = await request.json();
    const { points, reason } = body;

    // 支持 UUID 格式的用户 ID
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: '无效的用户ID' },
        { status: 400 }
      );
    }

    if (typeof points !== 'number' || points < 0) {
      return NextResponse.json(
        { error: '无效的积分数值' },
        { status: 400 }
      );
    }

    // 走 set_points_atomic RPC 并同步 user_levels/user_token_balance
    const referenceId = `admin_set_${user.id}_${id}_${Date.now()}`;
    const result = await pointsService.adminSetPoints(
      user.id,
      id,
      points,
      reason || `管理员调整积分至 ${points}`,
      referenceId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.reason || '设置积分失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '积分设置成功',
      data: {
        userId: id,
        pointsBalance: points,
      }
    });
  } catch (error) {
    console.error('[User Points API] 设置用户积分失败:', error);
    return NextResponse.json(
      { error: '设置用户积分失败' },
      { status: 500 }
    );
  }
}
