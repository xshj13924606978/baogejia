import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';

/**
 * 用户积分管理API
 *
 * 功能：
 * - POST: 为用户添加/扣除积分
 */

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, points, description } = body;

    // 如果是为其他用户添加积分，需要管理员权限
    if (userId && userId !== currentUser.id) {
      if (!hasPermission(currentUser, 'user.manage_roles')) {
        return NextResponse.json(
          { error: '需要管理员权限才能操作其他用户的积分' },
          { status: 403 }
        );
      }
    }

    // 使用当前用户ID或指定的用户ID
    const targetUserId = userId || currentUser.id;

    if (typeof points !== 'number') {
      return NextResponse.json({ error: '积分必须是数字' }, { status: 400 });
    }

    if (points === 0) {
      return NextResponse.json({ error: '积分不能为0' }, { status: 400 });
    }

    console.log('[UserPoints API] 添加积分:', {
      userId: targetUserId,
      points,
      description,
      operator: currentUser.id,
    });

    // 添加积分
    const result = await userLevelService.addPoints(
      targetUserId,
      points,
      description || (points > 0 ? '积分增加' : '积分消费')
    );

    if (!result.success) {
      return NextResponse.json({ error: '操作失败' }, { status: 500 });
    }

    // 获取更新后的等级信息
    const levelInfo = await userLevelService.getUserLevel(targetUserId);

    return NextResponse.json({
      success: true,
      data: {
        points,
        upgraded: result.upgraded,
        newLevel: result.newLevel,
        levelInfo,
      },
    });
  } catch (error) {
    console.error('[UserPoints API] 添加积分异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
