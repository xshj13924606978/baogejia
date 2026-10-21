// 支付 API 路由 - 处理支付请求

import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/lib/payment-service';
import { PaymentMethod } from '@/types/payment';

/**
 * POST /api/payment - 创建支付
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id, payment_method, openid, return_url } = body;

    // 验证必填参数
    if (!order_id || !payment_method) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }

    // 验证支付方式
    if (!Object.values(PaymentMethod).includes(payment_method)) {
      return NextResponse.json({ success: false, error: '不支持的支付方式' }, { status: 400 });
    }

    // 创建支付
    const result = await paymentService.createPayment({
      order_id,
      payment_method,
      openid,
      return_url,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Payment API] 创建支付失败:', error);
    return NextResponse.json({ success: false, error: '创建支付失败' }, { status: 500 });
  }
}

/**
 * GET /api/payment - 获取支付方式列表
 */
export async function GET() {
  const paymentMethods = [
    {
      value: PaymentMethod.WECHAT_JSAPI,
      label: '微信支付',
      icon: 'wechat_pay',
      desc: '使用微信支付',
      enabled: true,
    },
    {
      value: PaymentMethod.ALIPAY_WEB,
      label: '支付宝支付',
      icon: 'alipay',
      desc: '使用支付宝支付',
      enabled: true,
    },
    {
      value: PaymentMethod.WECHAT_NATIVE,
      label: '微信扫码支付',
      icon: 'wechat_qr',
      desc: '扫描二维码使用微信支付',
      enabled: true,
    },
    {
      value: PaymentMethod.ALIPAY_QR,
      label: '支付宝扫码支付',
      icon: 'alipay_qr',
      desc: '扫描二维码使用支付宝支付',
      enabled: true,
    },
  ];

  return NextResponse.json({
    success: true,
    payment_methods: paymentMethods,
  });
}
