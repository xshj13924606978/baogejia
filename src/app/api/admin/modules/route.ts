import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 模块管理 API（管理员）
 *
 * 功能：
 * - GET: 获取所有模块列表
 */

/**
 * 获取模块列表
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.modules.view'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' }, { status: 401 }
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
      console.error('[Modules API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' }, { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      return NextResponse.json(
        { error: '需要管理员权限' }, { status: 403 }
      );
    }

    console.log('[Modules API] 获取模块列表');

    // 查询模块列表
    const { data: modules, error } = await supabase
      .from('modules')
      .select('*')
      .order('module_code');

    if (error) {
      console.error('[Modules API] 查询模块列表失败:', error);
      return NextResponse.json(
        { error: '查询模块列表失败' }, { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      modules: modules || [],
    });
  } catch (error) {
    console.error('[Modules API] 获取模块列表异常:', error);
    return NextResponse.json(
      { error: '服务器错误' }, { status: 500 }
      );
  }
});