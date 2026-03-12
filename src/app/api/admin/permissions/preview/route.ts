import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 权限预览 API（管理员）
 *
 * 功能：
 * - POST: 预览权限变更对用户的影响
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
      console.error('[PermissionsPreview API] 获取用户角色失败:', roleError);
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

    const body = await request.json();
    const { level, changes } = body;

    console.log('[PermissionsPreview API] 预览权限变更', { level, changes });

    // 查询该等级下的所有用户
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, points')
      .eq('level', level);

    if (usersError) {
      console.error('[PermissionsPreview API] 查询用户失败:', usersError);
      return NextResponse.json(
        { error: '查询用户失败' },
        { status: 500 }
      );
    }

    // 构建预览数据
    const preview = {
      level,
      affectedUsers: users?.length || 0,
      changes,
      affectedUsersList: users?.map((user: any) => ({
        id: user.id,
        username: user.username,
        points: user.points,
      })) || [],
    };

    return NextResponse.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error('[PermissionsPreview API] 预览权限变更异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
