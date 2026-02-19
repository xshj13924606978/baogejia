import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 排名价格配置
const RANK_PRICES = {
  1: 999,
  2: 599,
  3: 599,
  4: 299,
  5: 299
};

// 购买排名
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, rank_position, category, keywords } = body;

    if (!user_id || !rank_position || rank_position < 1 || rank_position > 5) {
      return NextResponse.json(
        { error: '参数错误' },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 检查用户是否为厂家角色
    const { data: user, error: userError } = await db
      .from('users')
      .select('role, company, verified')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    if (user.role !== '厂家') {
      return NextResponse.json(
        { error: '只有厂家可以购买排名' },
        { status: 403 }
      );
    }

    if (!user.verified) {
      return NextResponse.json(
        { error: '请先完成厂家认证' },
        { status: 403 }
      );
    }

    // 检查该位置是否已被占用
    const today = new Date().toISOString().split('T')[0];
    const { data: existingPayment, error: checkError } = await db
      .from('manufacturer_payments')
      .select('*')
      .eq('rank_position', rank_position)
      .eq('status', 'active')
      .gte('end_date', today)
      .maybeSingle();

    if (existingPayment) {
      return NextResponse.json(
        { error: `第${rank_position}名已被占用` },
        { status: 409 }
      );
    }

    // 计算费用和起止日期
    const monthly_fee = RANK_PRICES[rank_position as keyof typeof RANK_PRICES];
    const start_date = new Date();
    const end_date = new Date(start_date);
    end_date.setMonth(end_date.getMonth() + 1);

    // 创建付费记录
    const { data: payment, error: paymentError } = await db
      .from('manufacturer_payments')
      .insert({
        user_id,
        rank_position,
        monthly_fee,
        start_date: start_date.toISOString().split('T')[0],
        end_date: end_date.toISOString().split('T')[0],
        status: 'active',
        category,
        keywords
      })
      .select()
      .single();

    if (paymentError || !payment) {
      console.error('[Manufacturer] 创建付费记录失败:', paymentError);
      return NextResponse.json(
        { error: '购买失败' },
        { status: 500 }
      );
    }

    // 更新用户的产品排名加成
    await db
      .from('products')
      .update({ rank_boost: rank_position })
      .eq('manufacturer_id', user_id);

    return NextResponse.json({
      success: true,
      payment,
      message: `成功购买第${rank_position}名推荐位，有效期至${end_date.toISOString().split('T')[0]}`
    });
  } catch (error) {
    console.error('[Manufacturer] 请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// 获取厂家排名列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');

    const db = getSupabaseClient();

    const today = new Date().toISOString().split('T')[0];

    let query = db
      .from('manufacturer_payments')
      .select(`
        *,
        users:user_id (
          id,
          username,
          company,
          contact
        )
      `)
      .eq('status', 'active')
      .gte('end_date', today)
      .order('rank_position', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error('[Manufacturer] 查询失败:', error);
      return NextResponse.json(
        { error: '查询失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rankings: payments || []
    });
  } catch (error) {
    console.error('[Manufacturer] 请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
