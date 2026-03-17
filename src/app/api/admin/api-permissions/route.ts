import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * API权限管理API
 *
 * 功能：
 * - GET: 获取所有API权限配置 (需要 admin.permissions.view 权限)
 * - POST: 创建API权限规则 (需要 admin.permissions.edit 权限)
 * - PUT: 更新API权限规则 (需要 admin.permissions.edit 权限)
 * - DELETE: 删除API权限规则 (需要 admin.permissions.edit 权限)
 */

/**
 * 获取所有API权限配置
 */
export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.permissions.view' },
  async (_request: NextRequest, _user: any) => {
    try {
      console.log('[AdminApiPermissions API] 获取所有API权限配置');

      const supabase = getSupabaseClient();
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
  }
);

/**
 * 创建API权限规则
 */
export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.permissions.edit' },
  async (request: NextRequest, _user: any) => {
    try {
      const body = await request.json();
      const { api_path, method, module_code, min_level, min_points, is_public, description } = body;

      if (!api_path || !method) {
        return NextResponse.json({ error: '缺少必要参数：api_path 和 method' }, { status: 400 });
      }

      console.log('[AdminApiPermissions API] 创建API权限规则:', api_path, method);

      const supabase = getSupabaseClient();
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
  }
);

/**
 * 更新API权限规则
 */
export const PUT = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.permissions.edit' },
  async (request: NextRequest, _user: any) => {
    try {
      const body = await request.json();
      const { id, api_path, method, module_code, min_level, min_points, is_public, description } = body;

      if (!id) {
        return NextResponse.json({ error: '缺少参数：id' }, { status: 400 });
      }

      console.log('[AdminApiPermissions API] 更新API权限规则:', id);

      const supabase = getSupabaseClient();
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
  }
);

/**
 * 删除API权限规则
 */
export const DELETE = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.permissions.edit' },
  async (request: NextRequest, _user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json({ error: '缺少参数：id' }, { status: 400 });
      }

      console.log('[AdminApiPermissions API] 删除API权限规则:', id);

      const supabase = getSupabaseClient();
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
