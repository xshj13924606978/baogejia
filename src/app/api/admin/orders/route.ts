// 管理端统一订单列表 API
// GET /api/admin/orders - 订单列表（筛选/搜索/分页）

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { orderService, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from '@/lib/order-service';

async function getOrders(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const result = await orderService.getAdminOrders({
      orderType: searchParams.get('orderType') || 'all',
      status: searchParams.get('status') || 'all',
      keyword: searchParams.get('keyword') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 20),
    });

    const orders = result.orders.map((o) => ({
      ...o,
      order_type_label: ORDER_TYPE_LABEL[o.order_type] || o.order_type,
      status_label: ORDER_STATUS_LABEL[o.status] || o.status,
    }));

    return NextResponse.json({ success: true, orders, total: result.total });
  } catch (error) {
    console.error('[AdminOrders GET] 获取订单列表失败:', error);
    return NextResponse.json({ success: false, error: '获取订单列表失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.orders.view' }, getOrders);
