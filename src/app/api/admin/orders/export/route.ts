// 管理端订单导出 API
// GET /api/admin/orders/export - 导出订单报表（CSV）

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { orderService, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from '@/lib/order-service';

function csvEscape(v: any): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function exportOrders(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orders = await orderService.getOrdersForExport({
      orderType: searchParams.get('orderType') || 'all',
      status: searchParams.get('status') || 'all',
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    });

    const headers = ['订单号', '类型', '状态', '金额(元)', '支付方式', '支付流水号', '用户', '创建时间', '支付时间', '备注'];
    const rows = orders.map((o) => [
      o.order_no,
      ORDER_TYPE_LABEL[o.order_type] || o.order_type,
      ORDER_STATUS_LABEL[o.status] || o.status,
      Number(o.amount || 0).toFixed(2),
      o.payment_method || '',
      o.payment_id || '',
      o.user?.username || o.user?.email || o.user?.phone || o.user_id || '',
      o.created_at ? new Date(o.created_at).toLocaleString('zh-CN') : '',
      o.paid_at ? new Date(o.paid_at).toLocaleString('zh-CN') : '',
      o.remark || '',
    ]);

    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const bom = '\uFEFF'; // UTF-8 BOM，Excel 中文兼容
    const filename = `orders_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[AdminOrders Export GET] 导出订单失败:', error);
    return NextResponse.json({ success: false, error: '导出订单失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.orders.edit' }, exportOrders);
