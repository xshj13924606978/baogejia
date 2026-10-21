// 用户端订单详情 API
// GET /api/orders/[orderNo] - 我的订单详情（仅限本人）

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { orderService, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from '@/lib/order-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { orderNo } = await params;
    if (!orderNo) {
      return NextResponse.json({ success: false, error: '缺少订单号' }, { status: 400 });
    }

    const order = await orderService.getOrderDetail(orderNo, { userId: String(user.id) });
    if (!order) {
      return NextResponse.json({ success: false, error: '订单不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        order_type_label: ORDER_TYPE_LABEL[order.order_type] || order.order_type,
        status_label: ORDER_STATUS_LABEL[order.status] || order.status,
      },
    });
  } catch (error) {
    console.error('[OrderDetail API] 查询订单详情失败:', error);
    return NextResponse.json({ success: false, error: '查询订单详情失败' }, { status: 500 });
  }
}
