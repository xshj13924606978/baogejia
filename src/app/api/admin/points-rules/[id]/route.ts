import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 单规则操作 API（统一路径 /api/admin/points-rules/[id]）
 *
 * GET    - 获取单条规则详情
 * PUT    - 更新规则（白名单字段）
 * DELETE - 删除规则（系统规则不可删除）
 *
 * 权限要求: 拥有 admin.manage_points_rules 权限（super_admin 角色）
 */

// GET - 获取单条规则详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { id } = await params;
    const supabase = getSupabaseServiceClient();

    const { data, error } = await supabase
      .from('points_rules')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[PointsRulesAPI] 获取规则详情失败:', error);
      return NextResponse.json(
        { success: false, error: '获取规则详情失败' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '规则不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[PointsRulesAPI] 获取规则详情异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '服务器错误') },
      { status: 500 }
    );
  }
}

// PUT - 更新规则
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

    // 读取现有规则，系统规则不允许修改标识符/类型/系统标记
    const { data: existing } = await supabase
      .from('points_rules')
      .select('id, is_system_rule, rule_key, rule_type')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '规则不存在' },
        { status: 404 }
      );
    }

    if (existing.is_system_rule) {
      delete body.rule_key;
      delete body.rule_type;
      delete body.is_system_rule;
    }

    // 可更新字段白名单（与 points_rules 表 schema 对齐）
    const allowedFields = [
      'rule_name', 'rule_description', 'rule_type', 'operation_type',
      'base_points', 'points_formula', 'max_points_per_day', 'max_points_total',
      'conditions', 'user_level_min', 'user_level_max', 'user_roles',
      'effective_from', 'effective_to', 'schedule_cron', 'is_active',
      'is_system_rule', 'priority', 'rule_key', 'rule_config', 'discount_config',
    ];

    const updateData: Record<string, any> = {
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    };

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
        { success: false, error: `更新规则失败: ${safeErrorMessage(error)}` },
        { status: 500 }
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
      { success: false, error: safeErrorMessage(error, '服务器错误') },
      { status: 500 }
    );
  }
}

// DELETE - 删除规则
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
      .maybeSingle();

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
        { success: false, error: `删除规则失败: ${safeErrorMessage(error)}` },
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
      { success: false, error: safeErrorMessage(error, '服务器错误') },
      { status: 500 }
    );
  }
}
