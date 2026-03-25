import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 报价条款详情/更新/删除 API（管理员）
 */

// PUT: 更新条款
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = await request.json();
    const db = getSupabaseServiceClient();

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.paymentTerms !== undefined) updateData.payment_terms = body.paymentTerms;
    if (body.warrantyPeriod !== undefined) updateData.warranty_period = body.warrantyPeriod;
    if (body.deliveryPeriod !== undefined) updateData.delivery_period = body.deliveryPeriod;
    if (body.validityPeriod !== undefined) updateData.validity_period = body.validityPeriod;
    if (body.remarks !== undefined) updateData.remarks = body.remarks;
    if (body.taxRate !== undefined) updateData.tax_rate = body.taxRate;
    if (body.shipping !== undefined) updateData.shipping = body.shipping;
    if (body.installation !== undefined) updateData.installation = body.installation;
    if (body.otherFees !== undefined) updateData.other_fees = body.otherFees;
    if (body.isDefault !== undefined) updateData.is_default = body.isDefault;

    // 设置默认条款时，先清除其他默认标记
    if (body.isDefault) {
      await db.from('quote_terms').update({ is_default: false }).neq('is_default', false);
    }

    const { data, error } = await db
      .from('quote_terms')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[QuoteTerms Detail API] 更新失败:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: '条款更新成功' });
  } catch (error: any) {
    console.error('[QuoteTerms Detail API] 异常:', error);
    return NextResponse.json({ success: false, error: '更新条款失败' }, { status: 500 });
  }
}

// DELETE: 删除条款
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    // 检查是否为默认条款
    const { data: term } = await db
      .from('quote_terms')
      .select('is_default')
      .eq('id', params.id)
      .single();

    if (!term) {
      return NextResponse.json({ success: false, error: '条款不存在' }, { status: 404 });
    }

    if (term.is_default) {
      return NextResponse.json({ success: false, error: '不能删除默认条款，请先设置其他条款为默认' }, { status: 400 });
    }

    const { error } = await db.from('quote_terms').delete().eq('id', params.id);

    if (error) {
      console.error('[QuoteTerms Detail API] 删除失败:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '条款已删除' });
  } catch (error: any) {
    console.error('[QuoteTerms Detail API] 异常:', error);
    return NextResponse.json({ success: false, error: '删除条款失败' }, { status: 500 });
  }
}
