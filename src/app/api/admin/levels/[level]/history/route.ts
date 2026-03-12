import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取等级权限修改历史API
 *
 * 功能：获取指定等级的权限修改历史记录
 * 权限：仅超级管理员
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
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
      console.error('[AdminLevelHistory API] 获取用户角色失败:', roleError);
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

    // 获取参数
    const { level } = await params;
    const levelNum = parseInt(level);

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
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
