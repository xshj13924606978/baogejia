import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { safeErrorMessage } from '@/lib/error-handler';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const getServiceSupabase = () => createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getUserId(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from('suppliers')
      .select('id,company_name,address,contact_person,phone,email,tax_number,bank_name,bank_account,logo_url,logo,website,tax_id')
      .eq('metadata->>user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[BusinessProfile] GET error:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    if (!data) return NextResponse.json({ success: true, data: null });

    return NextResponse.json({ success: true, data: {
      id: data.id, companyName: data.company_name, companyAddress: data.address,
      contactPerson: data.contact_person, phone: data.phone, email: data.email,
      // ✅ #[20260827-1807-3] 修复：suppliers 表统一社会信用代码字段是 tax_id（非 tax_number），
      //   原代码只读 data.tax_number → 前端拿到的 taxNumber 永远是 undefined → 报价单底部"统一社会信用代码"不同步
      taxNumber: data.tax_number || data.tax_id || '', bankName: data.bank_name, bankAccount: data.bank_account,
      logoUrl: data.logo_url, logo: data.logo, website: data.website, taxId: data.tax_id,
    }});
  } catch (error: any) {
    console.error('[BusinessProfile] GET exception:', error);
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const sb = getServiceSupabase();

    const profileData = {
      company_name: body.companyName,
      address: body.companyAddress,
      contact_person: body.contactPerson,
      phone: body.phone, email: body.email,
      tax_number: body.taxNumber, bank_name: body.bankName, bank_account: body.bankAccount,
      logo_url: body.logoUrl, logo: body.logo, website: body.website, tax_id: body.taxId,
      metadata: { user_id: userId },
      updated_at: new Date().toISOString(),
    };

    // 查找已有记录
    const { data: existing } = await sb
      .from('suppliers')
      .select('id')
      .eq('metadata->>user_id', userId)
      .single();

    let result;
    if (existing) {
      result = await sb.from('suppliers').update(profileData).eq('id', existing.id).select().single();
    } else {
      result = await sb.from('suppliers').insert({ ...profileData, company_name: profileData.company_name || '未设置' }).select().single();
    }

    if (result.error) {
      console.error('[BusinessProfile] POST error:', result.error);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error('[BusinessProfile] POST exception:', error);
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
