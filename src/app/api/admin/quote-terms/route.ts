import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 报价条款管理 API（管理员）
 */

// GET: 获取全部条款列表
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('quote_terms')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[QuoteTerms API] 查询失败:', error.message);
      return NextResponse.json({ success: false, error: '获取条款列表失败' }, { status: 500 });
    }

    const formatted = (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      paymentTerms: item.payment_terms || '',
      warrantyPeriod: item.warranty_period || '',
      deliveryPeriod: item.delivery_period || '',
      validityPeriod: item.validity_period || '',
      remarks: item.remarks || '',
      taxRate: item.tax_rate ?? 13,
      shipping: item.shipping ?? 0,
      installation: item.installation ?? 0,
      otherFees: item.other_fees ?? 0,
      isDefault: item.is_default || false,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[QuoteTerms API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取条款列表失败' }, { status: 500 });
  }
}

// POST: 创建条款
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const db = getSupabaseServiceClient();

    const insertData: Record<string, any> = {
      name: body.name,
      payment_terms: body.paymentTerms || '',
      warranty_period: body.warrantyPeriod || '',
      delivery_period: body.deliveryPeriod || '',
      validity_period: body.validityPeriod || '',
      remarks: body.remarks || '',
      tax_rate: body.taxRate ?? 13,
      shipping: body.shipping ?? 0,
      installation: body.installation ?? 0,
      other_fees: body.otherFees ?? 0,
      is_default: body.isDefault || false,
    };

    // 设置默认条款时，先清除其他默认标记
    if (insertData.is_default) {
      await db.from('quote_terms').update({ is_default: false }).neq('is_default', false);
    }

    const { data, error } = await db
      .from('quote_terms')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[QuoteTerms API] 创建失败:', error.message);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: '条款创建成功' });
  } catch (error: any) {
    console.error('[QuoteTerms API] 异常:', error);
    return NextResponse.json({ success: false, error: '创建条款失败' }, { status: 500 });
  }
}
