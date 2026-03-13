import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 检查升级API
 *
 * 功能：检查当前用户是否可以升级
 */

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    console.log('[CheckUpgrade API] 检查升级:', currentUser.id);

    // 检查升级
    const result = await userLevelService.checkLevelUp(currentUser.id);

    return NextResponse.json({
      success: true,
      data: {
        upgraded: result.upgraded,
        newLevel: result.newLevel,
        message: result.upgraded
          ? `恭喜！您已升级到 ${result.newLevel} 级！`
          : '当前等级暂未达到升级条件',
      },
    });
  } catch (error) {
    console.error('[CheckUpgrade API] 检查升级异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
