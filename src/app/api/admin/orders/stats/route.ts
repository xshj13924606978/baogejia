// 管理端订单统计 API
// GET /api/admin/orders/stats - 订单统计（汇总 + 按类型 + 日/月趋势）

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { orderService } from '@/lib/order-service';

async function getOrderStats(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stats = await orderService.getOrderStats({
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    });
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[AdminOrders Stats GET] 获取订单统计失败:', error);
    return NextResponse.json({ success: false, error: '获取订单统计失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.orders.view' }, getOrderStats);
