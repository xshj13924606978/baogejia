import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 品牌付费记录API
 * 
 * 功能：
 * - GET: 获取所有付费记录
 * - POST: 创建新付费记录
 */

// 初始化Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    db: {
      schema: 'public'
    }
  }
);

/**
 * 获取所有付费记录
 * 
 * 查询参数：
 * - brand_id: string - 按品牌ID筛选（可选）
 * - status: string - 按支付状态筛选（可选）
 */
export async function GET(request: NextRequest) {
  console.log('[PaymentRecords] GET 获取付费记录列表');

  try {
    const searchParams = request.nextUrl.searchParams;
    const brandId = searchParams.get('brand_id');
    const status = searchParams.get('status');

    let query = supabase
      .from('brand_payment_records')
      .select('*, brand_vendors(brand_name, brand_code)')
      .order('created_at', { ascending: false });

    // 按品牌ID筛选
    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    // 按支付状态筛选
    if (status) {
      query = query.eq('payment_status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[PaymentRecords] 查询失败:', error);
      return NextResponse.json(
        { error: '查询失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ records: data || [] });
  } catch (error) {
    console.error('[PaymentRecords] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 创建新付费记录
 * 
 * 请求体：
 * - brand_id: string - 品牌ID（必填）
 * - payment_amount: number - 付费金额（必填）
 * - payment_type: string - 付费类型（可选）
 * - payment_level: number - 付费等级（可选）
 * - payment_period_start: string - 付费周期开始（可选）
 * - payment_period_end: string - 付费周期结束（可选）
 * - payment_method: string - 支付方式（可选）
 * - transaction_id: string - 交易流水号（可选）
 * - notes: string - 备注信息（可选）
 * - receipt_url: string - 支付凭证URL（可选）
 */
export async function POST(request: NextRequest) {
  console.log('[PaymentRecords] POST 创建新付费记录');

  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.brand_id || !body.payment_amount) {
      return NextResponse.json(
        { error: '品牌ID和付费金额不能为空' },
        { status: 400 }
      );
    }

    // 准备插入数据
    const now = new Date().toISOString();
    const insertData = {
      brand_id: body.brand_id,
      payment_amount: body.payment_amount,
      payment_type: body.payment_type || null,
      payment_level: body.payment_level || null,
      payment_period_start: body.payment_period_start || null,
      payment_period_end: body.payment_period_end || null,

      // 支付信息
      payment_method: body.payment_method || null,
      transaction_id: body.transaction_id || null,
      payment_status: body.payment_status || 'pending',

      // 备注信息
      notes: body.notes || null,
      receipt_url: body.receipt_url || null,

      // 时间戳
      created_at: now,
      updated_at: now,
      paid_at: body.paid_at || null
    };

    const { data, error } = await supabase
      .from('brand_payment_records')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[PaymentRecords] 插入失败:', error);
      return NextResponse.json(
        { error: '创建失败', details: error.message },
        { status: 500 }
      );
    }

    console.log('[PaymentRecords] ✅ 付费记录创建成功');
    return NextResponse.json({
      success: true,
      record: data
    });
  } catch (error) {
    console.error('[PaymentRecords] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
