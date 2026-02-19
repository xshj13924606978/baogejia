// 退款 API 路由 - 订单退款

import { NextRequest, NextResponse } from 'next/server';
import { orderService } from '@/lib/order-service';

/**
 * POST /api/orders/[id]/refund - 申请退款
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '缺少订单ID' },
        { status: 400 }
      );
    }

    const refund = await orderService.requestRefund(id, reason);

    if (!refund) {
      return NextResponse.json(
        { success: false, error: '订单不存在或无法退款' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      refund,
    });
  } catch (error) {
    console.error('[Refund API] 申请退款失败:', error);
    return NextResponse.json(
      { success: false, error: '申请退款失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders/[id]/refund - 查询退款状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '缺少订单ID' },
        { status: 400 }
      );
    }

    const order = await orderService.getOrderById(id);

    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      refund_status: order.status === 'refunding' ? 'pending' :
                      order.status === 'refunded' ? 'success' : 'none',
    });
  } catch (error) {
    console.error('[Refund API] 查询退款状态失败:', error);
    return NextResponse.json(
      { success: false, error: '查询退款状态失败' },
      { status: 500 }
    );
  }
}
