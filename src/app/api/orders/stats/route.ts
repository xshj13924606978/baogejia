// 用户端订单统计 API
// GET /api/orders/stats - 我的订单统计

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { orderService } from '@/lib/order-service';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const stats = await orderService.getUserOrderStats(String(user.id));
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[Orders Stats API] 查询订单统计失败:', error);
    return NextResponse.json({ success: false, error: '查询订单统计失败' }, { status: 500 });
  }
}
