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
      remarks: result.remarks,
      isDefault: result.is_default};

    return NextResponse.json({ term });
  } catch (error) {
    console.error('Failed to save term:', error);
    return NextResponse.json({ error: 'Failed to save term' }, { status: 500 });
  }
}
