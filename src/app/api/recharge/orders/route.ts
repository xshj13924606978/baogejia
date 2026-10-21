// 积分充值订单 API

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { generateOrderNo } from '@/lib/wechat-payment';
import { getRechargePlanById } from '@/lib/recharge/points';
import { syncOrderFromBusiness } from '@/lib/order-service';

const ORDER_EXPIRE_MINUTES = 30;

/**
 * POST /api/recharge/orders - 创建积分充值订单（状态 pending）
 * body: { planId: string }
 * @returns { success, orderNo, plan: { points, amount }, status }
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const planId = body?.planId;
    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }

    // 校验套餐（环境变量 RECHARGE_PLANS 优先，未配置时走 site_config 动态套餐）
    const plan = await getRechargePlanById(planId);
    if (!plan) {
      return NextResponse.json({ success: false, error: '充值套餐不存在' }, { status: 400 });
    }

    // 校验用户为正式注册账号（UUID）：本地 token 用户（user-<ts>-<rand>）无 DB 记录，
    // add_points_atomic 参数类型为 uuid，非 UUID 无法入账，直接拦截提示
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
      return NextResponse.json(
        { success: false, error: '当前账号不支持在线充值，请使用正式注册账号登录后重试' },
        { status: 400 }
      );
    }

    const orderNo = generateOrderNo('RC');
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('recharge_orders')
      .insert({
        order_no: orderNo,
        user_id: user.id,
        plan_id: plan.id,
        points: plan.points,
        amount: plan.price,
        status: 'pending',
        expires_at: new Date(Date.now() + ORDER_EXPIRE_MINUTES * 60 * 1000).toISOString(),
      })
      .select('order_no, status, points, amount, created_at, expires_at')
      .single();

    if (error) {
      console.error('[RechargeOrders API] 创建订单失败:', error.message);
      return NextResponse.json({ success: false, error: '创建订单失败' }, { status: 500 });
    }

    // 同步到统一订单表（pending）
    await syncOrderFromBusiness(orderNo);

    return NextResponse.json({
      success: true,
      order: data,
    });
  } catch (e) {
    console.error('[RechargeOrders API] 创建订单异常:', e);
    return NextResponse.json({ success: false, error: '创建订单失败' }, { status: 500 });
  }
}

/**
 * GET /api/recharge/orders - 查询当前用户充值订单列表
 * query: status?（pending / completed / cancelled / expired / failed）
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const status = request.nextUrl.searchParams.get('status');
    const VALID_STATUSES = ['pending', 'completed', 'cancelled', 'expired', 'failed'];
    const validStatus = status && VALID_STATUSES.includes(status) ? status : null;

    const db = getSupabaseServiceClient();
    let query = db
      .from('recharge_orders')
      .select('order_no, plan_id, points, amount, status, transaction_id, paid_at, created_at, expires_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (validStatus) {
      query = query.eq('status', validStatus);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[RechargeOrders API] 查询订单失败:', error.message);
      return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, orders: data || [] });
  } catch (e) {
    console.error('[RechargeOrders API] 查询订单异常:', e);
    return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
  }
}
