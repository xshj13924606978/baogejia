/**
 * 权限中间件
 * 用于 API 路由的权限检查
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, AuthDatabaseError } from '@/lib/auth-utils';
import { permissionService } from '@/lib/permission-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 权限检查配置
 */
export interface PermissionConfig {
  permissions?: string | string[]; // 需要的权限（支持多个，OR 关系）
  requireAll?: boolean; // 是否需要所有权限（默认 false，OR 关系）
  minLevel?: number; // 最低等级要求
  minPoints?: number; // 最低积分要求
  roles?: string[]; // 允许的角色列表
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
  userId?: string;
  userRole?: string;
  userPermissions?: string[];
}

/**
 * 检查权限
 */
export async function checkPermission(
  request: NextRequest,
  config: PermissionConfig
): Promise<PermissionCheckResult> {
  try {
    // 1. 获取当前用户
    const user = await getCurrentUser(request);

    if (!user || !user.id) {
      return {
        allowed: false,
        error: '未登录或用户信息无效',
        statusCode: 401,
      };
    }

    // 2. 获取用户角色
    const supabase = getSupabaseClient();

    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      // 区分"角色记录不存在"和"数据库不可用"
      const isDbError = roleError && (
        /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|NXDOMAIN|network|timeout/i.test(
          roleError instanceof Error ? roleError.message : String(roleError)
        )
      );
      return {
        allowed: false,
        error: isDbError ? '服务暂不可用' : '获取用户角色失败',
        statusCode: isDbError ? 503 : 403,
      };
    }

    // 3. 检查角色限制
    if (config.roles && config.roles.length > 0) {
      if (!config.roles.includes(userRole.role)) {
        return {
          allowed: false,
          error: '角色权限不足',
          statusCode: 403,
          userId: user.id,
          userRole: userRole.role,
        };
      }
    }

    // 4. 检查最低等级和积分要求（合并为单次查询）
    if (config.minLevel !== undefined || config.minPoints !== undefined) {
      const fields: string[] = [];
      if (config.minLevel !== undefined) fields.push('level');
      if (config.minPoints !== undefined) fields.push('points');

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(fields.join(','))
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        // 用户数据查询失败，可能是权限条件就是要拒绝的
        if (config.minLevel !== undefined) {
          return {
            allowed: false,
            error: `需要等级 ${config.minLevel} 及以上`,
            statusCode: 403,
            userId: user.id,
            userRole: userRole.role,
          };
        }
      }

      const ud = userData as any;
      if (config.minLevel !== undefined && ud.level < config.minLevel) {
        return {
          allowed: false,
          error: `需要等级 ${config.minLevel} 及以上`,
          statusCode: 403,
          userId: user.id,
          userRole: userRole.role,
        };
      }

      if (config.minPoints !== undefined && ud.points < config.minPoints) {
        return {
          allowed: false,
          error: `需要积分 ${config.minPoints} 及以上`,
          statusCode: 403,
          userId: user.id,
          userRole: userRole.role,
        };
      }
    }

    // 6. 检查权限
    if (config.permissions) {
      const permissions = Array.isArray(config.permissions)
        ? config.permissions
        : [config.permissions];

      if (config.requireAll) {
        // 需要所有权限
        const hasAll = await permissionService.hasAllPermissions(user.id, permissions);

        if (!hasAll) {
          const userPermInfo = await permissionService.getUserPermissions(user.id);
          const userPerms =
            userPermInfo?.permissions.filter((p) => p.granted).map((p) => p.code) || [];

          return {
            allowed: false,
            error: '权限不足',
            statusCode: 403,
            userId: user.id,
            userRole: userRole.role,
            userPermissions: userPerms,
          };
        }
      } else {
        // 只需要任一权限
        const hasAny = await permissionService.hasAnyPermission(user.id, permissions);

        if (!hasAny) {
          const userPermInfo = await permissionService.getUserPermissions(user.id);
          const userPerms =
            userPermInfo?.permissions.filter((p) => p.granted).map((p) => p.code) || [];

          return {
            allowed: false,
            error: '权限不足',
            statusCode: 403,
            userId: user.id,
            userRole: userRole.role,
            userPermissions: userPerms,
          };
        }
      }
    }

    // 所有检查通过
    return {
      allowed: true,
      userId: user.id,
      userRole: userRole.role,
    };
  } catch (error) {
    console.error('[PermissionMiddleware] 权限检查失败:', error);
    return {
      allowed: false,
      error: '权限检查失败',
      statusCode: 500,
    };
  }
}

/**
 * 创建权限检查包装器
 */
export function withPermission(config: PermissionConfig) {
  return function <T extends (...args: any[]) => Promise<NextResponse>>(handler: T): T {
    return (async (request: NextRequest, ...args: any[]) => {
      // 执行权限检查
      const result = await checkPermission(request, config);

      // 如果权限检查失败，返回错误响应
      if (!result.allowed) {
        return NextResponse.json(
          {
            error: result.error || '权限不足',
            userId: result.userId,
            userRole: result.userRole,
            userPermissions: result.userPermissions,
          },
          { status: result.statusCode || 403 }
        );
      }

      // 权限检查通过，执行处理器
      return handler(request, ...args);
    }) as T;
  };
}

/**
 * 需要管理员权限
 */
export function withAdmin<T extends (...args: any[]) => Promise<NextResponse>>(handler: T): T {
  return withPermission({
    roles: ['admin', 'super_admin'],
  })(handler);
}

/**
 * 需要超级管理员权限
 */
export function withSuperAdmin<T extends (...args: any[]) => Promise<NextResponse>>(handler: T): T {
  return withPermission({
    roles: ['super_admin'],
  })(handler);
}

/**
 * 需要特定权限
 */
export function withPermissionCheck(permission: string | string[], requireAll: boolean = false) {
  return function <T extends (...args: any[]) => Promise<NextResponse>>(handler: T): T {
    return withPermission({
      permissions: permission,
      requireAll,
    })(handler);
  };
}
