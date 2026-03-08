import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - 获取客户列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    const supabase = getSupabaseClient();

    let query = supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    // 搜索功能
    if (search) {
      query = query.or(`company_name.ilike.%${search}%,project_name.ilike.%${search}%,contact_person.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: customers, error } = await query;

    if (error) throw error;

    return NextResponse.json({ customers: customers || [] });
  } catch (error: any) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json(
      { error: error.message || '获取客户列表失败' },
      { status: 500 }
    );
  }
}

// POST - 添加新客户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const supabase = getSupabaseClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        company_name: body.companyName,
        project_name: body.projectName,
        contact_person: body.contactPerson,
        phone: body.phone,
        email: body.email,
        address: body.address,
        bank_name: body.bankName,
        bank_account: body.bankAccount,
        tax_number: body.taxNumber,
        credit_limit: body.creditLimit,
        payment_terms: body.paymentTerms,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error: any) {
    console.error('添加客户失败:', error);
    return NextResponse.json(
      { error: error.message || '添加客户失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除客户
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除客户失败:', error);
    return NextResponse.json(
      { error: error.message || '删除客户失败' },
      { status: 500 }
    );
  }
}

// PUT - 更新客户
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .update({
        company_name: updateData.companyName,
        project_name: updateData.projectName,
        contact_person: updateData.contactPerson,
        phone: updateData.phone,
        email: updateData.email,
        address: updateData.address,
        bank_name: updateData.bankName,
        bank_account: updateData.bankAccount,
        tax_number: updateData.taxNumber,
        credit_limit: updateData.creditLimit,
        payment_terms: updateData.paymentTerms,
        notes: updateData.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer });
  } catch (error: any) {
    console.error('更新客户失败:', error);
    return NextResponse.json(
      { error: error.message || '更新客户失败' },
      { status: 500 }
    );
  }
}
