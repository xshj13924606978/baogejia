import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 积分规则 CRUD API（统一路径 /api/admin/points-rules，与页面 /admin/points-rules 对齐）
 *
 * GET  - 获取规则列表（支持搜索、类型筛选、分页）
 * POST - 创建新规则
 *
 * 权限要求: 拥有 admin.manage_points_rules 权限（super_admin 角色）
 */

// GET - 获取规则列表
export async function GET(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const supabase = getSupabaseServiceClient();
    const url = new URL(request.url);

    // 解析查询参数
    const search = url.searchParams.get('search');
    const ruleType = url.searchParams.get('ruleType');
    const isActive = url.searchParams.get('isActive');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const sortBy = url.searchParams.get('sortBy') || 'priority';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';

    // 构建查询
    let query = supabase
      .from('points_rules')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(
        `rule_name.ilike.%${search}%,rule_description.ilike.%${search}%,rule_key.ilike.%${search}%`
      );
    }
    if (ruleType) {
      query = query.eq('rule_type', ruleType);
    }
    if (isActive !== null && isActive !== undefined && isActive !== 'all') {
      query = query.eq('is_active', isActive === 'true');
    }

    // 排序
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // 分页
    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[PointsRulesAPI] 获取规则列表失败:', error);
      return NextResponse.json(
        { success: false, error: '获取规则列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('[PointsRulesAPI] 获取规则列表异常:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}

// POST - 创建新规则
export async function POST(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json(
        { error: '仅超级管理员可创建规则' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 验证必填字段
    if (!body.rule_name) {
      return NextResponse.json(
        { error: '规则名称不能为空' },
        { status: 400 }
      );
    }
    if (!body.rule_type) {
      return NextResponse.json(
        { error: '规则类型不能为空' },
        { status: 400 }
      );
    }
    if (!body.operation_type) {
      return NextResponse.json(
        { error: '操作类型不能为空' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    // 检查 rule_key 唯一性（若提供）
    if (body.rule_key) {
      const { data: existing } = await supabase
        .from('points_rules')
        .select('id')
        .eq('rule_key', body.rule_key)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: `标识符 "${body.rule_key}" 已存在，请使用不同的标识符` },
          { status: 409 }
        );
      }
    }

    // 构建规则数据（与 points_rules 表 schema 对齐）
    const ruleData: Record<string, any> = {
      rule_name: body.rule_name,
      rule_description: body.rule_description || '',
      rule_type: body.rule_type,
      operation_type: body.operation_type || 'task_reward',
      base_points: body.base_points ?? 0,
      points_formula: body.points_formula || 'fixed',
      max_points_per_day: body.max_points_per_day ?? null,
      max_points_total: body.max_points_total ?? null,
      conditions: Array.isArray(body.conditions) ? body.conditions : [],
      user_level_min: body.user_level_min ?? 1,
      user_level_max: body.user_level_max ?? 5,
      user_roles: Array.isArray(body.user_roles) && body.user_roles.length > 0
        ? body.user_roles
        : ['user', 'vip', 'manufacturer', 'admin', 'super_admin'],
      effective_from: body.effective_from || null,
      effective_to: body.effective_to || null,
      schedule_cron: body.schedule_cron || null,
      is_active: body.is_active ?? true,
      is_system_rule: body.is_system_rule ?? false,
      priority: body.priority ?? 0,
      created_by: currentUser.id,
      updated_by: currentUser.id,
      rule_key: body.rule_key || null,
      rule_config: body.rule_config || {},
      discount_config: body.discount_config || {},
    };

    const { data, error } = await supabase
      .from('points_rules')
      .insert(ruleData)
      .select()
      .single();

    if (error) {
      console.error('[PointsRulesAPI] 创建规则失败:', error);
      return NextResponse.json(
        { success: false, error: `创建规则失败: ${safeErrorMessage(error)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: '规则创建成功',
    });
  } catch (error: any) {
    console.error('[PointsRulesAPI] 创建规则异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '服务器错误') },
      { status: 500 }
    );
  }
}
