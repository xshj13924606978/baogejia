import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 等级兑换API
 * 
 * 功能：
 * - POST: 用积分兑换等级
 * - GET: 获取兑换比例
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    console.log('[LevelExchange API] 获取兑换比例');

    // 获取兑换比例
    const exchangeRates = await tokenBillingService.getExchangeRates();
    
    // 获取用户余额
    const balance = await tokenBillingService.getUserBalance(parseInt(currentUser.id));

    // 获取当前等级
    const { userLevelService } = await import('@/lib/user-level-service');
    const currentLevel = await userLevelService.getUserLevel(currentUser.id);

    // 计算兑换价格（等级 * 100 积分 / 30天）
    const exchangeRatesByLevel = [
      { level: 2, dailyPoints: 7, name: '普通会员' },
      { level: 3, dailyPoints: 17, name: 'VIP会员' },
      { level: 4, dailyPoints: 33, name: '企业会员' },
      { level: 5, dailyPoints: 167, name: '超级会员' }
    ];

    return NextResponse.json({
      success: true,
      data: {
        exchangeRates,
        balance,
        currentLevel,
        exchangeRatesByLevel
      }
    });
  } catch (error) {
    console.error('[LevelExchange API] 获取兑换比例异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { level, days } = body;

    if (!level || !days) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (level < 2 || level > 5) {
      return NextResponse.json(
        { error: '等级必须在2-5之间' },
        { status: 400 }
      );
    }

    if (days < 1 || days > 365) {
      return NextResponse.json(
        { error: '天数必须在1-365之间' },
        { status: 400 }
      );
    }

    console.log('[LevelExchange API] 兑换等级:', { userId: currentUser.id, level, days });

    // 执行兑换
    const result = await tokenBillingService.exchangePointsForLevel(
      parseInt(currentUser.id),
      level,
      days
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('[LevelExchange API] 兑换等级异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
