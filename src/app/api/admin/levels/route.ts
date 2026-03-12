import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取所有等级配置
 * 
 * 功能：获取所有等级（1-5级）的完整配置信息
 * 权限：仅超级管理员
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.points.view'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 });
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[AdminLevels API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    console.log('[AdminLevels API] 获取所有等级配置');

    // 获取所有等级配置（1-5级）
    const levels = [];
    for (let i = 1; i <= 5; i++) {
      const config = await userLevelService.getLevelFullConfig(i);
      if (config) {
        levels.push(config);
      }
    }

    return NextResponse.json({
      success: true,
      levels
    });
  } catch (error) {
    console.error('[AdminLevels API] 获取等级配置失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
});
