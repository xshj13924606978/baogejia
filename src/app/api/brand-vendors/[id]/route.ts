import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 单个品牌管理API
 * 
 * 功能：
 * - GET: 获取单个品牌详情
 * - PUT: 更新品牌信息
 * - DELETE: 删除品牌
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
 * 获取单个品牌详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('[BrandVendors] GET 获取品牌详情:', id);

  try {
    const { data, error } = await supabase
      .from('brand_vendors')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('[BrandVendors] 查询失败:', error);
      return NextResponse.json(
        { error: '品牌不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ brand: data });
  } catch (error) {
    console.error('[BrandVendors] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 更新品牌信息
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[BrandVendors] PUT 更新品牌信息:', params.id);

  try {
    const body = await request.json();

    // 准备更新数据
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // 只更新提供的字段
    const allowedFields = [
      'brand_name', 'brand_code', 'brand_logo', 'brand_description',
      'contact_person', 'contact_phone', 'contact_email',
      'payment_level', 'payment_status', 'total_payment_amount',
      'start_date', 'end_date', 'display_weight', 'is_active', 'is_featured'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    const { data, error } = await supabase
      .from('brand_vendors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[BrandVendors] 更新失败:', error);
      return NextResponse.json(
        { error: '更新失败', details: error.message },
        { status: 500 }
      );
    }

    console.log('[BrandVendors] ✅ 品牌更新成功:', data.brand_name);
    return NextResponse.json({
      success: true,
      brand: data
    });
  } catch (error) {
    console.error('[BrandVendors] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 删除品牌
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[BrandVendors] DELETE 删除品牌:', params.id);

  try {
    const { error } = await supabase
      .from('brand_vendors')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[BrandVendors] 删除失败:', error);
      return NextResponse.json(
        { error: '删除失败', details: error.message },
        { status: 500 }
      );
    }

    console.log('[BrandVendors] ✅ 品牌删除成功');
    return NextResponse.json({
      success: true,
      message: '品牌删除成功'
    });
  } catch (error) {
    console.error('[BrandVendors] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
