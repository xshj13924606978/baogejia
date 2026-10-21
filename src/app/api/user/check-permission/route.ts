import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { permissionService } from '@/lib/permission-service';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 权限检查 API
 * POST /api/user/check-permission
 *
 * 请求体:
 * {
 *   permissions?: string | string[],
 *   requireAll?: boolean,
 *   roles?: string[],
 *   minLevel?: number,
 *   minPoints?: number
 * }
 */

interface PermissionCheckBody {
  permissions?: string | string[];
  requireAll?: boolean;
  roles?: string[];
  minLevel?: number;
  minPoints?: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user || !user.id) {
      return NextResponse.json({ allowed: false, reason: '未登录' });
    }

    const body: PermissionCheckBody = await request.json();
    const supabase = getSupabaseServiceClient();

    // 获取用户角色
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const role = userRole?.role || 'user';

    // 获取用户等级和积分
    const { data: userInfo } = await supabase
      .from('users')
      .select('level, points')
      .eq('id', user.id)
      .single();

    const userLevel = userInfo?.level || 1;
    const userPoints = userInfo?.points || 0;

    // 角色检查
    if (body.roles && body.roles.length > 0) {
      if (!body.roles.includes(role)) {
        return NextResponse.json({
          allowed: false,
          reason: `需要角色: ${body.roles.join('、')}`,
          userRole: role,
          userLevel,
          userPoints,
        });
      }
    }

    // 等级检查
    if (body.minLevel !== undefined && userLevel < body.minLevel) {
      return NextResponse.json({
        allowed: false,
        reason: `需要等级 ≥ ${body.minLevel}`,
        userRole: role,
        userLevel,
        userPoints,
      });
    }

    // 积分检查
    if (body.minPoints !== undefined && userPoints < body.minPoints) {
      return NextResponse.json({
        allowed: false,
        reason: `需要积分 ≥ ${body.minPoints}`,
        userRole: role,
        userLevel,
        userPoints,
      });
    }

    // 权限检查
    if (body.permissions) {
      const permissions = Array.isArray(body.permissions) ? body.permissions : [body.permissions];
      const requireAll = body.requireAll !== false;

      if (permissions.length > 0) {
        const missingPermissions: string[] = [];

        if (requireAll) {
          for (const perm of permissions) {
            const has = await permissionService.hasPermission(user.id, perm);
            if (!has) missingPermissions.push(perm);
          }
          if (missingPermissions.length > 0) {
            return NextResponse.json({
              allowed: false,
              reason: `缺少权限: ${missingPermissions.join('、')}`,
              missingPermissions,
              userRole: role,
              userLevel,
              userPoints,
            });
          }
        } else {
          let hasAny = false;
          for (const perm of permissions) {
            if (await permissionService.hasPermission(user.id, perm)) {
              hasAny = true;
              break;
            }
          }
          if (!hasAny) {
            return NextResponse.json({
              allowed: false,
              reason: `需要任一权限: ${permissions.join('、')}`,
              missingPermissions: permissions,
              userRole: role,
              userLevel,
              userPoints,
            });
          }
        }
      }
    }

    return NextResponse.json({ allowed: true, userRole: role, userLevel, userPoints });
  } catch (error) {
    console.error('[CheckPermission API] 错误:', error);
    return NextResponse.json({ allowed: false, reason: '权限检查失败' }, { status: 500 });
  }
}
