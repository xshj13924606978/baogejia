import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 获取系统默认等级配置API
 *
 * 功能：获取系统默认的等级配置
 * 权限：仅超级管理员和管理员
 */


export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.points.defaults'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    console.log('[Defaults API] 当前用户:', currentUser);

    if (!currentUser || !currentUser.id) {
      console.log('[Defaults API] 用户未登录');
      return NextResponse.json(
        { error: '未登录' }, { status: 401 }
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
      console.error('[Defaults API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' }, { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      console.log('[Defaults API] 权限不足:', userRole.role);
      return NextResponse.json(
        { error: '权限不足' }, { status: 403 }
      );
    }

    console.log('[Defaults API] 获取系统默认配置');

    // 从数据库查询默认配置
    const { data: defaultConfigs, error: configsError } = await supabase
      .from('level_definitions')
      .select('*')
      .order('level');

    if (configsError) {
      console.error('[Defaults API] 查询默认配置失败:', configsError);
      return NextResponse.json(
        { error: '查询默认配置失败' }, { status: 500 }
      );
    }

    if (!defaultConfigs || defaultConfigs.length === 0) {
      console.log('[Defaults API] 未找到默认配置');
      return NextResponse.json([]);
    }

    console.log('[Defaults API] 返回数据库中的默认配置');
    return NextResponse.json(defaultConfigs);
  } catch (error) {
    console.error('[Defaults API] 获取默认配置失败:', error);
    return NextResponse.json(
      { error: '获取失败' }, { status: 500 }
      );
  }
});