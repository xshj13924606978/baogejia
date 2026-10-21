// 管理端订单退款 API
// POST /api/admin/orders/[orderNo]/refund - 退款操作
// body: { reason: string }

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { orderService } from '@/lib/order-service';

async function refundOrder(request: NextRequest, params: any, user: any) {
  try {
    const { orderNo } = params || {};
    if (!orderNo) {
      return NextResponse.json({ success: false, error: '缺少订单号' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || '').trim();
    if (!reason) {
      return NextResponse.json({ success: false, error: '请填写退款原因' }, { status: 400 });
    }

    const operator = user?.email || user?.username || user?.id || 'admin';
    const result = await orderService.refundOrder(orderNo, reason, operator);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason || '退款失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AdminOrderRefund POST] 退款失败:', error);
    return NextResponse.json({ success: false, error: '退款失败' }, { status: 500 });
  }
}

export const POST = withPermissionCheckWithParams({ permissions: 'admin.orders.edit' }, refundOrder);
