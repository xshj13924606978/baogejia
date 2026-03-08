import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    const { data, error } = await db
      .from('customers')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const customers = data.map((customer: any) => ({
      id: customer.id,
      companyName: customer.company_name,
      projectName: customer.project_name,
      contactPerson: customer.contact_person,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    }));

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('Failed to load customers:', error);
    return NextResponse.json(
      { error: 'Failed to load customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();
    const customerData = await request.json();

    const now = new Date().toISOString();

    const { data, error } = await db
      .from('customers')
      .insert({
        company_name: customerData.companyName,
        project_name: customerData.projectName,
        contact_person: customerData.contactPerson,
        phone: customerData.phone,
        email: customerData.email,
        address: customerData.address,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const customer = {
      id: data.id,
      companyName: data.company_name,
      projectName: data.project_name,
      contactPerson: data.contact_person,
      phone: data.phone,
      email: data.email,
      address: data.address,
    };

    return NextResponse.json({ customer });
  } catch (error) {
    console.error('Failed to save customer:', error);
    return NextResponse.json(
      { error: 'Failed to save customer' },
      { status: 500 }
    );
  }
}

/**
 * 删除客户
 */
export async function DELETE(request: NextRequest) {
  try {
    const db = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('id');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    const { error } = await db
      .from('customers')
      .delete()
      .eq('id', customerId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete customer:', error);
    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    );
  }
}
