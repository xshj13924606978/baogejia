import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * API权限管理API
 *
 * 功能：
 * - GET: 获取所有API权限配置
 * - POST: 创建API权限规则
 * - PUT: 更新API权限规则
 * - DELETE: 删除API权限规则
 * 权限：仅超级管理员
 */

/**
 * 获取所有API权限配置
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.permissions.view'] },
  async (request: NextRequest, _user: any) => {
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser(request);
      if (!currentUser || !currentUser.id) {
        return NextResponse.json({ error: '未登录或用户信息无效' }, { status: 401 });
      }

      // 查询用户角色
      const supabase = getSupabaseClient();
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (roleError || !userRole) {
        console.error('[AdminApiPermissions API] 获取用户角色失败:', roleError);
        return NextResponse.json({ error: '获取用户角色失败' }, { status: 500 });
      }

      // 检查超级管理员权限
      if (userRole.role !== 'super_admin') {
        return NextResponse.json({ error: '无权限，需要超级管理员权限' }, { status: 403 });
      }

      console.log('[AdminApiPermissions API] 获取所有API权限配置');

      // 获取所有API权限
      const { data: permissions, error } = await supabase
        .from('api_permissions')
        .select('*')
        .order('api_path', { ascending: true });

      if (error) {
        console.error('[AdminApiPermissions API] 获取API权限失败:', error);
        throw error;
      }

      return NextResponse.json({
        success: true,
        permissions,
      });
    } catch (error) {
      console.error('[AdminApiPermissions API] 获取API权限失败:', error);
      return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }

    /**
     * 创建API权限规则
     */
  }
);

export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.access'] },
  async (request: NextRequest, _user: any) => {
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser(request);
      if (!currentUser || !currentUser.id) {
        return NextResponse.json({ error: '未登录或用户信息无效' }, { status: 401 });
      }

      // 查询用户角色
      const supabase = getSupabaseClient();
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (roleError || !userRole) {
        console.error('[AdminApiPermissions API] 获取用户角色失败:', roleError);
        return NextResponse.json({ error: '获取用户角色失败' }, { status: 500 });
      }

      // 检查超级管理员权限
      if (userRole.role !== 'super_admin') {
        return NextResponse.json({ error: '无权限，需要超级管理员权限' }, { status: 403 });
      }

      // 获取请求体
      const body = await request.json();
      const { api_path, method, module_code, min_level, min_points, is_public, description } = body;

      if (!api_path || !method) {
        return NextResponse.json({ error: '缺少必要参数：api_path 和 method' }, { status: 400 });
      }

      console.log('[AdminApiPermissions API] 创建API权限规则:', api_path, method);

      // 创建API权限规则
      const { data, error } = await supabase
        .from('api_permissions')
        .insert([
          {
            api_path,
            method: method.toUpperCase(),
            module_code,
            min_level: min_level || 1,
            min_points: min_points || 0,
            is_public: is_public || false,
            description,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('[AdminApiPermissions API] 创建API权限失败:', error);
        throw error;
      }

      return NextResponse.json({
        success: true,
        permission: data,
      });
    } catch (error) {
      console.error('[AdminApiPermissions API] 创建API权限失败:', error);
      return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }

    /**
     * 更新API权限规则
     */
  }
);

export const PUT = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.access'] },
  async (request: NextRequest, _user: any) => {
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser(request);
      if (!currentUser || !currentUser.id) {
        return NextResponse.json({ error: '未登录或用户信息无效' }, { status: 401 });
      }

      // 查询用户角色
      const supabase = getSupabaseClient();
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (roleError || !userRole) {
        console.error('[AdminApiPermissions API] 获取用户角色失败:', roleError);
        return NextResponse.json({ error: '获取用户角色失败' }, { status: 500 });
      }

      // 检查超级管理员权限
      if (userRole.role !== 'super_admin') {
        return NextResponse.json({ error: '无权限，需要超级管理员权限' }, { status: 403 });
      }

      // 获取请求体
      const body = await request.json();
      const { id, api_path, method, module_code, min_level, min_points, is_public, description } =
        body;

      if (!id) {
        return NextResponse.json({ error: '缺少参数：id' }, { status: 400 });
      }

      console.log('[AdminApiPermissions API] 更新API权限规则:', id);

      // 更新API权限规则
      const { data, error } = await supabase
        .from('api_permissions')
        .update({
          api_path,
          method: method ? method.toUpperCase() : undefined,
          module_code,
          min_level,
          min_points,
          is_public,
          description,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[AdminApiPermissions API] 更新API权限失败:', error);
        throw error;
      }

      return NextResponse.json({
        success: true,
        permission: data,
      });
    } catch (error) {
      console.error('[AdminApiPermissions API] 更新API权限失败:', error);
      return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }

    /**
     * 删除API权限规则
     */
  }
);

export const DELETE = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.access'] },
  async (request: NextRequest, _user: any) => {
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser(request);
      if (!currentUser || !currentUser.id) {
        return NextResponse.json({ error: '未登录或用户信息无效' }, { status: 401 });
      }

      // 查询用户角色
      const supabase = getSupabaseClient();
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (roleError || !userRole) {
        console.error('[AdminApiPermissions API] 获取用户角色失败:', roleError);
        return NextResponse.json({ error: '获取用户角色失败' }, { status: 500 });
      }

      // 检查超级管理员权限
      if (userRole.role !== 'super_admin') {
        return NextResponse.json({ error: '无权限，需要超级管理员权限' }, { status: 403 });
      }

      // 获取查询参数
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json({ error: '缺少参数：id' }, { status: 400 });
      }

      console.log('[AdminApiPermissions API] 删除API权限规则:', id);

      // 删除API权限规则
      const { error } = await supabase.from('api_permissions').delete().eq('id', id);

      if (error) {
        console.error('[AdminApiPermissions API] 删除API权限失败:', error);
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: 'API权限规则删除成功',
      });
    } catch (error) {
      console.error('[AdminApiPermissions API] 删除API权限失败:', error);
      return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }
  }
);
