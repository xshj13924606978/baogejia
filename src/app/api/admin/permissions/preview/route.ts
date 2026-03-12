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

    // 查询该等级下的所有用户（限制数量）
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, points')
      .eq('level', level)
      .limit(5); // 只返回前5个用户作为示例

    if (usersError) {
      console.error('[PermissionsPreview API] 查询用户失败:', usersError);
      return NextResponse.json(
        { error: '查询用户失败' },
        { status: 500 }
      );
    }

    // 获取当前等级的完整配置（用于显示"修改前"）
    const { data: levelConfig, error: configError } = await supabase
      .from('level_configs')
      .select('*')
      .eq('level', level)
      .single();

    if (configError) {
      console.error('[PermissionsPreview API] 查询等级配置失败:', configError);
      return NextResponse.json(
        { error: '查询等级配置失败' },
        { status: 500 }
      );
    }

    // 获取该等级下的所有用户总数
    const { count: totalUsers, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('level', level);

    if (countError) {
      console.error('[PermissionsPreview API] 统计用户数失败:', countError);
      return NextResponse.json(
        { error: '统计用户数失败' },
        { status: 500 }
      );
    }

    // 构建示例用户数据
    const sampleUsers = users?.map((user: any) => ({
      id: user.id,
      name: user.username,
      before: {
        fieldPermissions: levelConfig?.field_permissions || {},
        modulePermissions: levelConfig?.module_permissions || [],
        quotas: levelConfig?.quotas || {},
      },
      after: changes,
    })) || [];

    // 构建预览数据（匹配前端期望的格式）
    const preview = {
      affectedUsers: totalUsers || 0,
      sampleUsers,
      changes,
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
