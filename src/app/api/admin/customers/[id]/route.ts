import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { fetchOwner, fetchCustomerQuotes } from '../utils/customers';

/**
 * 客户管理后台 - 详情 / 更新 / 软删除
 *
 * GET    /api/admin/customers/:id  → 客户详情 + 关联用户 + 关联报价
 * PUT    /api/admin/customers/:id  → 更新客户（含 metadata JSONB 合并）
 * DELETE /api/admin/customers/:id  → 软删除（metadata.deleted_at = now）
 */

type RouteContext = { params: Promise<{ id: string }> };

// 详情：客户 + 归属用户 + 关联报价（customer_info->>name / customer_name 匹配 company_name）
export async function GET(_request: NextRequest, context: RouteContext) {
  const { errorResponse } = await requireAdmin(_request);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  const db = getSupabaseServiceClient();

  try {
    const { data: customer, error } = await db
      .from('customers')
      .select('*')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .single();
    if (error || !customer) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }

    const owner = await fetchOwner(db, customer.metadata?.user_id);
    const quotes = await fetchCustomerQuotes(db, customer.company_name as string | null);

    return NextResponse.json({ success: true, data: { ...customer, owner, quotes } });
  } catch (e) {
    console.error('[Admin Customers] GET :id error:', e);
    return NextResponse.json({ success: false, error: '查询客户详情失败' }, { status: 500 });
  }
}

// 更新客户（metadata 合并更新）
export async function PUT(request: NextRequest, context: RouteContext) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      userId,
      level,
      status,
      region,
      industry,
      tags,
      company_name,
      project_name,
      contact_person,
      phone,
      email,
      address,
      bank_name,
      bank_account,
      tax_number,
      payment_terms,
      credit_limit,
      notes,
    } = body || {};

    const db = getSupabaseServiceClient();

    // 读取现有记录以合并 metadata
    const { data: existing, error: readError } = await db
      .from('customers')
      .select('metadata')
      .eq('id', Number(id))
      .single();
    if (readError || !existing) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }

    const metadata = { ...(existing.metadata || {}) };
    if (userId !== undefined) {
      if (userId) metadata.user_id = userId;
      else delete metadata.user_id;
    }
    if (level !== undefined) {
      if (level) metadata.level = level;
      else delete metadata.level;
    }
    if (status !== undefined) {
      if (status) metadata.status = status;
      else delete metadata.status;
    }
    if (region !== undefined) {
      if (region) metadata.region = region;
      else delete metadata.region;
    }
    if (industry !== undefined) {
      if (industry) metadata.industry = industry;
      else delete metadata.industry;
    }
    if (tags !== undefined) {
      if (Array.isArray(tags) && tags.length) metadata.tags = tags;
      else delete metadata.tags;
    }

    const payload: Record<string, unknown> = { metadata };
    if (company_name !== undefined) payload.company_name = String(company_name).trim() || null;
    if (project_name !== undefined) payload.project_name = project_name ? String(project_name) : null;
    if (contact_person !== undefined) payload.contact_person = contact_person ? String(contact_person) : null;
    if (phone !== undefined) payload.phone = phone ? String(phone) : null;
    if (email !== undefined) payload.email = email ? String(email) : null;
    if (address !== undefined) payload.address = address ? String(address) : null;
    if (bank_name !== undefined) payload.bank_name = bank_name ? String(bank_name) : null;
    if (bank_account !== undefined) payload.bank_account = bank_account ? String(bank_account) : null;
    if (tax_number !== undefined) payload.tax_number = tax_number ? String(tax_number) : null;
    if (payment_terms !== undefined) payload.payment_terms = payment_terms ? String(payment_terms) : null;
    if (credit_limit !== undefined) {
      payload.credit_limit =
        credit_limit !== null && credit_limit !== '' ? Number(credit_limit) : null;
    }
    if (notes !== undefined) payload.notes = notes ? String(notes) : null;

    const { data, error } = await db
      .from('customers')
      .update(payload)
      .eq('id', Number(id))
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[Admin Customers] PUT :id error:', e);
    return NextResponse.json({ success: false, error: '更新客户失败' }, { status: 500 });
  }
}

// 软删除：metadata.deleted_at = now()
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { errorResponse } = await requireAdmin(_request);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  const db = getSupabaseServiceClient();

  try {
    const { data: existing, error: readError } = await db
      .from('customers')
      .select('metadata')
      .eq('id', Number(id))
      .single();
    if (readError || !existing) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }

    const metadata = { ...(existing.metadata || {}) };
    metadata.deleted_at = new Date().toISOString();

    const { data, error } = await db
      .from('customers')
      .update({ metadata })
      .eq('id', Number(id))
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[Admin Customers] DELETE :id error:', e);
    return NextResponse.json({ success: false, error: '删除客户失败' }, { status: 500 });
  }
}
