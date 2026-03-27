/**
 * 用户权限查询接口（供前端 usePermission Hook 调用）
 * GET /api/user/permissions
 * 返回当前登录用户的完整权限配置
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserPermissions, getUserRoleAndLevel } from '@/lib/permission/permission-service';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// 从请求中获取用户信息（兼容 session/cookie/header）
async function getUserFromRequest(request: NextRequest): Promise<{ id: string; role: string; level: number } | null> {
  try {
    const db = getSupabaseServiceClient();

    // 尝试从 Authorization header 获取 token
    const authHeader = request.headers.get('authorization');
    let userId = request.headers.get('x-user-id');

    if (!userId && authHeader?.startsWith('Bearer ')) {
      // 通过 token 查找用户
      const token = authHeader.slice(7);
      const { data } = await db.from('users').select('id').eq('id', token).single();
      if (data) userId = data.id;
    }

    if (!userId) return null;

    const { role, level } = await getUserRoleAndLevel(userId);
    return { id: userId, role, level };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getUserFromRequest(request);
    if (!userInfo) {
      return NextResponse.json({ success: true, data: { modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} } });
    }

    const perms = await getUserPermissions(userInfo.id, userInfo.role, userInfo.level);
    return NextResponse.json({ success: true, data: perms });
  } catch (error) {
    console.error('[UserPermissionsAPI] 失败:', error);
    // 降级返回全部允许
    return NextResponse.json({ success: true, data: { modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} } });
  }
}
