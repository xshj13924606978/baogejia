// 微信支付统一下单 API（Native 扫码支付）

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { unifiedOrder, getWechatPaymentConfig } from '@/lib/wechat-payment';

/**
 * POST /api/payment/wechat/unifiedorder
 * body: { orderNo: string }（充值订单号）
 * @returns { success, code_url } 支付二维码链接（weixin://wxpay/bizpayurl?pr=xxx）
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const payConfig = await getWechatPaymentConfig();
    if (!payConfig) {
      return NextResponse.json(
        { success: false, error: '微信支付未配置，请联系管理员' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const orderNo = body?.orderNo;
    if (!orderNo || typeof orderNo !== 'string') {
      return NextResponse.json({ success: false, error: '缺少订单号' }, { status: 400 });
    }

    // 查询充值订单（仅本人订单）
    const db = getSupabaseServiceClient();
    const { data: order, error } = await db
      .from('recharge_orders')
      .select('order_no, plan_id, points, amount, status, expires_at')
      .eq('order_no', orderNo)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[WechatUnifiedOrder API] 查询订单失败:', error.message);
      return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ success: false, error: '订单不存在' }, { status: 404 });
    }
    if (order.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `订单状态异常（${order.status}）` },
        { status: 400 }
      );
    }
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
      return NextResponse.json({ success: false, error: '订单已过期，请重新下单' }, { status: 400 });
    }

    // 金额换算：元 → 分（微信支付最小单位）
    const amountFen = Math.round(Number(order.amount) * 100);

    const result = await unifiedOrder({
      description: `积分充值 ${order.points} 积分`,
      outTradeNo: order.order_no,
      amount: amountFen,
      notifyUrl: payConfig.notifyUrl || `${getBaseUrl()}/api/payment/wechat/notify`,
    });

    return NextResponse.json({ success: true, code_url: result.code_url });
  } catch (e: any) {
    console.error('[WechatUnifiedOrder API] 统一下单异常:', e?.message || e);
    return NextResponse.json(
      { success: false, error: e?.message || '统一下单失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payment/wechat/unifiedorder - 查询微信支付配置状态（前端降级提示用）
 */
export async function GET() {
  const config = await getWechatPaymentConfig();
  return NextResponse.json({
    success: true,
    configured: config !== null,
  });
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
