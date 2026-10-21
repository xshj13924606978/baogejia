// 用户端统一订单 API
// GET  /api/orders            我的订单列表（类型/状态筛选 + 分页）
// POST /api/orders            创建待支付订单（兼容旧支付宝链路，底层为 unified_orders）

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { orderService, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from '@/lib/order-service';

const VALID_TYPES = ['all', 'recharge', 'mall', 'membership', 'token', 'brand'];
const VALID_STATUSES = ['all', 'pending', 'paid', 'completed', 'cancelled', 'refunding', 'refunded', 'failed'];

/**
 * GET /api/orders - 我的订单列表
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const orderType = searchParams.get('orderType') || 'all';
    const status = searchParams.get('status') || 'all';
    const keyword = searchParams.get('keyword') || undefined;
    const page = Number(searchParams.get('page') || 1);
    const pageSize = Number(searchParams.get('pageSize') || 20);

    const result = await orderService.getUserOrderList(String(user.id), {
      orderType: VALID_TYPES.includes(orderType) ? orderType : 'all',
      status: VALID_STATUSES.includes(status) ? status : 'all',
      keyword,
      page,
      pageSize,
    });

    const orders = result.orders.map((o) => ({
      ...o,
      order_type_label: ORDER_TYPE_LABEL[o.order_type] || o.order_type,
      status_label: ORDER_STATUS_LABEL[o.status] || o.status,
    }));

    return NextResponse.json({ success: true, orders, total: result.total });
  } catch (error) {
    console.error('[Orders API] 查询订单失败:', error);
    return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
  }
}

/**
 * POST /api/orders - 创建订单（兼容旧调用；新交易请走各业务模块下单接口）
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const order = await orderService.createOrder({ ...body, user_id: String(user.id) });
    if (!order) {
      return NextResponse.json({ success: false, error: '创建订单失败' }, { status: 400 });
    }
    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('[Orders API] 创建订单失败:', error);
    return NextResponse.json({ success: false, error: '创建订单失败' }, { status: 500 });
  }
}
