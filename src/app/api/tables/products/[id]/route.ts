import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 更新产品
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);
    const body = await request.json();

    if (isNaN(id)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的产品ID',
        },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 映射前端字段到数据库字段（统一产品字段规范）
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // 13个标准字段
    if (body.category !== undefined) updateData.category = body.category;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.parameter_description !== undefined) updateData.parameter_description = body.parameter_description;
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.supplier !== undefined) updateData.supplier = body.supplier;
    if (body.contact_person !== undefined) updateData.contact_person = body.contact_person;
    if (body.contact_phone !== undefined) updateData.contact_phone = body.contact_phone;
    if (body.cost_price !== undefined) updateData.cost_price = parseFloat(body.cost_price) || 0;
    if (body.min_price !== undefined) updateData.min_price = parseFloat(body.min_price) || 0;
    if (body.price !== undefined) updateData.price = parseFloat(body.price) || 0;
    if (body.image_url !== undefined) updateData.image_url = body.image_url;
    // 系统字段
    if (body.stock !== undefined) updateData.stock = parseInt(body.stock) || 0;

    const { data, error } = await db
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '产品更新成功',
      data,
    });
  } catch (error) {
    console.error('更新产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '更新产品失败',
      },
      { status: 500 }
    );
  }
}

// 删除产品
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的产品ID',
        },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    const { error } = await db.from('products').delete().eq('id', id);

    if (error) {
      console.error('删除产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '产品删除成功',
    });
  } catch (error) {
    console.error('删除产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '删除产品失败',
      },
      { status: 500 }
    );
  }
}
