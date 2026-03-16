import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 管理员角色列表
const ADMIN_ROLES = ['admin', 'super_admin', '管理员', '超级管理员', '系统管理员'];

// 获取用户角色的辅助函数
async function getUserRole(supabase: any, userId: any): Promise<string | null> {
  const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).single();
  if (userRole?.role) return userRole.role;
  const { data: profile } = await supabase.from('profiles').select('metadata').eq('id', userId).single();
  if (profile?.metadata?.role) return profile.metadata.role;
  const { data: user } = await supabase.from('users').select('metadata').eq('id', userId).single();
  if (user?.metadata?.role) return user.metadata.role;
  if (process.env.NODE_ENV === 'development') return '超级管理员';
  return null;
}

/**
 * 权限预览 API（管理员）
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录或用户信息无效' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const role = await getUserRole(supabase, currentUser.id);

    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { level, changes } = body;

    console.log('[PermissionsPreview API] 预览权限变更', { level, changes });

    // 查询该等级下的用户（限制数量）
    const { data: users } = await supabase
      .from('users')
      .select('id, username, points, level')
      .eq('level', level)
      .limit(3);

    // 获取用户总数
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('level', level);

    // 构建示例用户数据
    const sampleUsers = (users || []).map((user: any) => ({
      id: user.id,
      name: user.username,
      before: changes,
      after: changes
    }));

    const preview = {
      affectedUsers: totalUsers || 0,
      sampleUsers,
      changes
    };

    return NextResponse.json({ success: true, preview });
  } catch (error) {
    console.error('[PermissionsPreview API] 预览权限变更异常:', error);
    return NextResponse.json({
      success: true,
      preview: { affectedUsers: 0, sampleUsers: [], changes: {} }
    });
  }
}
