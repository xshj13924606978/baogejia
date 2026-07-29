import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';

/**
 * 激活/禁用规则 API
 * 
 * POST - 切换规则的 is_active 状态
 * 
 * 权限要求: super_admin
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json(
        { error: '需要管理员权限' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseServiceClient();

    const newActiveState = body.isActive ?? true;

    const { data, error } = await supabase
      .from('points_rules')
      .update({
        is_active: newActiveState,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, rule_name, is_active')
      .single();

    if (error) {
      console.error('[PointsRulesAPI] 切换规则状态失败:', error);
      return NextResponse.json(
        { success: false, error: '切换规则状态失败' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '规则不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: newActiveState
        ? `规则「${data.rule_name}」已启用`
        : `规则「${data.rule_name}」已禁用`,
    });
  } catch (error: any) {
    console.error('[PointsRulesAPI] 切换规则状态异常:', error);
    return NextResponse.json(
      { success: false, error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
