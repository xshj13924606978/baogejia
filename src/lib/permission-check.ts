/**
 * 权限检查工具函数
 * 提供统一的权限检查接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { permissionService } from './permission-service';
import { getCurrentUser } from './auth-utils';

export interface PermissionCheckOptions {
  permissions?: string | string[];      // 需要的权限
  requireAll?: boolean;                  // 是否需要所有权限（默认 true）
  minLevel?: number;                     // 最低等级要求
  minPoints?: number;                    // 最低积分要求
  roles?: string[];                      // 允许的角色列表
  requiresAuth?: boolean;                // 是否需要认证（默认 true）
}

export interface PermissionCheckResult {
  allowed: boolean;
  user?: any;
  missingPermissions?: string[];
  reason?: string;
  status?: number;
}

/**
 * 统一的权限检查函数
 */
export async function checkPermission(
  request: NextRequest,
  options: PermissionCheckOptions
): Promise<PermissionCheckResult> {
  try {
    // 1. 获取当前用户
    const user = await getCurrentUser(request);
    if (!user) {
      return {
        allowed: false,
        reason: '未登录',
        status: 401
      };
    }

    // 获取用户完整信息（包括角色、等级、积分）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    // 获取用户角色
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      return {
        allowed: false,
        reason: '获取用户角色失败',
        status: 500
      };
    }

    // 获取用户等级和积分
    const { data: userInfo, error: infoError } = await supabase
      .from('users')
      .select('level, points')
      .eq('id', user.id)
      .single();

    if (infoError || !userInfo) {
      return {
        allowed: false,
        reason: '获取用户信息失败',
        status: 500
      };
    }

    // 构建完整用户信息
    const fullUser = {
      ...user,
      role: userRole.role,
      level: userInfo.level || 1,
      currentPoints: userInfo.points || 0
    };

    // 2. 角色检查
    if (options.roles && options.roles.length > 0) {
      if (!options.roles.includes(fullUser.role)) {
        return {
          allowed: false,
          user: fullUser,
          reason: `需要角色: ${options.roles.join('、')}`,
          status: 403
        };
      }
    }

    // 3. 等级检查
    if (options.minLevel !== undefined) {
      if (fullUser.level < options.minLevel) {
        return {
          allowed: false,
          user: fullUser,
          reason: `需要等级 ≥ ${options.minLevel}`,
          status: 403
        };
      }
    }

    // 4. 积分检查
    if (options.minPoints !== undefined) {
      if (fullUser.currentPoints < options.minPoints) {
        return {
          allowed: false,
          user: fullUser,
          reason: `需要积分 ≥ ${options.minPoints}`,
          status: 403
        };
      }
    }

    // 5. 权限检查
    if (options.permissions) {
      const perms = Array.isArray(options.permissions) 
        ? options.permissions 
        : [options.permissions];
      
      if (perms.length > 0) {
        if (options.requireAll !== false) {
          // 需要所有权限
          const missing: string[] = [];
          for (const perm of perms) {
            const has = await permissionService.hasPermission(fullUser.id, perm);
            if (!has) missing.push(perm);
          }
          
          if (missing.length > 0) {
            return {
              allowed: false,
              user: fullUser,
              missingPermissions: missing,
              reason: `缺少权限: ${missing.join('、')}`,
              status: 403
            };
          }
        } else {
          // 只需要任一权限
          let hasAny = false;
          for (const perm of perms) {
            const has = await permissionService.hasPermission(fullUser.id, perm);
            if (has) {
              hasAny = true;
              break;
            }
          }
          
          if (!hasAny) {
            return {
              allowed: false,
              user: fullUser,
              missingPermissions: perms,
              reason: `需要任一权限: ${perms.join('、')}`,
              status: 403
            };
          }
        }
      }
    }

    // 全部通过
    return {
      allowed: true,
      user: fullUser
    };
  } catch (error) {
    console.error('[PermissionCheck] 权限检查失败:', error);
    return {
      allowed: false,
      reason: '权限检查失败',
      status: 500
    };
  }
}

/**
 * 创建权限检查包装器（用于API路由）
 */
export function withPermissionCheck<T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  options: PermissionCheckOptions,
  handler: T
): T {
  return (async (request: NextRequest) => {
    const result = await checkPermission(request, options);
    
    if (!result.allowed) {
      return NextResponse.json(
        {
          error: result.reason || '权限不足',
          missingPermissions: result.missingPermissions,
          status: result.status
        },
        { status: result.status || 403 }
      );
    }
    
    return handler(request, result.user);
  }) as T;
}

/**
 * 简化版的权限包装器（常用权限）
 */
export const withUserView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'user.view' }, handler);

export const withUserCreate = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'user.create' }, handler);

export const withUserEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'user.edit' }, handler);

export const withUserDelete = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'user.delete' }, handler);

export const withProductView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'product.view' }, handler);

export const withProductEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'product.edit' }, handler);

export const withProductExport = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'product.export' }, handler);

export const withQuoteCreate = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'quote.create' }, handler);

export const withQuoteView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'quote.view' }, handler);

export const withQuoteEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'quote.edit' }, handler);

export const withQuoteExport = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ permissions: 'quote.export' }, handler);

export const withAdmin = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ roles: ['super_admin', 'admin'] }, handler);

export const withSuperAdmin = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
) => withPermissionCheck({ roles: ['super_admin'] }, handler);

export const withLevel = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  level: number,
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ minLevel: level }, handler) as any;
};

export const withPoints = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  points: number,
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ minPoints: points }, handler) as any;
};

/**
 * 多权限检查（OR关系）
 */
export const withAnyPermission = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  permissions: string[],
  handler: T
) => withPermissionCheck({ permissions, requireAll: false }, handler);

/**
 * 多权限检查（AND关系）
 */
export const withAllPermissions = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  permissions: string[],
  handler: T
) => withPermissionCheck({ permissions, requireAll: true }, handler);
