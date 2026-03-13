import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 升级历史API
 *
 * 功能：获取用户的升级历史记录
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    console.log('[UpgradeHistory API] 获取升级历史:', currentUser.id);

    // 获取升级历史
    const history = await userLevelService.getUpgradeHistory(currentUser.id);

    return NextResponse.json({
      success: true,
      data: {
        history,
        count: history.length,
      },
    });
  } catch (error) {
    console.error('[UpgradeHistory API] 获取升级历史异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
