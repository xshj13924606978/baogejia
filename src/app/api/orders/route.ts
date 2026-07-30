// 订单 API 路由 - 订单管理（创建/查询）

import { NextRequest, NextResponse } from 'next/server';
import { orderService } from '@/lib/order-service';
import { CreateOrderRequest, OrderType, PaymentMethod } from '@/types/payment';
import { requireAuth } from '@/lib/auth-utils';

/**
 * POST /api/orders - 创建订单
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const {
      user_id,
      type,
      item_id,
      item_name,
      amount,
      points_used = 0,
      payment_method,
      metadata,
    } = body;

    // 验证必填参数
    if (!user_id || !type || !item_id || !item_name || !amount || !payment_method) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }

    // 验证订单类型
    if (!Object.values(OrderType).includes(type)) {
      return NextResponse.json({ success: false, error: '无效的订单类型' }, { status: 400 });
    }

    // 验证支付方式
    if (!Object.values(PaymentMethod).includes(payment_method)) {
      return NextResponse.json({ success: false, error: '不支持的支付方式' }, { status: 400 });
    }

    // 验证金额
    if (amount <= 0) {
      return NextResponse.json({ success: false, error: '订单金额必须大于0' }, { status: 400 });
    }

    // 创建订单请求
    const createOrderRequest: CreateOrderRequest = {
      user_id,
      type,
      item_id,
      item_name,
      amount,
      points_used,
      payment_method,
      metadata,
    };

    // 创建订单
    const order = await orderService.createOrder(createOrderRequest);

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Orders API] 创建订单失败:', error);
    return NextResponse.json({ success: false, error: '创建订单失败' }, { status: 500 });
  }
}

/**
 * GET /api/orders - 查询订单列表
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // 验证用户ID
    if (!user_id) {
      return NextResponse.json({ success: false, error: '缺少用户ID' }, { status: 400 });
    }

    // 验证 status 参数（如果提供）
    const VALID_STATUSES = ['pending', 'paid', 'cancelled', 'refunded', 'expired'];
    const validatedStatus = status && VALID_STATUSES.includes(status) ? status : undefined;

    // 查询订单列表
    const result = await orderService.getUserOrders(
      parseInt(user_id, 10),
      page,
      pageSize,
      validatedStatus as any
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Orders API] 查询订单失败:', error);
    return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
  }
}
