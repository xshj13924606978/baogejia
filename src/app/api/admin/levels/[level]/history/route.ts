import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取等级权限修改历史API
 *
 * 功能：获取指定等级的权限修改历史记录
 * 权限：仅超级管理员
 */


export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.points.history'] },
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
      console.error('[AdminLevelHistory API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' }, { status: 500 }
      );
    }

    // 检查管理员权限（超级管理员或管理员）
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      return NextResponse.json(
        { error: '无权限，需要管理员权限' }, { status: 403 }
      );
    }

    // 从 URL 中提取 level 参数
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const levelStr = pathParts[pathParts.length - 1];
    const levelNum = parseInt(levelStr);

    console.log('[AdminLevelHistory API] 获取等级权限修改历史:', levelNum);

    // 获取等级权限修改历史
    const history = await userLevelService.getLevelPermissionHistory(levelNum);

    return NextResponse.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('[AdminLevelHistory API] 获取历史失败:', error);
    return NextResponse.json(
      { error: '服务器错误' }, { status: 500 }
      );
  }
});