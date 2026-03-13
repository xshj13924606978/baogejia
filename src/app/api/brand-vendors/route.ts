import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 品牌管理API
 *
 * 功能：
 * - GET: 获取所有品牌列表
 * - POST: 创建新品牌
 */

// 初始化Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    db: {
      schema: 'public',
    },
  }
);

/**
 * 获取所有品牌列表
 *
 * 查询参数：
 * - active: boolean - 是否只获取启用的品牌（可选）
 * - level: number - 按付费等级筛选（可选）
 */
export async function GET(request: NextRequest) {
  console.log('[BrandVendors] GET 获取品牌列表');

  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    const level = searchParams.get('level');

    let query = supabase
      .from('brand_vendors')
      .select('*')
      .order('payment_level', { ascending: true })
      .order('display_weight', { ascending: false });

    // 筛选启用的品牌
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    // 按付费等级筛选
    if (level) {
      query = query.eq('payment_level', parseInt(level));
    }

    const { data, error } = await query;

    if (error) {
      console.error('[BrandVendors] 查询失败:', error);
      return NextResponse.json({ error: '查询失败', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ brands: data || [] });
  } catch (error) {
    console.error('[BrandVendors] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 创建新品牌
 *
 * 请求体：
 * - brand_name: string - 品牌名称（必填）
 * - brand_code: string - 品牌代码（可选）
 * - brand_logo: string - 品牌logo URL（可选）
 * - brand_description: string - 品牌描述（可选）
 * - contact_person: string - 联系人（可选）
 * - contact_phone: string - 联系电话（可选）
 * - contact_email: string - 联系邮箱（可选）
 * - payment_level: number - 付费等级（1-5，默认5）
 * - display_weight: number - 展示权重（默认100）
 * - is_featured: boolean - 是否为精选品牌（默认false）
 */
export async function POST(request: NextRequest) {
  console.log('[BrandVendors] POST 创建新品牌');

  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.brand_name) {
      return NextResponse.json({ error: '品牌名称不能为空' }, { status: 400 });
    }

    // 准备插入数据
    const now = new Date().toISOString();
    const insertData = {
      brand_name: body.brand_name,
      brand_code: body.brand_code || null,
      brand_logo: body.brand_logo || null,
      brand_description: body.brand_description || null,
      contact_person: body.contact_person || null,
      contact_phone: body.contact_phone || null,
      contact_email: body.contact_email || null,

      // 付费相关字段
      payment_level: body.payment_level || 5,
      payment_status: body.payment_status || 'inactive',
      total_payment_amount: body.total_payment_amount || 0,
      start_date: body.start_date || null,
      end_date: body.end_date || null,

      // 排序权重
      display_weight: body.display_weight || 100,

      // 状态字段
      is_active: body.is_active !== undefined ? body.is_active : true,
      is_featured: body.is_featured || false,

      // 时间戳
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('brand_vendors')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[BrandVendors] 插入失败:', error);
      return NextResponse.json({ error: '创建失败', details: error.message }, { status: 500 });
    }

    console.log('[BrandVendors] ✅ 品牌创建成功:', data.brand_name);
    return NextResponse.json({
      success: true,
      brand: data,
    });
  } catch (error) {
    console.error('[BrandVendors] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
