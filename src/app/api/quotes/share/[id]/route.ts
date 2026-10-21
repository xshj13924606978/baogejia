import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * GET - 公开分享报价单（无需登录）
 * 仅返回报价单展示所需的公开字段，不包含 user_id / conversation_id / metadata 等敏感信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = getSupabaseServiceClient();
    const { data, error } = (await db
      .from('quotes')
      .select(
        'id, quote_number, products, subtotal, tax_rate, tax_amount, ' +
        'discount_rate, discount_amount, total_amount, supplier_info, ' +
        'customer_info, terms, status, version, valid_until, issued_at, created_at'
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single()) as { data: any; error: any };

    if (error || !data) {
      return NextResponse.json({ success: false, error: '报价单不存在或已删除' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        quoteNumber: data.quote_number,
        status: data.status || 'draft',
        products: data.products || [],
        subtotal: parseFloat(data.subtotal) || 0,
        taxRate: parseFloat(data.tax_rate) || 0,
        taxAmount: parseFloat(data.tax_amount) || 0,
        discountRate: parseFloat(data.discount_rate) || 0,
        discountAmount: parseFloat(data.discount_amount) || 0,
        totalAmount: parseFloat(data.total_amount) || 0,
        supplierInfo: data.supplier_info || {},
        customerInfo: data.customer_info || {},
        terms: data.terms || {},
        version: data.version || 1,
        validUntil: data.valid_until,
        issuedAt: data.issued_at,
        createdAt: data.created_at,
      },
    });
  } catch (error: any) {
    console.error('[Quotes API] 公开分享查询异常:', error);
    return NextResponse.json({ success: false, error: '获取报价单失败' }, { status: 500 });
  }
}
