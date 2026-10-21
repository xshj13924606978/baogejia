import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** 仅草稿状态允许编辑/删除 */
const EDITABLE_STATUS = 'draft';

/**
 * GET - 获取报价单详情
 * 管理员可查看所有；普通用户仅可查看自己的
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  const { id } = await params;

  try {
    const db = getSupabaseServiceClient();
    let query = db
      .from('quotes')
      .select('*, user:users(id, username, full_name, email)')
      .eq('id', id)
      .is('deleted_at', null);

    if (!isAdminRole(user.role)) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('[Quotes API] 查询失败:', error);
      return NextResponse.json({ success: false, error: '报价单不存在' }, { status: 404 });
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
        conversationId: data.conversation_id,
        metadata: data.metadata,
        creatorName: data.user?.full_name || data.user?.username || data.user?.email || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[Quotes API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取报价单详情失败' }, { status: 500 });
  }
}

/**
 * PUT - 更新报价单（仅草稿状态）
 * 管理员可编辑所有；普通用户仅可编辑自己的
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  const { id } = await params;

  try {
    const db = getSupabaseServiceClient();
    let ownerQuery = db
      .from('quotes')
      .select('id, user_id, status, version, products, tax_rate, discount_rate, customer_info, supplier_info, terms, valid_until, issued_at')
      .eq('id', id)
      .is('deleted_at', null);

    if (!isAdminRole(user.role)) {
      ownerQuery = ownerQuery.eq('user_id', user.id);
    }

    const { data: existing, error: ownerError } = await ownerQuery.single();
    if (ownerError || !existing) {
      return NextResponse.json({ success: false, error: '报价单不存在' }, { status: 404 });
    }

    if (existing.status !== EDITABLE_STATUS) {
      return NextResponse.json(
        { success: false, error: `仅「草稿」状态的报价单可编辑，当前状态不可修改` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { products, feeConfig, customerInfo, supplierInfo, terms, validUntil, status } = body;

    const nextStatus = status || existing.status;
    if (nextStatus !== EDITABLE_STATUS && !['sent', 'approved', 'rejected', 'expired'].includes(nextStatus)) {
      return NextResponse.json({ success: false, error: '无效的报价单状态' }, { status: 400 });
    }

    // 重算金额（未传 products/feeConfig 时沿用现有值，避免误清零）
    const finalProducts = Array.isArray(products) ? products : (existing.products || []);
    const subtotal = finalProducts.reduce(
      (sum: number, p: any) => sum + ((p.quantity || 0) * (p.unitPrice || 0)),
      0
    );
    const taxRate = feeConfig?.taxRate ?? (Number(existing.tax_rate) || 0);
    const taxAmount = subtotal * taxRate / 100;
    const discountRate = feeConfig?.discountRate ?? (Number(existing.discount_rate) || 0);
    const discountAmount = subtotal * discountRate / 100;
    const totalAmount = subtotal + taxAmount - discountAmount
      + (feeConfig?.shippingFee || 0)
      + (feeConfig?.installationFee || 0)
      + (feeConfig?.otherFee || 0);

    const updatePayload: Record<string, any> = {
      products: finalProducts,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_rate: discountRate,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      customer_info: customerInfo ?? existing.customer_info,
      supplier_info: supplierInfo ?? existing.supplier_info,
      terms: terms ?? existing.terms,
      valid_until: validUntil ?? existing.valid_until,
      status: nextStatus,
      version: (existing.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    // 发送时记录发送时间
    if (nextStatus === 'sent' && !existing.issued_at) {
      updatePayload.issued_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from('quotes')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Quotes API] 更新失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单更新成功', data });
  } catch (error: any) {
    console.error('[Quotes API] 更新异常:', error);
    return NextResponse.json({ success: false, error: '更新报价单失败' }, { status: 500 });
  }
}

/**
 * DELETE - 软删除报价单（仅草稿状态）
 * 管理员可删除所有；普通用户仅可删除自己的
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  const { id } = await params;

  try {
    const db = getSupabaseServiceClient();
    let ownerQuery = db
      .from('quotes')
      .select('id, user_id, status')
      .eq('id', id)
      .is('deleted_at', null);

    if (!isAdminRole(user.role)) {
      ownerQuery = ownerQuery.eq('user_id', user.id);
    }

    const { data: existing, error: ownerError } = await ownerQuery.single();
    if (ownerError || !existing) {
      return NextResponse.json({ success: false, error: '报价单不存在' }, { status: 404 });
    }

    if (existing.status !== EDITABLE_STATUS) {
      return NextResponse.json(
        { success: false, error: `仅「草稿」状态的报价单可删除` },
        { status: 400 }
      );
    }

    const { error } = await db
      .from('quotes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[Quotes API] 删除失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '报价单已删除' });
  } catch (error: any) {
    console.error('[Quotes API] 删除异常:', error);
    return NextResponse.json({ success: false, error: '删除报价单失败' }, { status: 500 });
  }
}
