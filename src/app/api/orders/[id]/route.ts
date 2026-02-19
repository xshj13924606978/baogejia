// 订单详情 API 路由 - 查询单个订单详情

import { NextRequest, NextResponse } from 'next/server';
import { orderService } from '@/lib/order-service';

/**
 * GET /api/orders/[id] - 查询订单详情
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
      order,
    });
  } catch (error) {
    console.error('[OrderDetail API] 查询订单详情失败:', error);
    return NextResponse.json(
      { success: false, error: '查询订单详情失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orders/[id] - 取消订单
 */
export async function DELETE(
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

    const order = await orderService.cancelOrder(id);

    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在或无法取消' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[OrderDetail API] 取消订单失败:', error);
    return NextResponse.json(
      { success: false, error: '取消订单失败' },
      { status: 500 }
    );
  }
}
