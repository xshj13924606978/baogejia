import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - 获取客户列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    const supabase = getSupabaseClient();

    let query = supabase.from('customers').select('*').order('created_at', { ascending: false });

    // 搜索功能
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,project_name.ilike.%${search}%,contact_person.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data: customers, error } = await query;

    if (error) throw error;

    return NextResponse.json({ customers: customers || [] });
  } catch (error: any) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json({ error: error.message || '获取客户列表失败' }, { status: 500 });
  }
}

// POST - 添加新客户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const supabase = getSupabaseClient();

    // 只插入有值的字段
    const insertData: any = {
      company_name: body.companyName,
    };

    // 可选字段，只有有值时才添加
    if (body.projectName !== undefined && body.projectName !== '') {
      insertData.project_name = body.projectName;
    }
    if (body.contactPerson !== undefined && body.contactPerson !== '') {
      insertData.contact_person = body.contactPerson;
    }
    if (body.phone !== undefined && body.phone !== '') {
      insertData.phone = body.phone;
    }
    if (body.email !== undefined && body.email !== '') {
      insertData.email = body.email;
    }
    if (body.address !== undefined && body.address !== '') {
      insertData.address = body.address;
    }
    if (body.bankName !== undefined && body.bankName !== '') {
      insertData.bank_name = body.bankName;
    }
    if (body.bankAccount !== undefined && body.bankAccount !== '') {
      insertData.bank_account = body.bankAccount;
    }
    if (body.taxNumber !== undefined && body.taxNumber !== '') {
      insertData.tax_number = body.taxNumber;
    }
    if (body.creditLimit !== undefined && body.creditLimit !== null && body.creditLimit !== 0) {
      insertData.credit_limit = body.creditLimit;
    }
    if (body.paymentTerms !== undefined && body.paymentTerms !== '') {
      insertData.payment_terms = body.paymentTerms;
    }
    if (body.notes !== undefined && body.notes !== '') {
      insertData.notes = body.notes;
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error: any) {
    console.error('添加客户失败:', error);
    return NextResponse.json({ error: error.message || '添加客户失败' }, { status: 500 });
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

    const { error } = await supabase.from('customers').delete().eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除客户失败:', error);
    return NextResponse.json({ error: error.message || '删除客户失败' }, { status: 500 });
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

    // 只更新有值的字段
    const updateObj: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.companyName !== undefined && updateData.companyName !== '') {
      updateObj.company_name = updateData.companyName;
    }
    if (updateData.projectName !== undefined && updateData.projectName !== '') {
      updateObj.project_name = updateData.projectName;
    }
    if (updateData.contactPerson !== undefined && updateData.contactPerson !== '') {
      updateObj.contact_person = updateData.contactPerson;
    }
    if (updateData.phone !== undefined && updateData.phone !== '') {
      updateObj.phone = updateData.phone;
    }
    if (updateData.email !== undefined && updateData.email !== '') {
      updateObj.email = updateData.email;
    }
    if (updateData.address !== undefined && updateData.address !== '') {
      updateObj.address = updateData.address;
    }
    if (updateData.bankName !== undefined && updateData.bankName !== '') {
      updateObj.bank_name = updateData.bankName;
    }
    if (updateData.bankAccount !== undefined && updateData.bankAccount !== '') {
      updateObj.bank_account = updateData.bankAccount;
    }
    if (updateData.taxNumber !== undefined && updateData.taxNumber !== '') {
      updateObj.tax_number = updateData.taxNumber;
    }
    if (updateData.creditLimit !== undefined && updateData.creditLimit !== null) {
      updateObj.credit_limit = updateData.creditLimit;
    }
    if (updateData.paymentTerms !== undefined && updateData.paymentTerms !== '') {
      updateObj.payment_terms = updateData.paymentTerms;
    }
    if (updateData.notes !== undefined && updateData.notes !== '') {
      updateObj.notes = updateData.notes;
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer });
  } catch (error: any) {
    console.error('更新客户失败:', error);
    return NextResponse.json({ error: error.message || '更新客户失败' }, { status: 500 });
  }
}
