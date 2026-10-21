import { NextRequest, NextResponse } from 'next/server';
import { pointsService } from '@/lib/points-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';

/**
 * 用户积分管理API
 *
 * 功能：
 * - GET: 获取当前用户积分信息
 * - POST: 为用户添加/扣除积分
 */

/**
 * 获取当前用户积分信息
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取用户积分信息
    const pointsInfo = await pointsService.getUserPoints(currentUser.id);
    if (!pointsInfo) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 获取积分统计
    const stats = await pointsService.getUserPointsStats(currentUser.id);

    // 获取最近的积分流水
    const records = await pointsService.getPointRecords(currentUser.id, { limit: 10 });

    return NextResponse.json({
      success: true,
      data: {
        ...pointsInfo,
        ...stats,
        recentRecords: records,
      },
    });
  } catch (error) {
    console.error('[UserPoints API] 获取积分异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 为用户添加/扣除积分
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, points, type, description } = body;

    // 积分调整属于敏感操作，仅管理员可执行（防止普通用户任意增加自己积分）
    if (!hasPermission(currentUser, 'user.manage_roles')) {
      return NextResponse.json({ error: '需要管理员权限才能操作积分' }, { status: 403 });
    }

    // 使用当前用户ID或指定的用户ID
    const targetUserId = userId || currentUser.id;

    if (typeof points !== 'number') {
      return NextResponse.json({ error: '积分必须是数字' }, { status: 400 });
    }

    if (points === 0) {
      return NextResponse.json({ error: '积分不能为0' }, { status: 400 });
    }


    // 操作积分
    if (points > 0) {
      const success = await pointsService.addPoints(
        targetUserId,
        points,
        type || 'admin_grant',
        description || '积分增加'
      );
      if (!success) {
        return NextResponse.json({ error: '操作失败' }, { status: 500 });
      }
    } else {
      const result = await pointsService.deductPoints(
        targetUserId,
        Math.abs(points),
        type || 'admin_deduct',
        description || '积分扣除'
      );
      if (!result.success) {
        return NextResponse.json({ error: result.reason || '操作失败' }, { status: 400 });
      }
    }

    // 获取更新后的积分信息
    const pointsInfo = await pointsService.getUserPoints(targetUserId);

    return NextResponse.json({
      success: true,
      data: {
        points,
        newBalance: pointsInfo?.points || 0,
        pointsInfo,
      },
    });
  } catch (error) {
    console.error('[UserPoints API] 操作积分异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
