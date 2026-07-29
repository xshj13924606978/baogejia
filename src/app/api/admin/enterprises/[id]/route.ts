import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('enterprises')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '企业不存在' }, { status: 404 });
    }

    // 获取关联的管理员信息
    let adminName = null;
    if (data.user_id) {
      const { data: user } = await db
        .from('users')
        .select('full_name, username, email')
        .eq('id', data.user_id)
        .single();
      if (user) {
        adminName = user.full_name || user.username || user.email;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        adminName,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const db = getSupabaseServiceClient();
    const body = await request.json();

    const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
    const allowed = ['name', 'credit_code', 'legal_person', 'contact_person', 'contact_phone', 'email', 'address', 'industry', 'scale', 'description', 'logo_url', 'status', 'user_id', 'metadata'];
    for (const key of allowed) {
      if (body[key] !== undefined) updateFields[key] = body[key];
    }

    const { data, error } = await db
      .from('enterprises')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '更新失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data, message: '更新成功' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const db = getSupabaseServiceClient();

    const { error } = await db.from('enterprises').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
