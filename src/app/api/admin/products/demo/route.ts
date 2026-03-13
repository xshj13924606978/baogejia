import { NextRequest, NextResponse } from 'next/server';
import {
  withProductView,
  withProductEdit,
  withProductExport,
  withLevel,
  withPoints,
  withAllPermissions,
} from '@/lib/permission-check';

/**
 * 产品管理示例 API
 * 演示多种权限检查方式
 */

/**
 * GET - 查看产品列表
 * 使用 withProductView 包装器
 */
export const GET = withProductView(async (request: NextRequest, user: any) => {
  try {
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // 获取产品列表（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: products || [],
      pagination: {
        page,
        limit,
        total: products?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('[Products Demo API] 获取产品列表失败:', error);
    return NextResponse.json(
      { error: '获取产品列表失败', details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST - 创建产品
 * 使用 withLevel 包装器（需要等级 >= 2）
 */
export const POST = withLevel(2, async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { name, price, category } = body;

    // 验证参数
    if (!name || !price) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 创建产品（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('products')
      .insert({
        name,
        price: parseFloat(price),
        category,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '产品创建成功',
      data,
    });
  } catch (error: any) {
    console.error('[Products Demo API] 创建产品失败:', error);
    return NextResponse.json({ error: '创建产品失败', details: error.message }, { status: 500 });
  }
});

/**
 * PUT - 更新产品
 * 使用 withProductEdit 包装器
 */
export const PUT = withProductEdit(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { productId, updates } = body;

    // 验证参数
    if (!productId || !updates) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 更新产品（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('products')
      .update({
        ...updates,
        updated_by: user.id,
      })
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '产品更新成功',
      data,
    });
  } catch (error: any) {
    console.error('[Products Demo API] 更新产品失败:', error);
    return NextResponse.json({ error: '更新产品失败', details: error.message }, { status: 500 });
  }
});

/**
 * DELETE - 删除产品
 * 使用 withPoints 包装器（需要积分 >= 500）
 */
export const DELETE = withPoints(500, async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { productId } = body;

    // 验证参数
    if (!productId) {
      return NextResponse.json({ error: '缺少产品ID' }, { status: 400 });
    }

    // 删除产品（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('products').delete().eq('id', productId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '产品删除成功',
    });
  } catch (error: any) {
    console.error('[Products Demo API] 删除产品失败:', error);
    return NextResponse.json({ error: '删除产品失败', details: error.message }, { status: 500 });
  }
});

/**
 * 批量操作示例
 * 使用 withAllPermissions 包装器（需要所有权限）
 */
export async function PATCH(request: NextRequest) {
  return withAllPermissions(
    ['product.edit', 'product.delete'],
    async (req: NextRequest, user: any) => {
      try {
        const body = await req.json();
        const { productIds, action } = body;

        // 验证参数
        if (!productIds || !action) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }

        // 批量操作（业务逻辑）
        const { getSupabaseClient } = await import('@/storage/database/supabase-client');
        const supabase = getSupabaseClient();

        let result;
        if (action === 'delete') {
          result = await supabase.from('products').delete().in('id', productIds);
        } else if (action === 'update') {
          result = await supabase.from('products').update(body.updates).in('id', productIds);
        }

        return NextResponse.json({
          success: true,
          message: '批量操作成功',
          data: result,
        });
      } catch (error: any) {
        console.error('[Products Demo API] 批量操作失败:', error);
        return NextResponse.json(
          { error: '批量操作失败', details: error.message },
          { status: 500 }
        );
      }
    }
  )(request);
}
