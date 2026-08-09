import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

function toSupplier(row: any) {
  return {
    id: String(row.id),
    companyName: row.company_name || '',
    contactPerson: row.contact_person || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    bankName: row.bank_name || '',
    bankAccount: row.bank_account || '',
    taxNumber: row.tax_id || '',
    website: row.website || '',
    logo: row.logo || '',
    logoUrl: row.logo_url || '',
    isDefault: !!row.metadata?.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('metadata->>is_default', 'true')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return NextResponse.json({ supplier: toSupplier(data) });

    // 兼容：无默认供应方时取最新一条
    const { data: latest } = await supabase
      .from('suppliers')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) return NextResponse.json({ supplier: toSupplier(latest) });
    return NextResponse.json({ supplier: null });
  } catch (error: any) {
    console.error('获取默认供应方失败:', error);
    return NextResponse.json({ error: error.message || '获取默认供应方失败' }, { status: 500 });
  }
}
