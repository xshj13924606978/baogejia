import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');
    const offset = (page - 1) * limit;

    let query = db.from('enterprises').select('*', { count: 'exact' });

    if (status && status !== 'all') query = query.eq('status', status);
    if (keyword) query = query.or(`name.ilike.%${keyword}%,credit_code.ilike.%${keyword}%`);

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [], total: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, error: '企业名称不能为空' }, { status: 400 });
    }

    const { data, error } = await db
      .from('enterprises')
      .insert({
        name: body.name.trim(),
        credit_code: body.credit_code?.trim() || null,
        legal_person: body.legal_person?.trim() || null,
        contact_person: body.contact_person?.trim() || null,
        contact_phone: body.contact_phone?.trim() || null,
        email: body.email?.trim() || null,
        address: body.address?.trim() || null,
        industry: body.industry?.trim() || null,
        scale: body.scale?.trim() || null,
        description: body.description?.trim() || null,
        logo_url: body.logo_url?.trim() || null,
        user_id: body.user_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data, message: '创建成功' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
