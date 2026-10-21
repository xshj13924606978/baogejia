// 会员订单状态查询 API（用户端，轮询支付结果）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { orderNo } = await params;
    if (!orderNo || !orderNo.startsWith('MB')) {
      return NextResponse.json({ success: false, error: '订单号无效' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data: order, error } = await db
      .from('user_memberships')
      .select('id, order_no, plan_id, status, start_date, end_date, created_at')
      .eq('order_no', orderNo)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[MembershipOrder API] 查询订单失败:', error.message);
      return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ success: false, error: '订单不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('[MembershipOrder API] 查询订单异常:', error);
    return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
  }
}
