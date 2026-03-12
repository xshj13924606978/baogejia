import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 用户Token余额API
 * 
 * 功能：
 * - GET: 获取用户余额
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

    console.log('[UserBalance API] 获取用户余额:', currentUser.id);

    // 获取用户余额
    const balance = await tokenBillingService.getUserBalance(parseInt(currentUser.id));

    if (!balance) {
      return NextResponse.json(
        { error: '获取用户余额失败' },
        { status: 500 }
      );
    }

    // 获取兑换比例
    const exchangeRates = await tokenBillingService.getExchangeRates();

    return NextResponse.json({
      success: true,
      data: {
        balance,
        exchangeRates
      }
    });
  } catch (error) {
    console.error('[UserBalance API] 获取用户余额异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
