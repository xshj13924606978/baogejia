import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * GET - 获取报价单列表
 * 支持分页、状态筛选、搜索
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getSupabaseServiceClient();
    let query = db.from('quotes').select('*, user:users(id, username, full_name, email)', { count: 'exact' });

    // 状态筛选
    if (status) {
      query = query.eq('status', status);
    }

    // 关键词搜索（报价编号）
    if (keyword) {
      query = query.ilike('quote_number', `%${keyword}%`);
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Quotes API] 查询失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 格式化报价单数据
    const formattedQuotes = (data || []).map((q: any) => ({
      id: q.id,
      quoteNumber: q.quote_number,
      status: q.status || 'draft',
      totalAmount: parseFloat(q.total_amount) || 0,
      subtotal: parseFloat(q.subtotal) || 0,
      taxRate: parseFloat(q.tax_rate) || 0,
      taxAmount: parseFloat(q.tax_amount) || 0,
      productCount: Array.isArray(q.products) ? q.products.length : 0,
      customerName: q.customer_info?.name || q.customer_info?.customer_name || '',
      customerPhone: q.customer_info?.phone || q.customer_info?.contact_phone || '',
      creatorName: q.user?.full_name || q.user?.username || q.user?.email || '',
      creatorEmail: q.user?.email || '',
      version: q.version || 1,
      issuedAt: q.issued_at,
      validUntil: q.valid_until,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
    }));

    // 统计各状态数量
    let statusCounts: Record<string, number> = {};
    if (!keyword && !status) {
      const { count: totalCount } = await db.from('quotes').select('*', { count: 'exact', head: true });
      const { count: draftCount } = await db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'draft');
      const { count: sentCount } = await db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'sent');
      const { count: approvedCount } = await db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'approved');
      const { count: rejectedCount } = await db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'rejected');
      statusCounts = {
        total: totalCount || 0,
        draft: draftCount || 0,
        sent: sentCount || 0,
        approved: approvedCount || 0,
        rejected: rejectedCount || 0,
      };
    }

    return NextResponse.json({
      success: true,
      data: formattedQuotes,
      total: count || 0,
      page,
      limit,
      ...(Object.keys(statusCounts).length > 0 && { statusCounts }),
    });
  } catch (error: any) {
    console.error('[Quotes API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取报价单列表失败' }, { status: 500 });
  }
}

/**
 * POST - 创建报价单
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { quoteNumber, products, feeConfig, customerInfo, terms } = body;

    if (!quoteNumber) {
      return NextResponse.json({ success: false, error: '报价编号不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const subtotal = (products || []).reduce((sum: number, p: any) => sum + (p.quantity * p.unitPrice), 0);
    const taxRate = feeConfig?.taxRate || 13;
    const taxAmount = subtotal * taxRate / 100;
    const totalAmount = subtotal + taxAmount + (feeConfig?.shippingFee || 0) + (feeConfig?.installationFee || 0) + (feeConfig?.otherFee || 0);

    const { data, error } = await db
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        products: products || [],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        customer_info: customerInfo || {},
        terms: terms || {},
        status: 'draft',
        version: 1,
      })
      .select()
      .single();

    if (error) {
      console.error('[Quotes API] 创建失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单创建成功', data });
  } catch (error: any) {
    console.error('[Quotes API] 创建异常:', error);
    return NextResponse.json({ success: false, error: '创建报价单失败' }, { status: 500 });
  }
}
