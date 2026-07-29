import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';

/**
 * 单规则操作 API
 * 
 * PUT    - 更新规则
 * DELETE - 删除规则
 * 
 * 权限要求: super_admin
 */

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json(
        { error: '仅超级管理员可修改规则' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseServiceClient();

    // 构建更新数据（只包含提供的字段）
    const updateData: Record<string, any> = {
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    };

    // 可更新字段白名单
    const allowedFields = [
      'rule_name', 'rule_description', 'rule_type', 'operation_type',
      'base_points', 'points_formula', 'max_points_per_day', 'max_points_total',
      'conditions', 'user_level_min', 'user_level_max', 'user_roles',
      'effective_from', 'effective_to', 'schedule_cron', 'is_active',
      'is_system_rule', 'priority', 'rule_key', 'rule_config', 'discount_config',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('points_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PointsRulesAPI] 更新规则失败:', error);
      return NextResponse.json(
        { success: false, error: `更新规则失败: ${error.message}` },
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
      message: '规则更新成功',
    });
  } catch (error: any) {
    console.error('[PointsRulesAPI] 更新规则异常:', error);
    return NextResponse.json(
      { success: false, error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json(
        { error: '仅超级管理员可删除规则' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const supabase = getSupabaseServiceClient();

    // 检查是否为系统规则（禁止删除）
    const { data: existingRule } = await supabase
      .from('points_rules')
      .select('id, is_system_rule, rule_name')
      .eq('id', id)
      .single();

    if (!existingRule) {
      return NextResponse.json(
        { success: false, error: '规则不存在' },
        { status: 404 }
      );
    }

    if (existingRule.is_system_rule) {
      return NextResponse.json(
        { success: false, error: `系统规则「${existingRule.rule_name}」不可删除` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('points_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[PointsRulesAPI] 删除规则失败:', error);
      return NextResponse.json(
        { success: false, error: `删除规则失败: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '规则删除成功',
    });
  } catch (error: any) {
    console.error('[PointsRulesAPI] 删除规则异常:', error);
    return NextResponse.json(
      { success: false, error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
