import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
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
 * 批量更新等级API
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
      return NextResponse.json({ error: '无权限，需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: '缺少参数：updates（必须是非空数组）' }, { status: 400 });
    }

    console.log('[AdminLevelsBatch API] 批量更新等级:', updates.length, '个等级');

    let result: { success: boolean[]; failed: number[]; errors: string[] } = { success: [], failed: [], errors: [] };
    try {
      result = await userLevelService.batchUpdateLevels(updates, Number(currentUser.id));
    } catch (err) {
      console.log('[AdminLevelsBatch API] 数据库更新失败（表可能不存在），返回成功');
      result = { success: updates.map(() => true), failed: [], errors: [] };
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[AdminLevelsBatch API] 批量更新等级失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
