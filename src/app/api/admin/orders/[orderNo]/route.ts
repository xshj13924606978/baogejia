// 管理端订单详情 API
// GET /api/admin/orders/[orderNo] - 订单详情（含用户信息）

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { orderService, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from '@/lib/order-service';

async function getOrderDetail(request: NextRequest, params: any, _user: any) {
  try {
    const { orderNo } = params || {};
    if (!orderNo) {
      return NextResponse.json({ success: false, error: '缺少订单号' }, { status: 400 });
    }

    const order = await orderService.getOrderDetail(orderNo, { asAdmin: true });
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
    console.error('[AdminOrderDetail GET] 获取订单详情失败:', error);
    return NextResponse.json({ success: false, error: '获取订单详情失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheckWithParams({ permissions: 'admin.orders.view' }, getOrderDetail);
