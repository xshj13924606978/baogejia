// 微信支付回调 API（APIv3）
//
// 完整链路：
//   验签（平台证书公钥 RSA-SHA256，未配置时由 AEAD 解密兜底）
//   → 解密回调数据（AEAD_AES_256_GCM，APIv3 密钥）
//   → 校验商户号/订单/金额
//   → 幂等加积分（rechargePoints，reference_id 防重复发放）
//   → 更新订单状态
//   → 返回微信要求的 XML 应答（成功/失败，微信会自动重试失败应答）

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { parseNotifyPayload, getWechatPaymentConfig } from '@/lib/wechat-payment';
import { rechargePoints } from '@/lib/recharge/points';
import { deliverExchange } from '@/lib/mall-service';
import { activateMembership } from '@/lib/membership-service';
import { creditToken } from '@/lib/token-purchase-service';
import { activateBrandPayment } from '@/lib/brand-service';
import { syncOrderFromBusiness } from '@/lib/order-service';

/**
 * POST /api/payment/wechat/notify - 微信支付异步回调
 * 该接口不校验登录态（由微信服务器调用），安全性依赖回调验签/解密。
 */
export async function POST(request: NextRequest) {
  const body = await request.text();

  // #[20260901-1140] 入口到达日志：确认回调已穿透 proxy 到达应用层（排查 307 拦截问题的关键观测点）
  console.log(
    `[WechatNotify] 收到支付回调: len=${body.length}, serial=${request.headers.get('wechatpay-serial') || '-'}, ts=${request.headers.get('wechatpay-timestamp') || '-'}`
  );

  try {
    // 0. 加载微信支付配置（trade_config 优先，env 兜底）
    const payConfig = await getWechatPaymentConfig();
    if (!payConfig) {
      console.error('[WechatNotify] 微信支付未配置，拒绝处理回调');
      return failXmlResponse();
    }

    // 1. 验签 + 解密回调数据
    let data: Record<string, any>;
    try {
      data = await parseNotifyPayload(request.headers, body, payConfig);
    } catch (e: any) {
      // #[20260901-1140] 验签/解密失败单独记录原始摘要，便于区分「回调未到达」与「到达但校验失败」
      console.error(
        `[WechatNotify] 验签/解密失败: ${e?.message || e}, bodyHead=${body.slice(0, 200)}`
      );
      return failXmlResponse();
    }

    // 2. 提取关键字段
    const outTradeNo = data.out_trade_no;
    const transactionId = data.transaction_id;
    const totalFen = Number(data.amount?.total); // 单位：分
    const tradeState = data.trade_state;

    if (!outTradeNo || !transactionId) {
      console.error('[WechatNotify] 回调缺少订单号或交易号');
      return failXmlResponse();
    }

    // 3. 校验交易状态
    if (tradeState && tradeState !== 'SUCCESS') {
      console.error(`[WechatNotify] 交易状态非成功: ${tradeState}`);
      return failXmlResponse();
    }

    const db = getSupabaseServiceClient();

    // 商城现金购买订单（MX 前缀）→ 走商城交付流程
    if (outTradeNo.startsWith('MX')) {
      return handleMallExchangeNotify(db, outTradeNo, transactionId, totalFen);
    }

    // 会员购买订单（MB 前缀）→ 走会员开通流程
    if (outTradeNo.startsWith('MB')) {
      return handleMembershipNotify(db, outTradeNo, transactionId, totalFen);
    }

    // Token 购买订单（TK 前缀）→ 走 Token 到账流程
    if (outTradeNo.startsWith('TK')) {
      return handleTokenNotify(db, outTradeNo, transactionId, totalFen);
    }

    // 品牌推广订单（BP 前缀）→ 走品牌权益开通流程
    if (outTradeNo.startsWith('BP')) {
      return handleBrandNotify(db, outTradeNo, transactionId, totalFen);
    }

    // 充值订单（RC/其他）→ 原有充值流程
    const { data: order, error } = await db
      .from('recharge_orders')
      .select('order_no, user_id, points, amount, status, transaction_id')
      .eq('order_no', outTradeNo)
      .maybeSingle();

    if (error) {
      console.error('[WechatNotify] 查询订单失败:', error.message);
      return failXmlResponse();
    }
    if (!order) {
      console.error(`[WechatNotify] 订单不存在: ${outTradeNo}`);
      return failXmlResponse();
    }

    // 4. 幂等：订单已 completed 直接返回成功（微信收到 SUCCESS 后停止重试）
    if (order.status === 'completed') {
      console.log(`[WechatNotify] 订单已处理，幂等返回成功: ${outTradeNo}`);
      // 兜底同步到统一订单（对历史遗漏/重复回调补录）
      await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
      return successXmlResponse();
    }

    // 5. 校验金额（回调金额必须与订单金额一致，防止篡改）
    const expectedFen = Math.round(Number(order.amount) * 100);
    if (!Number.isFinite(totalFen) || totalFen !== expectedFen) {
      console.error(
        `[WechatNotify] 金额不匹配: 订单=${outTradeNo}, 预期=${expectedFen}分, 实际=${totalFen}分`
      );
      return failXmlResponse();
    }

    // 6. 加积分（reference_id 幂等：recharge_{orderNo}，重复回调不重复发放）
    const rechargeResult = await rechargePoints({
      userId: order.user_id,
      points: order.points,
      orderNo: outTradeNo,
      referenceId: `recharge_${outTradeNo}`,
    });

    if (!rechargeResult.success) {
      console.error(
        `[WechatNotify] 积分入账失败: order=${outTradeNo}, user=${order.user_id}, points=${order.points}`
      );
      // 返回失败让微信重试（订单仍为 pending，重试不会重复加积分——reference_id 幂等）
      return failXmlResponse();
    }

    // 7. 更新订单状态
    const { error: updateError } = await db
      .from('recharge_orders')
      .update({
        status: 'completed',
        transaction_id: transactionId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('order_no', outTradeNo);

    if (updateError) {
      console.error('[WechatNotify] 更新订单状态失败:', updateError.message);
      // 积分已入账（幂等），订单状态更新失败重试时会被 reference_id 幂等拦截，不会重复加积分
      return failXmlResponse();
    }

    console.log(`[WechatNotify] 充值成功: order=${outTradeNo}, points=${order.points}, tx=${transactionId}`);

    // 同步到统一订单表
    await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });

    return successXmlResponse();
  } catch (e) {
    console.error('[WechatNotify] 处理回调失败:', e);
    return failXmlResponse();
  }
}

