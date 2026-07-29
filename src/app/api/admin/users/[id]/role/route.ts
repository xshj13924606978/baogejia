import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * POST - 修改用户角色
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const { role } = await request.json();

    if (!role) {
      return NextResponse.json({ success: false, error: '请指定角色' }, { status: 400 });
    }

    const validRoles = ['super_admin', 'admin', 'enterprise_admin', 'manufacturer', 'vip', 'premium', 'free', 'pending'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, error: '无效的角色值' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[User Role API] 修改角色失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `角色已更新为 ${role}`,
      data: { id: data.id, role: data.role },
    });
  } catch (error: any) {
    console.error('[User Role API] 异常:', error);
    return NextResponse.json({ success: false, error: '修改角色失败' }, { status: 500 });
  }
}
