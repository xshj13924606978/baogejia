import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 创建单条产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: '产品名称不能为空' },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 映射字段（统一产品字段规范）
    const productData: Record<string, any> = {
      name: body.name,
      updated_at: new Date().toISOString(),
    };

    // 可选的13个标准字段
    const optionalFields = [
      'category', 'model', 'parameter_description', 'brand', 'unit',
      'supplier', 'contact_person', 'contact_phone', 'cost_price',
      'min_price', 'price', 'image_url', 'stock',
    ];
    for (const field of optionalFields) {
      if (body[field] !== undefined) {
        productData[field] = body[field];
      }
    }

    const { data, error } = await db
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      console.error('创建产品失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '产品创建成功',
      data,
    });
  } catch (error) {
    console.error('创建产品失败:', error);
    return NextResponse.json(
      { success: false, error: '创建产品失败' },
      { status: 500 }
    );
  }
}
