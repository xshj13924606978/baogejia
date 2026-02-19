import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 更新产品
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);
    const body = await request.json();

    if (isNaN(id)) {
      return NextResponse.json({
        success: false,
        error: '无效的产品ID',
      }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 映射前端字段到数据库字段
    const updateData = {
      name: body.product_name || body.name,
      model: body.model || '',
      specifications: body.specifications || '',
      price: parseFloat(body.price) || 0,
      stock: parseInt(body.stock || '0') || 0,
      supplier: body.supplier || '',
      category: body.category || '',
      description: body.description || '',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await db
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新产品失败:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '产品更新成功',
      data,
    });
  } catch (error) {
    console.error('更新产品失败:', error);
    return NextResponse.json({
      success: false,
      error: '更新产品失败',
    }, { status: 500 });
  }
}

// 删除产品
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json({
        success: false,
        error: '无效的产品ID',
      }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { error } = await db.from('products').delete().eq('id', id);

    if (error) {
      console.error('删除产品失败:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '产品删除成功',
    });
  } catch (error) {
    console.error('删除产品失败:', error);
    return NextResponse.json({
      success: false,
      error: '删除产品失败',
    }, { status: 500 });
  }
}
