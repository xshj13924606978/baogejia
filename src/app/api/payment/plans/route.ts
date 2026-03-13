import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';

/**
 * 支付套餐API
 *
 * 功能：
 * - GET: 获取套餐列表
 */

export async function GET(_request: NextRequest) {
  try {
    console.log('[PaymentPlans API] 获取套餐列表');

    // 获取套餐列表
    const plans = tokenBillingService.getPaymentPlans();

    // 获取兑换比例
    const exchangeRates = await tokenBillingService.getExchangeRates();

    return NextResponse.json({
      success: true,
      data: {
        plans,
        exchangeRates}});
  } catch (error) {
    console.error('[PaymentPlans API] 获取套餐列表异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
