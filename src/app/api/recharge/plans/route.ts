import { NextResponse } from 'next/server';
import { getExchangeRates, getRechargePlans } from '@/lib/recharge/points';

/**
 * 充值套餐 + 兑换比例 API（公开，无需登录）
 *
 * #202608302400 阶段4 P1-1 配置数据源统一：
 *   改为复用 @/lib/recharge/points 的统一实现（此前本文件与服务端各有一套
 *   换算/套餐生成逻辑，存在分叉风险，且本文件不支持 RECHARGE_PLANS 环境变量）。
 *   现在两者的唯一数据源均为：
 *     1) 环境变量 RECHARGE_PLANS（格式 "积分:价格_积分:价格"）
 *     2) trade_config.points.recharge_rate（兑换比例）
 *     3) trade_config.points.recharge_tiers（金额档位，未配置回退默认档位）
 *     4) knowledge_entries（billing_config，迁移过渡期兼容回退）
 *
 * GET: 返回充值套餐列表 + 兑换比例
 */

export async function GET() {
  try {
    const [plans, exchangeRates] = await Promise.all([
      getRechargePlans(),
      getExchangeRates(),
    ]);

    // #202608292100-P0: 支付宝未配置时下架入口（服务端判断，避免前端走 mock 支付链路）
    const alipayEnabled = !!(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY);

    return NextResponse.json(
      { success: true, data: { plans, exchangeRates, alipayEnabled } },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error) {
    console.error('[RechargePlans API] 获取异常:', error);
    return NextResponse.json(
      { success: false, error: '获取充值套餐失败' },
      { status: 500 }
    );
  }
}
