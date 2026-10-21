import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { queryCustomerList, fetchUserMap, attachOwners } from './utils/customers';

/**
 * 客户管理后台 - 列表 + 创建
 *
 * GET  /api/admin/customers?search=&userId=&level=&status=&page=&pageSize=&sortBy=&sortOrder=
 * POST /api/admin/customers  { company_name, project_name, contact_person, phone, email, address,
 *                              bank_name, bank_account, tax_number, payment_terms, credit_limit, notes,
 *                              userId, level, status, region, industry, tags }
 */

// 列表查询（分页 / 搜索 / 筛选 / 排序 / 关联用户）
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);

  try {
    const db = getSupabaseServiceClient();
    const { data, total, page, pageSize } = await queryCustomerList(db, {
      search: searchParams.get('search')?.trim() || '',
      userId: searchParams.get('userId')?.trim() || '',
      level: searchParams.get('level')?.trim() || '',
      status: searchParams.get('status')?.trim() || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '10', 10),
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    });

    // 关联用户信息（metadata.user_id → users 表）
    const userIds = Array.from(
      new Set(data.map((c) => c.metadata?.user_id).filter(Boolean) as string[])
    );
    const userMap = await fetchUserMap(db, userIds);

    return NextResponse.json({
      success: true,
      data: attachOwners(data, userMap),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error('[Admin Customers] GET error:', e);
    return NextResponse.json({ success: false, error: '查询客户列表失败' }, { status: 500 });
  }
}

// 创建客户（管理员创建，可指定归属用户）
export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

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

    if (!company_name || !String(company_name).trim()) {
      return NextResponse.json({ success: false, error: '公司名称不能为空' }, { status: 400 });
    }

    const metadata: Record<string, unknown> = {};
    if (userId) metadata.user_id = userId;
    if (level) metadata.level = level;
    if (status) metadata.status = status;
    if (region) metadata.region = region;
    if (industry) metadata.industry = industry;
    if (Array.isArray(tags) && tags.length) metadata.tags = tags;

    const db = getSupabaseServiceClient();
    const payload = {
      company_name: String(company_name).trim(),
      project_name: project_name ? String(project_name) : null,
      contact_person: contact_person ? String(contact_person) : null,
      phone: phone ? String(phone) : null,
      email: email ? String(email) : null,
      address: address ? String(address) : null,
      bank_name: bank_name ? String(bank_name) : null,
      bank_account: bank_account ? String(bank_account) : null,
      tax_number: tax_number ? String(tax_number) : null,
      payment_terms: payment_terms ? String(payment_terms) : null,
      credit_limit:
        credit_limit !== undefined && credit_limit !== null && credit_limit !== ''
          ? Number(credit_limit)
          : null,
      notes: notes ? String(notes) : null,
      metadata,
    };

    const { data, error } = await db.from('customers').insert(payload).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[Admin Customers] POST error:', e);
    return NextResponse.json({ success: false, error: '创建客户失败' }, { status: 500 });
  }
}
