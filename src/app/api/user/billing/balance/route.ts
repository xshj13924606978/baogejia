import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 用户Token余额API
 *
 * 功能：
 * - GET: 获取用户余额
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;


    // 获取用户余额
    let balance = null;
    try {
      // #202608302800 P0-1：UUID 字符串 ID，禁用 parseInt
      balance = await tokenBillingService.getUserBalance(currentUser.id);
    } catch (_balanceError) {
      // 余额服务异常时降级处理，不影响主流程
    }

    if (!balance) {
      // 无余额记录时返回默认值
      return NextResponse.json({
        success: true,
        data: {
          balance: {
            pointsBalance: 0,
            tokenBalance: 0,
            totalConsumedTokens: 0,
            totalConsumedPoints: 0,
          },
          exchangeRates: null,
        },
      });
    }

    // 获取兑换比例
    const exchangeRates = await tokenBillingService.getExchangeRates();

    return NextResponse.json({
      success: true,
      data: {
        balance,
        exchangeRates,
      },
    });
  } catch (error) {
    console.error('[UserBalance API] 获取用户余额异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
