// 支付宝支付回调 API 路由

import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/lib/payment-service';

/**
 * POST /api/payment/alipay/notify - 支付宝异步回调
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const notifyData: any = {};

    // 将 FormData 转换为普通对象
    for (const [key, value] of formData.entries()) {
      notifyData[key] = value;
    }

    console.log('[Alipay Notify] 收到支付宝回调:', notifyData);

    // 处理支付回调
    const success = await paymentService.handleAlipayNotify(notifyData);

    if (success) {
      // 返回支付宝要求的成功响应
      return new NextResponse('success', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    } else {
      // 返回失败响应
      return new NextResponse('fail', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
  } catch (error) {
    console.error('[Alipay Notify] 处理支付宝回调失败:', error);
    return new NextResponse('fail', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}

/**
 * GET /api/payment/alipay/return - 支付宝同步返回
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const notifyData: any = {};

    // 将查询参数转换为普通对象
    for (const [key, value] of searchParams.entries()) {
      notifyData[key] = value;
    }

    console.log('[Alipay Return] 收到支付宝同步返回:', notifyData);

    // 处理支付回调
    const success = await paymentService.handleAlipayNotify(notifyData);

    if (success) {
      // 重定向到支付结果页
      const outTradeNo = notifyData.out_trade_no;
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/payment/result?order_no=${outTradeNo}&status=success`
      );
    } else {
      // 重定向到支付结果失败页
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/payment/result?status=fail`
      );
    }
  } catch (error) {
    console.error('[Alipay Return] 处理支付宝同步返回失败:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/payment/result?status=error`
    );
  }
}
