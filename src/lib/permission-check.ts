/**
 * 权限检查工具函数
 * 提供统一的权限检查接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { permissionService } from './permission-service';
import { getCurrentUser } from './auth-utils';

export interface PermissionCheckOptions {
  permissions?: string | string[]; // 需要的权限
  requireAll?: boolean; // 是否需要所有权限（默认 true）
  minLevel?: number; // 最低等级要求
  minPoints?: number; // 最低积分要求
  roles?: string[]; // 允许的角色列表
  requiresAuth?: boolean; // 是否需要认证（默认 true）
}

export interface PermissionCheckResult {
  allowed: boolean;
  user?: any;
  missingPermissions?: string[];
  reason?: string;
  status?: number;
}

// 管理员角色列表
const ADMIN_ROLES = ['admin', 'super_admin', '管理员', '超级管理员', '系统管理员'];

// 角色名称映射（中文 -> 英文）
const ROLE_NAME_MAP: Record<string, string> = {
  '超级管理员': 'super_admin',
  '系统管理员': 'admin',
  '管理员': 'admin',
  '企业管理员': 'enterprise_admin',
  'VIP会员': 'vip',
  '付费会员': 'premium',
  '免费用户': 'free',
  '待审核': 'pending',
};

/**
 * 标准化角色名称（将中文角色名映射为英文）
 */
function normalizeRole(role: string): string {
  return ROLE_NAME_MAP[role] || role;
}

/**
 * 从多个来源获取用户角色
 */
async function getUserRole(supabase: any, userId: any): Promise<string | null> {
  // 方法1：尝试从 user_roles 表获取
  const { data: userRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  
  if (!roleError && userRole?.role) {
    return userRole.role;
  }
  
  // 方法2：尝试从 profiles 表获取
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('metadata')
    .eq('id', userId)
    .single();
  
  if (!profileError && profile?.metadata?.role) {
    return profile.metadata.role;
  }
  
  // 方法3：尝试从 users 表获取
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  
  if (!userError && user?.metadata?.role) {
    return user.metadata.role;
  }
  
  // 方法4：开发环境默认给予管理员权限
  if (process.env.NODE_ENV === 'development') {
    return '超级管理员';
  }
  
  return null;
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
        status: 401,
      };
    }

    // 获取用户完整信息（包括角色、等级、积分）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    // 获取用户角色（从多个来源）
    const role = await getUserRole(supabase, user.id);

    // 获取用户等级和积分
    const { data: userInfo, error: infoError } = await supabase
      .from('users')
      .select('level, points, metadata')
      .eq('id', user.id)
      .single();

    // 如果 users 表也查不到，使用默认值
    const level = userInfo?.level || userInfo?.metadata?.level || 1;
    const points = userInfo?.points || userInfo?.metadata?.points || 0;

    // 构建完整用户信息
    const fullUser = {
      ...user,
      role: role || 'user',
      level: level,
      currentPoints: points,
    };

    // 2. 角色检查
    if (options.roles && options.roles.length > 0) {
      // 标准化角色名称，支持中英文角色名匹配
      const normalizedUserRole = normalizeRole(fullUser.role);
      const normalizedAllowedRoles = options.roles.map(r => normalizeRole(r));

      if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
        return {
          allowed: false,
          user: fullUser,
          reason: `需要角色: ${options.roles.join('、')}`,
          status: 403,
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
          status: 403,
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
          status: 403,
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
              status: 403,
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
              status: 403,
            };
          }
        }
      }
    }

    // 全部通过
    return {
      allowed: true,
      user: fullUser,
    };
  } catch (error) {
    console.error('[PermissionCheck] 权限检查失败:', error);
    return {
      allowed: false,
      reason: '权限检查失败',
      status: 500,
    };
  }
}

/**
 * 创建权限检查包装器（用于API路由）
 */
export function withPermissionCheck<
  T extends (req: NextRequest, user: any) => Promise<NextResponse>,
>(options: PermissionCheckOptions, handler: T): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const result = await checkPermission(request, options);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: result.reason || '权限不足',
          missingPermissions: result.missingPermissions,
          status: result.status,
        },
        { status: result.status || 403 }
      );
    }

    return handler(request, result.user);
  };
}

/**
 * 创建支持动态路由参数的权限检查包装器
 * 用于 Next.js App Router 的动态路由（如 [id]）
 */
export function withPermissionCheckWithParams<
  T extends (req: NextRequest, params: any, user: any) => Promise<NextResponse>,
>(
  options: PermissionCheckOptions,
  handler: T
): (request: NextRequest, { params }: { params: Promise<any> }) => Promise<NextResponse> {
  return async (request: NextRequest, { params }: { params: Promise<any> }) => {
    const result = await checkPermission(request, options);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: result.reason || '权限不足',
          missingPermissions: result.missingPermissions,
          status: result.status,
        },
        { status: result.status || 403 }
      );
    }

    return handler(request, await params, result.user);
  };
}

/**
 * 简化版的权限包装器（常用权限）
 */
export const withUserView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'user.view' }, handler);
};

export const withUserCreate = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'user.create' }, handler);
};

export const withUserEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'user.edit' }, handler);
};

export const withUserDelete = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'user.delete' }, handler);
};

export const withProductView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'product.view' }, handler);
};

export const withProductEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'product.edit' }, handler);
};

export const withProductExport = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'product.export' }, handler);
};

export const withQuoteCreate = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'quote.create' }, handler);
};

export const withQuoteView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'quote.view' }, handler);
};

export const withQuoteEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'quote.edit' }, handler);
};

export const withQuoteExport = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'quote.export' }, handler);
};

/**
 * 计费配置权限包装器
 */
export const withBillingView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'admin.billing.view' }, handler);
};

export const withBillingEdit = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ permissions: 'admin.billing.edit' }, handler);
};

export const withAdmin = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ roles: ['super_admin', 'admin'] }, handler);
};

export const withSuperAdmin = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ roles: ['super_admin'] }, handler);
};

export const withLevel = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  level: number,
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ minLevel: level }, handler);
};

export const withPoints = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  points: number,
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return withPermissionCheck({ minPoints: points }, handler);
};

/**
 * 多权限检查（OR关系）
 */
export const withAnyPermission = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  permissions: string[],
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) =>
  withPermissionCheck({ permissions, requireAll: false }, handler);

/**
 * 多权限检查（AND关系）
 */
export const withAllPermissions = <
  T extends (req: NextRequest, user: any) => Promise<NextResponse>,
>(
  permissions: string[],
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) =>
  withPermissionCheck({ permissions, requireAll: true }, handler);