/**
 * 处理商城现金购买回调（MX 前缀订单）
 * - 校验金额 → 幂等 → 虚拟商品自动完成（发放）/ 实物商品进入待发货
 */
async function handleMallExchangeNotify(db: any, outTradeNo: string, transactionId: string, totalFen: number) {
  const { data: exchange, error } = await db
    .from('mall_exchanges')
    .select('id, exchange_no, user_id, product_id, category, cash_paid, quantity, status, pay_method')
    .eq('pay_order_no', outTradeNo)
    .maybeSingle();

  if (error) {
    console.error(`[WechatNotify] 查询商城订单失败: ${outTradeNo}`, error.message);
    return failXmlResponse();
  }
  if (!exchange) {
    console.error(`[WechatNotify] 商城订单不存在: ${outTradeNo}`);
    return failXmlResponse();
  }
  if (exchange.pay_method !== 'cash') {
    console.error(`[WechatNotify] 订单非现金购买: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 幂等：已完成/已发货直接返回成功
  if (exchange.status === 'completed' || exchange.status === 'shipped') {
    console.log(`[WechatNotify] 商城订单已处理，幂等返回成功: ${outTradeNo}`);
    // 兜底同步到统一订单
    await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
    return successXmlResponse();
  }
  if (exchange.status === 'cancelled' || exchange.status === 'refunded') {
    console.error(`[WechatNotify] 商城订单已取消/退款，拒绝入账: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 校验金额
  const expectedFen = Math.round(Number(exchange.cash_paid) * 100);
  if (!Number.isFinite(totalFen) || totalFen !== expectedFen) {
    console.error(
      `[WechatNotify] 商城订单金额不匹配: order=${outTradeNo}, 预期=${expectedFen}分, 实际=${totalFen}分`
    );
    return failXmlResponse();
  }

  // 虚拟商品自动完成（发放权益）；实物商品标记完成（待发货状态由管理端发货置为 shipped）
  // 此处统一复用 deliverExchange：虚拟→completed，实物→shipped
  const deliveryInfo = {
    payment_tx_id: transactionId,
    paid_at: new Date().toISOString(),
    type: exchange.category === 'physical' ? 'shipped' : 'auto',
  };
  const result = await deliverExchange('wechat_notify', exchange.id, deliveryInfo);

  if (!result.success) {
    console.error(`[WechatNotify] 商城订单发放失败: order=${outTradeNo}, reason=${result.reason}`);
    return failXmlResponse();
  }

  console.log(`[WechatNotify] 商城订单支付成功: exchange=${exchange.exchange_no}, tx=${transactionId}`);

  // 同步到统一订单表
  await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
  return successXmlResponse();
}

/**
 * 处理会员购买回调（MB 前缀订单）
 * - 校验金额（订单 plan_id → membership_plans.price）→ 幂等开通/续费
 */
async function handleMembershipNotify(db: any, outTradeNo: string, transactionId: string, totalFen: number) {
  const { data: order, error } = await db
    .from('user_memberships')
    .select('id, order_no, user_id, plan_id, level_code, status, start_date, end_date')
    .eq('order_no', outTradeNo)
    .maybeSingle();

  if (error) {
    console.error(`[WechatNotify] 查询会员订单失败: ${outTradeNo}`, error.message);
    return failXmlResponse();
  }
  if (!order) {
    console.error(`[WechatNotify] 会员订单不存在: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 幂等：已激活直接返回成功
  if (order.status === 'active') {
    console.log(`[WechatNotify] 会员订单已处理，幂等返回成功: ${outTradeNo}`);
    // 兜底同步到统一订单
    await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
    return successXmlResponse();
  }
  if (order.status === 'cancelled') {
    console.error(`[WechatNotify] 会员订单已取消，拒绝开通: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 查询套餐价格用于金额校验
  const { data: plan } = await db
    .from('membership_plans')
    .select('price, duration_days, level_code')
    .eq('id', order.plan_id)
    .maybeSingle();
  if (!plan) {
    console.error(`[WechatNotify] 会员套餐不存在: plan=${order.plan_id}, order=${outTradeNo}`);
    return failXmlResponse();
  }

  const expectedFen = Math.round(Number(plan.price) * 100);
  if (!Number.isFinite(totalFen) || totalFen !== expectedFen) {
    console.error(
      `[WechatNotify] 会员订单金额不匹配: order=${outTradeNo}, 预期=${expectedFen}分, 实际=${totalFen}分`
    );
    return failXmlResponse();
  }

  const result = await activateMembership(order.user_id, outTradeNo, transactionId);
  if (!result.success) {
    console.error(`[WechatNotify] 会员开通失败: order=${outTradeNo}, reason=${result.reason}`);
    return failXmlResponse();
  }

  console.log(
    `[WechatNotify] 会员开通成功: order=${outTradeNo}, user=${order.user_id}, extended=${result.extended}, tx=${transactionId}`
  );

  // 同步到统一订单表
  await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
  return successXmlResponse();
}

/**
 * 处理 Token 购买回调（TK 前缀订单）
 * - 校验金额（token_purchases.price）→ 幂等到账 token_balance
 */
async function handleTokenNotify(db: any, outTradeNo: string, transactionId: string, totalFen: number) {
  const { data: order, error } = await db
    .from('token_purchases')
    .select('id, order_no, user_id, total_token, price, status')
    .eq('order_no', outTradeNo)
    .maybeSingle();

  if (error) {
    console.error(`[WechatNotify] 查询 Token 订单失败: ${outTradeNo}`, error.message);
    return failXmlResponse();
  }
  if (!order) {
    console.error(`[WechatNotify] Token 订单不存在: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 幂等：已完成直接返回成功
  if (order.status === 'completed') {
    console.log(`[WechatNotify] Token 订单已处理，幂等返回成功: ${outTradeNo}`);
    // 兜底同步到统一订单
    await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
    return successXmlResponse();
  }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    console.error(`[WechatNotify] Token 订单已取消/退款，拒绝到账: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 校验金额
  const expectedFen = Math.round(Number(order.price) * 100);
  if (!Number.isFinite(totalFen) || totalFen !== expectedFen) {
    console.error(
      `[WechatNotify] Token 订单金额不匹配: order=${outTradeNo}, 预期=${expectedFen}分, 实际=${totalFen}分`
    );
    return failXmlResponse();
  }

  const result = await creditToken(order.user_id, outTradeNo, transactionId);
  if (!result.success) {
    console.error(`[WechatNotify] Token 到账失败: order=${outTradeNo}, reason=${result.reason}`);
    return failXmlResponse();
  }

  console.log(
    `[WechatNotify] Token 到账成功: order=${outTradeNo}, user=${order.user_id}, tokens=${result.tokensCredited}, tx=${transactionId}`
  );

  // 同步到统一订单表
  await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
  return successXmlResponse();
}

/**
 * 处理品牌推广购买回调（BP 前缀订单）
 * - 校验金额（brand_payments.amount）→ 幂等开通品牌权益
 */
async function handleBrandNotify(db: any, outTradeNo: string, transactionId: string, totalFen: number) {
  const { data: order, error } = await db
    .from('brand_payments')
    .select('id, order_no, brand_id, user_id, amount, status')
    .eq('order_no', outTradeNo)
    .maybeSingle();

  if (error) {
    console.error(`[WechatNotify] 查询品牌订单失败: ${outTradeNo}`, error.message);
    return failXmlResponse();
  }
  if (!order) {
    console.error(`[WechatNotify] 品牌订单不存在: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 幂等：已完成直接返回成功
  if (order.status === 'completed') {
    console.log(`[WechatNotify] 品牌订单已处理，幂等返回成功: ${outTradeNo}`);
    // 兜底同步到统一订单
    await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
    return successXmlResponse();
  }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    console.error(`[WechatNotify] 品牌订单已取消/退款，拒绝开通: ${outTradeNo}`);
    return failXmlResponse();
  }

  // 校验金额
  const expectedFen = Math.round(Number(order.amount) * 100);
  if (!Number.isFinite(totalFen) || totalFen !== expectedFen) {
    console.error(
      `[WechatNotify] 品牌订单金额不匹配: order=${outTradeNo}, 预期=${expectedFen}分, 实际=${totalFen}分`
    );
    return failXmlResponse();
  }

  const result = await activateBrandPayment(order.brand_id, outTradeNo, transactionId);
  if (!result.success) {
    console.error(`[WechatNotify] 品牌权益开通失败: order=${outTradeNo}, reason=${result.reason}`);
    return failXmlResponse();
  }

  console.log(
    `[WechatNotify] 品牌权益开通成功: order=${outTradeNo}, brand=${order.brand_id}, tx=${transactionId}`
  );

  // 同步到统一订单表
  await syncOrderFromBusiness(outTradeNo, { paymentId: transactionId, paidAt: new Date().toISOString() });
  return successXmlResponse();
}

/** 微信要求的成功应答（XML） */
function successXmlResponse(): NextResponse {
  return new NextResponse(
    `<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>`,
    { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
  );
}

/** 微信要求的失败应答（XML，微信会按策略重试） */
function failXmlResponse(): NextResponse {
  return new NextResponse(
    `<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[处理失败]]></return_msg></xml>`,
    { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
  );
}
