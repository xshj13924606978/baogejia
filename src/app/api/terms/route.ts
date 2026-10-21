export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export async function GET(_request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('quote_terms')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const terms = (data || []).map((term: any) => ({
      id: term.id,
      name: term.name,
      paymentTerms: term.payment_terms,
      warrantyPeriod: term.warranty_period,
      deliveryPeriod: term.delivery_period,
      validityPeriod: term.validity_period,
      taxRate: term.tax_rate,
      shipping: term.shipping,
      installation: term.installation,
      otherFees: term.other_fees,
      remarks: term.remarks,
      isDefault: term.is_default}));

    return NextResponse.json({ terms });
  } catch (error) {
    console.error('Failed to load terms:', error);
    return NextResponse.json({ error: 'Failed to load terms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const termData = await request.json();

    const now = new Date().toISOString();

    // 如果设置为默认，先取消其他默认
    if (termData.isDefault) {
      await db
        .from('quote_terms')
        .update({ is_default: false })
        .neq('id', termData.id || 0);
    }

    let result;
    // 仅当提供了费用字段时才更新，避免其他调用方（如 info-panel 只传文本字段）误清空费用配置
    const feeFields: any = {};
    if (termData.taxRate !== undefined) feeFields.tax_rate = termData.taxRate;
    if (termData.shipping !== undefined) feeFields.shipping = termData.shipping;
    if (termData.installation !== undefined) feeFields.installation = termData.installation;
    if (termData.otherFees !== undefined) feeFields.other_fees = termData.otherFees;

    if (termData.id) {
      // 更新现有条款
      const { data, error } = await db
        .from('quote_terms')
        .update({
          name: termData.name,
          payment_terms: termData.paymentTerms,
          warranty_period: termData.warrantyPeriod,
          delivery_period: termData.deliveryPeriod,
          validity_period: termData.validityPeriod,
          ...feeFields,
          remarks: termData.remarks,
          is_default: termData.isDefault,
          updated_at: now})
        .eq('id', termData.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // 创建新条款
      const { data, error } = await db
        .from('quote_terms')
        .insert({
          name: termData.name,
          payment_terms: termData.paymentTerms,
          warranty_period: termData.warrantyPeriod,
          delivery_period: termData.deliveryPeriod,
          validity_period: termData.validityPeriod,
          ...feeFields,
          remarks: termData.remarks,
          is_default: termData.isDefault,
          created_at: now,
          updated_at: now})
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    const term = {
      id: result.id,
      name: result.name,
      paymentTerms: result.payment_terms,
      warrantyPeriod: result.warranty_period,
      deliveryPeriod: result.delivery_period,
      validityPeriod: result.validity_period,
      taxRate: result.tax_rate,
      shipping: result.shipping,
      installation: result.installation,
      otherFees: result.other_fees,
      remarks: result.remarks,
      isDefault: result.is_default};

    return NextResponse.json({ term });
  } catch (error) {
    console.error('Failed to save term:', error);
    return NextResponse.json({ error: 'Failed to save term' }, { status: 500 });
  }
}
