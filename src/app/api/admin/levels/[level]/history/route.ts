import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAuth } from '@/lib/auth-utils';
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
 * 获取等级权限修改历史API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseClient();
    const role = await getUserRole(supabase, currentUser.id);

    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: '无权限，需要管理员权限' }, { status: 403 });
    }

    const { level } = await params;
    const levelNum = parseInt(level);


    let history: any[] = [];
    try {
      history = await userLevelService.getLevelPermissionHistory(levelNum);
    } catch (err) {
      history = [];
    }

    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error('[AdminLevelHistory API] 获取历史失败:', error);
    return NextResponse.json({ success: true, history: [] });
  }
}
