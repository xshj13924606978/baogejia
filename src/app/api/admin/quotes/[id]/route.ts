import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * GET - 获取报价单详情
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('quotes')
      .select('*, user:users(id, username, full_name, email)')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '报价单不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        quoteNumber: data.quote_number,
        status: data.status,
        subtotal: parseFloat(data.subtotal) || 0,
        taxRate: parseFloat(data.tax_rate) || 0,
        taxAmount: parseFloat(data.tax_amount) || 0,
        discountRate: parseFloat(data.discount_rate) || 0,
        discountAmount: parseFloat(data.discount_amount) || 0,
        totalAmount: parseFloat(data.total_amount) || 0,
        products: data.products || [],
        customerInfo: data.customer_info || {},
        supplierInfo: data.supplier_info || {},
        terms: data.terms || {},
        metadata: data.metadata || {},
        version: data.version,
        issuedAt: data.issued_at,
        validUntil: data.valid_until,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        creatorName: data.user?.full_name || data.user?.username || '',
        creatorEmail: data.user?.email || '',
      },
    });
  } catch (error: any) {
    console.error('[Quote Detail API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取报价单详情失败' }, { status: 500 });
  }
}

/**
 * PUT - 更新报价单（状态、内容等）
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const body = await request.json();
    const db = getSupabaseServiceClient();

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.products !== undefined) updateData.products = body.products;
    if (body.customer_info !== undefined) updateData.customer_info = body.customer_info;
    if (body.terms !== undefined) updateData.terms = body.terms;
    if (body.issued_at !== undefined) updateData.issued_at = body.issued_at;
    if (body.valid_until !== undefined) updateData.valid_until = body.valid_until;

    // 重新计算金额
    if (body.products || body.tax_rate !== undefined || body.shippingFee !== undefined) {
      const { data: currentQuote } = await db.from('quotes').select('*').eq('id', params.id).single();
      const products = body.products || currentQuote?.products || [];
      const subtotal = products.reduce((sum: number, p: any) => sum + (p.quantity * p.unitPrice), 0);
      const taxRate = body.tax_rate !== undefined ? body.tax_rate : parseFloat(currentQuote?.tax_rate) || 13;
      updateData.subtotal = subtotal;
      updateData.tax_rate = taxRate;
      updateData.tax_amount = subtotal * taxRate / 100;
      updateData.total_amount = subtotal + updateData.tax_amount + (body.shippingFee || 0);
    }

    // 版本号递增
    if (body.status || body.products) {
      const { data: current } = await db.from('quotes').select('version').eq('id', params.id).single();
      updateData.version = (current?.version || 1) + 1;
    }

    const { data, error } = await db
      .from('quotes')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[Quote Update API] 更新失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单更新成功', data });
  } catch (error: any) {
    console.error('[Quote Update API] 异常:', error);
    return NextResponse.json({ success: false, error: '更新报价单失败' }, { status: 500 });
  }
}

/**
 * DELETE - 删除报价单
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    const { error } = await db.from('quotes').delete().eq('id', params.id);

    if (error) {
      console.error('[Quote Delete API] 删除失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单已删除' });
  } catch (error: any) {
    console.error('[Quote Delete API] 异常:', error);
    return NextResponse.json({ success: false, error: '删除报价单失败' }, { status: 500 });
  }
}
