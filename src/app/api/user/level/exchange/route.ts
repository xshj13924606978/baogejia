import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';
import { requireAuth } from '@/lib/auth-utils';
import {
  EXCHANGE_DAY_OPTIONS,
  LEVEL_NUM_TO_CODE,
  MAX_LEVEL,
  MIN_LEVEL,
} from '@/lib/level-constants';

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
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;


    // 获取兑换比例
    const exchangeRates = await tokenBillingService.getExchangeRates();
    
    // 获取用户余额
    // #202608302800 P0-1：user_token_balance.user_id 为 UUID，直接用字符串 ID
    const balance = await tokenBillingService.getUserBalance(currentUser.id);

    // 获取当前等级
    const { userLevelService } = await import('@/lib/user-level-service');
    const currentLevel = await userLevelService.getUserLevel(currentUser.id);

    // 兑换档位：名称与阈值全部来自数据库（level_definitions），杜绝硬编码
    // 积分公式与 token-billing-service.exchangePointsForLevel 保持一致：
    //   所需积分 = ceil(等级 × 100 × 天数 / 30)
    // #202608302400 P0-1/P0-2
    const allLevels = await userLevelService.getAllLevels();
    const exchangeRatesByLevel = allLevels
      .filter((l) => l.level >= 2 && l.level <= 5)
      .map((l) => ({
        level: l.level,
        levelCode: LEVEL_NUM_TO_CODE[l.level] ?? `L${l.level - 1}`,
        name: l.name,
        /** 每天所需积分 = ceil(等级 × 100 / 30) */
        dailyPoints: Math.ceil((l.level * 100) / 30),
        /** 30 天所需积分 */
        pointsFor30Days: Math.ceil((l.level * 100 * 30) / 30),
        /** 各常用档位所需积分 */
        pointsByDays: EXCHANGE_DAY_OPTIONS.reduce(
          (acc, d) => {
            acc[d] = Math.ceil((l.level * 100 * d) / 30);
            return acc;
          },
          {} as Record<number, number>
        ),
        requiredPoints: l.required_points,
      }));

    return NextResponse.json({
      success: true,
      data: {
        exchangeRates,
        balance,
        currentLevel,
        exchangeRatesByLevel,
        dayOptions: EXCHANGE_DAY_OPTIONS,
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
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();

    // 兼容历史调用方：targetLevel 为 level 的别名（PermissionPanel 曾传 targetLevel 导致 400）
    // 未指定天数时默认兑换 30 天
    // #202608302400 P0-2
    const rawLevel = body?.level ?? body?.targetLevel;
    const rawDays = body?.days;
    const level = Number(rawLevel);
    const days = rawDays === undefined || rawDays === null ? 30 : Number(rawDays);

    if (!Number.isFinite(level)) {
      return NextResponse.json(
        { error: '缺少必要参数：level（或 targetLevel）' },
        { status: 400 }
      );
    }

    if (level < MIN_LEVEL + 1 || level > MAX_LEVEL) {
      return NextResponse.json(
        { error: `等级必须在${MIN_LEVEL + 1}-${MAX_LEVEL}之间` },
        { status: 400 }
      );
    }

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: '天数必须在1-365之间' },
        { status: 400 }
      );
    }


    // 执行兑换
    const result = await tokenBillingService.exchangePointsForLevel(
      currentUser.id,
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
