import { NextRequest, NextResponse } from 'next/server';
import {
  withQuoteCreate,
  withQuoteView,
  withQuoteEdit,
  withQuoteExport,
  withAnyPermission} from '@/lib/permission-check';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 报价管理示例 API
 * 演示报价相关的权限检查
 */

/**
 * GET - 查看报价列表
 * 使用 withQuoteView 包装器
 */
export const GET = withQuoteView(async (request: NextRequest, _context: any) => {
  try {
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');

    // 获取报价列表（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    let query = supabase.from('quotes').select('*').order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: quotes, error } = await query.range((page - 1) * 20, page * 20 - 1);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: quotes || [],
      pagination: {
        page,
        total: quotes?.length || 0}});
  } catch (error: any) {
    console.error('[Quotes Demo API] 获取报价列表失败:', error);
    return NextResponse.json(
      { error: '获取报价列表失败' },
      { status: 500 }
    );
  }
});

/**
 * POST - 创建报价
 * 使用 withQuoteCreate 包装器
 */
export const POST = withQuoteCreate(async (request: NextRequest, _context: any) => {
  try {
    const body = await request.json();
    const { productName, quantity, customerName } = body;

    // 验证参数
    if (!productName || !quantity || !customerName) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 获取当前用户
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    // 创建报价（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('quotes')
      .insert({
        product_name: productName,
        quantity,
        customer_name: customerName,
        status: 'pending',
        created_by: user.id})
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '报价创建成功',
      data});
  } catch (error: any) {
    console.error('[Quotes Demo API] 创建报价失败:', error);
    return NextResponse.json({ error: '创建报价失败' }, { status: 500 });
  }
});

/**
 * PUT - 更新报价
 * 使用 withQuoteEdit 包装器
 */
export const PUT = withQuoteEdit(async (request: NextRequest, _context: any) => {
  try {
    const body = await request.json();
    const { quoteId, updates } = body;

    // 验证参数
    if (!quoteId || !updates) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 获取当前用户
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    // 更新报价（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('quotes')
      .update({
        ...updates,
        updated_by: user.id,
        updated_at: new Date().toISOString()})
      .eq('id', quoteId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '报价更新成功',
      data});
  } catch (error: any) {
    console.error('[Quotes Demo API] 更新报价失败:', error);
    return NextResponse.json({ error: '更新报价失败' }, { status: 500 });
  }
});

/**
 * DELETE - 删除报价
 * 使用 withAnyPermission 包装器（需要 quote.edit 或 quote.delete 任一权限）
 */
export const DELETE = withAnyPermission(
  ['quote.edit', 'quote.delete'],
  async (request: NextRequest, _context: any) => {
    try {
      const body = await request.json();
      const { quoteId } = body;

      // 验证参数
      if (!quoteId) {
        return NextResponse.json({ error: '缺少报价ID' }, { status: 400 });
      }

      // 删除报价（业务逻辑）
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const supabase = getSupabaseClient();

      const { error } = await supabase.from('quotes').delete().eq('id', quoteId);

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: '报价删除成功'});
    } catch (error: any) {
      console.error('[Quotes Demo API] 删除报价失败:', error);
      return NextResponse.json({ error: '删除报价失败' }, { status: 500 });
    }
  }
);

/**
 * 导出报价
 * 使用 withQuoteExport 包装器
 */
export async function OPTIONS(request: NextRequest) {
  return withQuoteExport(async (_req_reqreq: NextRequest, _context: any) => {
    return NextResponse.json({
      success: true,
      message: '导出报价功能可用'});
  })(request);
}

/**
 * 导出报价 - 实际导出操作
 */
export async function PATCH(request: NextRequest) {
  return withQuoteExport(async (req: NextRequest, _context: any) => {
    try {
      const body = await req.json();
      const { quoteIds, format } = body;

      // 验证参数
      if (!quoteIds || !format) {
        return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
      }

      // 导出报价（业务逻辑）
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const supabase = getSupabaseClient();

      const { data: quotes, error } = await supabase.from('quotes').select('*').in('id', quoteIds);

      if (error) {
        throw error;
      }

      // 这里应该实现实际的导出逻辑（Excel、PDF等）
      return NextResponse.json({
        success: true,
        message: '报价导出成功',
        data: {
          format,
          count: quotes?.length || 0,
          quotes: quotes || []}});
    } catch (error: any) {
      console.error('[Quotes Demo API] 导出报价失败:', error);
      return NextResponse.json({ error: '导出报价失败' }, { status: 500 });
    }
  })(request);
}
