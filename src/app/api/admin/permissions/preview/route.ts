import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 权限预览API
 *
 * 功能：预览权限修改对用户的影响
 * 权限：仅超级管理员
 */

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
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
      console.error('[AdminPermissionsPreview API] 获取用户角色失败:', roleError);
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

    // 获取请求体
    const body = await request.json();
    const { level, changes, testUserId } = body;

    if (!level || !changes) {
      return NextResponse.json(
        { error: '缺少必要参数：level 和 changes' },
        { status: 400 }
      );
    }

    console.log('[AdminPermissionsPreview API] 预览权限修改:', { level, testUserId });

    // 预览权限修改效果
    const preview = await userLevelService.previewPermissionChanges(
      level,
      changes,
      testUserId ? Number(testUserId) : undefined
    );

    return NextResponse.json({
      success: true,
      preview
    });
  } catch (error) {
    console.error('[AdminPermissionsPreview API] 权限预览失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
