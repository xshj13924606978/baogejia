import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 购买等级API
 * 
 * 功能：
 * - POST: 购买等级权限（直接付费）
 */

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { level, amount, paymentMethod, days } = body;

    if (!level || !amount || !paymentMethod) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (level < 1 || level > 5) {
      return NextResponse.json(
        { error: '等级必须在1-5之间' },
        { status: 400 }
      );
    }


    const supabase = getSupabaseClient();

    // 创建支付记录（模拟支付成功）
    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    const { data: paymentData, error: paymentError } = await supabase
      .from('payment_records')
      .insert({
        user_id: parseInt(currentUser.id),
        order_no: orderNo,
        amount: amount,
        payment_method: paymentMethod,
        payment_status: 'success',
        level_upgraded_to: level,
        level_expiry_date: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null,
        plan_days: days,
        paid_at: new Date()
      })
      .select()
      .single();

    if (paymentError || !paymentData) {
      console.error('[LevelPurchase API] 创建支付记录失败:', paymentError);
      return NextResponse.json(
        { error: '创建支付记录失败' },
        { status: 500 }
      );
    }

    // 购买等级
    const result = await tokenBillingService.purchaseLevel(
      parseInt(currentUser.id),
      level,
      amount,
      paymentMethod,
      days
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        orderNo,
        paymentId: paymentData.id
      },
      message: result.message
    });
  } catch (error) {
    console.error('[LevelPurchase API] 购买等级异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
