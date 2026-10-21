import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { generateQuoteNumber } from '@/lib/inject-business-info';
import { pointsService } from '@/lib/points-service';
import { safeErrorMessage } from '@/lib/error-handler';

const STATUS_LIST = ['draft', 'sent', 'approved', 'rejected', 'expired'];

function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * GET - 获取当前用户报价单列表
 * 支持分页、状态筛选、关键词搜索（报价编号/客户名称）
 * 管理员可查看所有报价单；普通用户仅查看自己的
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getSupabaseServiceClient();
    let query = db
      .from('quotes')
      .select('*, user:users(id, username, full_name, email)', { count: 'exact' })
      .is('deleted_at', null);

    // 非管理员只能查看自己的报价单
    if (!isAdminRole(user.role)) {
      query = query.eq('user_id', user.id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (keyword) {
      // 报价编号 或 客户名称（过滤可能破坏 or() 语法的特殊字符）
      const safeKeyword = keyword.replace(/[,()'"\\]/g, '');
      query = query.or(`quote_number.ilike.%${safeKeyword}%,customer_info->>name.ilike.%${safeKeyword}%,customer_info->>customer_name.ilike.%${safeKeyword}%`);
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Quotes API] 查询失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
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
      discountRate: parseFloat(q.discount_rate) || 0,
      discountAmount: parseFloat(q.discount_amount) || 0,
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

    // 统计各状态数量（当前用户可见范围）
    const statsQuery = db.from('quotes').select('status', { count: 'exact', head: false });
    if (!isAdminRole(user.role)) {
      statsQuery.eq('user_id', user.id);
    }
    statsQuery.is('deleted_at', null);
    const { data: allQuotes } = await statsQuery;
    // #202608311000 P2-7：空/未知状态归入 other，不再伪造为 draft
    const statusCounts: Record<string, number> = { total: 0, other: 0 };
    for (const s of STATUS_LIST) statusCounts[s] = 0;
    (allQuotes || []).forEach((q: any) => {
      statusCounts.total += 1;
      const st = q.status;
      if (st && statusCounts[st] !== undefined) statusCounts[st] += 1;
      else statusCounts.other += 1;
    });

    return NextResponse.json({
      success: true,
      data: formattedQuotes,
      total: count || 0,
      page,
      limit,
      statusCounts,
    });
  } catch (error: any) {
    console.error('[Quotes API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取报价单列表失败' }, { status: 500 });
  }
}

/**
 * POST - 创建报价单（归属当前登录用户）
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { products, feeConfig, customerInfo, supplierInfo, terms, validUntil } = body;

    // 自动生成报价编号（QT + 日期 + 随机数）
    const quoteNumber = body.quoteNumber || generateQuoteNumber();
    const referenceId = `generate_quote_${user.id}_${quoteNumber}`;

    // 读取生成报价单所需积分
    const rule = await pointsService.getPointRule('generate_quote');
    const requiredPoints = Math.abs(rule.points);

    // 积分余额预检查
    const hasEnough = await pointsService.checkPointsBalance(user.id, requiredPoints);
    if (!hasEnough) {
      const pointsInfo = await pointsService.getUserPoints(user.id);
      return NextResponse.json(
        {
          success: false,
          error: '积分不足',
          message: `生成报价单需要 ${requiredPoints} 积分，当前余额: ${pointsInfo?.points} 积分`,
          required: requiredPoints,
          balance: pointsInfo?.points,
        },
        { status: 402 }
      );
    }

    const db = getSupabaseServiceClient();
    const subtotal = (products || []).reduce(
      (sum: number, p: any) => sum + ((p.quantity || 0) * (p.unitPrice || 0)),
      0
    );
    const taxRate = feeConfig?.taxRate || 13;
    const taxAmount = subtotal * taxRate / 100;
    const discountRate = feeConfig?.discountRate || 0;
    const discountAmount = subtotal * discountRate / 100;
    const totalAmount = subtotal + taxAmount - discountAmount
      + (feeConfig?.shippingFee || 0)
      + (feeConfig?.installationFee || 0)
      + (feeConfig?.otherFee || 0);

    // 先扣减积分（referenceId 幂等）
    const deductResult = await pointsService.deductPoints(
      user.id,
      requiredPoints,
      'generate_quote',
      `生成报价单 ${quoteNumber}`,
      referenceId
    );

    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: '积分扣减失败: ' + (deductResult.reason || '未知错误') },
        { status: 500 }
      );
    }

    const { data, error } = await db
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        user_id: user.id,
        conversation_id: body.conversationId || null,
        products: products || [],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_rate: discountRate,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        supplier_info: supplierInfo || {},
        customer_info: customerInfo || {},
        terms: terms || {},
        status: 'draft',
        version: 1,
        valid_until: validUntil || null,
      })
      .select()
      .single();

    if (error) {
      // 创建失败时回滚积分
      await pointsService.refundPoints(
        user.id,
        requiredPoints,
        referenceId,
        `生成报价单 ${quoteNumber} 失败退款`
      );
      console.error('[Quotes API] 创建失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单创建成功', data });
  } catch (error: any) {
    console.error('[Quotes API] 创建异常:', error);
    return NextResponse.json({ success: false, error: '创建报价单失败' }, { status: 500 });
  }
}
