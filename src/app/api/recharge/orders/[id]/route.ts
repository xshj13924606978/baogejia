// 积分充值订单状态查询 API

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * GET /api/recharge/orders/[id] - 查询充值订单状态（[id] 为商户订单号 order_no）
 * 仅允许订单所属用户查询。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少订单号' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('recharge_orders')
      .select('order_no, plan_id, points, amount, status, transaction_id, paid_at, created_at, expires_at')
      .eq('order_no', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[RechargeOrder API] 查询订单失败:', error.message);
      return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: '订单不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
        orderNo: data.order_no,
        planId: data.plan_id,
        points: data.points,
        amount: data.amount,
        status: data.status,
        transactionId: data.transaction_id,
        paidAt: data.paid_at,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      },
    });
  } catch (e) {
    console.error('[RechargeOrder API] 查询订单异常:', e);
    return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
  }
}
