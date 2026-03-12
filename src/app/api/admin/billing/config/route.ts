import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { tokenBillingService } from '@/lib/token-billing-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 计费配置管理API（管理员）
 *
 * 功能：
 * - GET: 获取当前计费配置
 * - POST: 更新计费配置
 */

/**
 * 获取当前计费配置
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.billing.view'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 });
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[BillingConfig API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      return NextResponse.json(
        { error: '需要管理员权限' },
        { status: 403 }
      );
    }

    console.log('[BillingConfig API] 获取计费配置');

    // 获取计费配置
    const config = await tokenBillingService.getBillingConfig();

    if (!config) {
      return NextResponse.json(
        { error: '获取计费配置失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[BillingConfig API] 获取计费配置异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }

/**
 * 更新计费配置
 */

export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.access'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[BillingConfig API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '需要超级管理员权限' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      configName,
      yuanToTokens,
      yuanToPoints,
      pointsToTokens,
      level1InputRate,
      level1OutputRate,
      level2InputRate,
      level2OutputRate,
      level3InputRate,
      level3OutputRate,
      level4InputRate,
      level4OutputRate,
      level5InputRate,
      level5OutputRate
    } = body;

    // 验证必填字段
    if (!yuanToTokens || !yuanToPoints || !pointsToTokens) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    console.log('[BillingConfig API] 更新计费配置:', {
      configName,
      yuanToTokens,
      yuanToPoints,
      pointsToTokens
    });

    // 更新计费配置
    const success = await tokenBillingService.updateBillingConfig({
      yuanToTokens,
      yuanToPoints,
      pointsToTokens,
      level1InputRate,
      level1OutputRate,
      level2InputRate,
      level2OutputRate,
      level3InputRate,
      level3OutputRate,
      level4InputRate,
      level4OutputRate,
      level5InputRate,
      level5OutputRate
    });

    if (!success) {
      return NextResponse.json(
        { error: '更新配置失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '配置更新成功'
    });
  } catch (error) {
    console.error('[BillingConfig API] 更新计费配置异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
