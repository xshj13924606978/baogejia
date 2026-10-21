import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 智能推荐升级API
 *
 * 功能：基于用户行为智能推荐升级
 * 权限：需要登录
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;


    // 获取升级推荐
    // #202608302800 P0-1：UUID 字符串 ID，Number() 会退化为 NaN 导致推荐恒为 null
    const recommendation = await userLevelService.recommendLevelUpgrade(currentUser.id);

    if (!recommendation) {
      return NextResponse.json({
        success: true,
        recommendation: null,
        message: '当前已是最高等级或暂无推荐'
      });
    }

    return NextResponse.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('[Recommendation API] 获取推荐失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
