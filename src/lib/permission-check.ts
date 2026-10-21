/**
 * 权限检查工具函数
 * 提供统一的权限检查接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { permissionService } from './permission-service';
import { getCurrentUser, AuthDatabaseError } from './auth-utils';
import { apiError } from './api-response';
import { ERROR_CODES } from './error-codes';
import { safeErrorMessage } from './error-handler';
import {
  normalizeRole,
  isUserAdminRole,
  loadAdminRoleCodes,
  loadSuperAdminRoleCodes,
} from './admin-role-helper';

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

// 注：normalizeRole / ROLE_NAME_MAP / loadAdminRoleCodes / loadSuperAdminRoleCodes
// 已统一迁移至 './admin-role-helper'。本文件保留 getUserRole / checkPermission / 各 withXxx 包装器。

/**
 * 从多个来源获取用户角色（数据库驱动，零硬编码）。
 *
 * 关键点：
 *  - `getCurrentUser` 已经从 token 或 Bearer 三方登录拿到 user.role（来自登录逻辑写入的数据库角色）
 *    ⇒ 这是**最高优先级**可信来源。token 经过 HMAC 签名保护，第三方登录会查 users.role
 *    ⇒ 旧实现漏掉这一来源、强行用 user.id 重查 DB，但 user.id 本地登录是 `user-<ts>-<rand>`
 *      不是数据库 UUID ⇒ user_roles/profiles/users.id 都查不到 ⇒ 全部 403
 *  - 仅当 user.role 是默认值 ('user') 时，再尝试从 DB 多源升级到 admin/super_admin
 *  - 角色值最终会经过 normalizeRole 中英文归一化（保留 ROLE_NAME_MAP 兼容历史中文 token 字段）
 */
async function getUserRole(supabase: any, user: any): Promise<string | null> {
  if (!user || (!user.id && !user.email)) return null;

  // 来源 0：getCurrentUser 已经返回的 user.role（token verified.role 或 users.role）
  // 这是登录时写入 token 的数据库角色，可信度最高
  if (user.role && user.role !== 'user') {
    return user.role;
  }

  // 来源 1：user_roles 表（按 email 在 users 表里匹配到 DB user_id 后再查）
  try {
    let dbUserId: string | null = null;
    if (user.email) {
      const { data: matched } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();
      if (matched?.id) dbUserId = matched.id;
    }
    if (!dbUserId && user.id) dbUserId = user.id;

    if (dbUserId) {
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', dbUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (userRole?.role) return userRole.role;

      // 来源 2：users.role（顶层列）
      const { data: dbUser } = await supabase
        .from('users')
        .select('role, metadata')
        .eq('id', dbUserId)
        .maybeSingle();
      if (dbUser?.role) return dbUser.role;

      // 来源 3：users.metadata.role
      if (dbUser?.metadata?.role) return dbUser.metadata.role;

      // 来源 4：profiles.metadata.role
      const { data: profile } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', dbUserId)
        .maybeSingle();
      if (profile?.metadata?.role) return profile.metadata.role;
    }
  } catch (e) {
    console.warn('[PermissionCheck] 查询数据库角色失败:', e instanceof Error ? e.message : e);
  }

  // 来源 5：开发环境默认给予超管（保证本地开发不出 403）
  if (process.env.NODE_ENV === 'development' && !user.email?.endsWith('@prod.local')) {
    return '超级管理员';
  }

  // 来源 6：兜底返回 token 中 user.role（即便默认是 'user'，让审计路径能看到 token 上的值）
  return user.role || null;
}

/**
 * 统一的权限检查函数
 */
export async function checkPermission(
  request: NextRequest,
  options: PermissionCheckOptions
): Promise<PermissionCheckResult> {
  try {
    // requiresAuth=false 表示纯公开端点：无论登录与否都不做任何鉴权检查。
    // 修复 #20260825-0834：原实现仅在「未登录」分支放行，已登录的非管理员仍会进入
    // 下方角色检查（默认加载管理员角色集）→ /api/admin/config/query/user-menu 返回 403，
    // 导致普通登录用户无法加载用户端菜单。公开端点应完全跳过鉴权，仅尽力携带身份供 handler 使用。
    if (options.requiresAuth === false) {
      let publicUser: any = { id: '', email: '', role: 'user', level: 1, currentPoints: 0 };
      try {
        const current = await getCurrentUser(request);
        if (current) {
          publicUser = { ...current, role: current.role || 'user', level: 1, currentPoints: 0 };
        }
      } catch {
        // 公开端点不因身份获取失败而拒绝（数据库故障由 handler 自身查询体现）
      }
      return { allowed: true, user: publicUser };
    }

    // 1. 获取当前用户
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (e) {
      // 数据库连接失败 → 503，而非 401/500
      if (e instanceof AuthDatabaseError) {
        return { allowed: false, reason: e.message, status: 503 };
      }
      throw e;
    }
    if (!user) {
      return { allowed: false, reason: '未登录', status: 401 };
    }

    // 获取用户完整信息（包括角色、等级、积分）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    // 获取用户角色（多个来源，含 token 中已验证的 role）
    const role = await getUserRole(supabase, user);

    // 获取用户等级和积分
    let userInfo: any = null;
    try {
      const { data, error: infoError } = await supabase
        .from('users')
        .select('level, points, metadata')
        .eq('id', user.id)
        .single();
      if (!infoError) userInfo = data;
    } catch (e) {
      // 数据库连接/网络瞬断：使用默认值，避免权限检查 500
      console.warn('[PermissionCheck] 查询用户等级/积分失败:', e instanceof Error ? e.message : e);
    }

    // 如果 users 表也查不到，使用默认值
    const level = userInfo?.level || userInfo?.metadata?.level || 1;
    const points = userInfo?.points || userInfo?.metadata?.points || 0;

    // 构建完整用户信息
    // 注意：role 优先级 = token中user.role (登录时写入的 DB 角色，HMAC签名保护) > DB role > 'user'
    // 不要再用 `role || 'user'` 把 token role 无端降级，否则本地登录的 user_id 在 user_roles 查不到
    // 时会一直 403（这是 /admin/membership/level-permissions 报 403 的根因）
    const fullUser = {
      ...user,
      role: role || user.role || 'user',
      level: level,
      currentPoints: points,
    };

    // 2. 角色检查
    // 若调用方显式传了 roles 列表，使用之；否则根据 __superAdminOnly 信号选择加载：
    //   - true  → 仅 super_admin 通过（从 DB roles.is_super_admin=true 加载）
    //   - false/undefined → 所有管理员通过（从 DB roles.is_admin=true 加载，兼容历史 ['admin','super_admin'] 用法）
    // 这样彻底消除 ADMIN_ROLES 硬编码，管理员角色集由数据库 roles 表驱动。
    let allowedRoles = options.roles && options.roles.length > 0 ? options.roles : null;
    if (!allowedRoles) {
      if ((options as any).__superAdminOnly === true) {
        allowedRoles = await loadSuperAdminRoleCodes(supabase);
      } else {
        allowedRoles = await loadAdminRoleCodes(supabase);
      }
    }
    if (allowedRoles && allowedRoles.length > 0) {
      // 标准化角色名称，支持中英文角色名匹配
      const normalizedUserRole = normalizeRole(fullUser.role);
      const normalizedAllowedRoles = allowedRoles.map(r => normalizeRole(r));

      if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
        return {
          allowed: false,
          user: fullUser,
          reason: `需要角色: ${allowedRoles.join('、')}`,
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
        // 管理员豁免：所有 admin.* 后台权限码对管理员直接放行。
        // 管理员角色集已由 roles 表（is_admin=true）动态判定（见上面角色检查），
        // 无需在 role_permissions 表为每个管理员重复插入 admin.* 权限行（那才是虚假数据）。
        // 仅当请求的权限码全部属于 admin.* 且当前用户确实是管理员时才豁免；
        // 其他权限码（user.* / product.* / quote.* 等）继续走 permissionService.hasPermission 数据库校验。
        const adminOnlyPerms = perms.every((p) => p.startsWith('admin.'));
        if (adminOnlyPerms && isUserAdminRole(fullUser.role, allowedRoles ?? undefined)) {
          // 管理员直接通过 admin.* 权限检查（角色驱动，实时联动）
        } else if (options.requireAll !== false) {
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
 *
 * handler 签名：`(request: NextRequest, user: any, ctx?: NextJSContext) => Promise<NextResponse>`
 * - 第二个参数 user 是从 requireAuth / role 检查后得到的完整用户对象
 * - 第三个参数 ctx 是 NextJS dynamic route 的 { params } 上下文（如果没有 dynamic segment，则为 undefined）
 *
 * 同时支持：
 *  - `(req, user) => res`                       — 简单 handler（无 dynamic params）
 *  - `(req, user, ctx) => res`                  — dynamic route handler（兼容 NextJS 14+ 推荐的 async params）
 */
export function withPermissionCheck<
  T extends (req: NextRequest, user: any, ctx?: any) => Promise<NextResponse>,
>(options: PermissionCheckOptions, handler: T): (request: NextRequest, ctx?: any) => Promise<NextResponse> {
  return async (request: NextRequest, ctx?: any) => {
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

    // #[20260901-1100] P1-9：兜底 handler 未捕获异常，统一脱敏为 500，杜绝内部细节冒泡
    try {
      return await handler(request, result.user, ctx);
    } catch (error) {
      console.error('[withPermissionCheck] handler 未捕获异常:', error);
      return apiError(
        ERROR_CODES.SYS_INTERNAL_ERROR,
        safeErrorMessage(error),
        { status: 500 }
      );
    }
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

    // #[20260901-1100] P1-9：兜底 handler 未捕获异常，统一脱敏为 500
    try {
      return await handler(request, await params, result.user);
    } catch (error) {
      console.error('[withPermissionCheckWithParams] handler 未捕获异常:', error);
      return apiError(
        ERROR_CODES.SYS_INTERNAL_ERROR,
        safeErrorMessage(error),
        { status: 500 }
      );
    }
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

/**
 * 报表查看权限包装器（#20260901-0900 P2-2）
 * 权限码 report_view 注册于 permissions 表（迁移 125），判定链：
 * 管理员直通（roles 表）→ RBAC 显式拒绝 → member_module_permissions.report_view → 默认矩阵（全关）
 */
export const withReportView = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  return async (request: NextRequest) => {
    // 动态导入避免与 permission-gate 产生静态循环依赖
    const { requireReportView } = await import('./permission-gate');
    const gate = await requireReportView(request);
    if (gate.errorResponse) return gate.errorResponse;
    const user = await getCurrentUser(request);
    return handler(request, user);
  };
};

export const withAdmin = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  // 不传 roles，让 checkPermission 通过 loadAdminRoleCodes 从数据库 roles 表动态加载（0 硬编码）
  // 数据库迁移 075_unified_admin_roles.sql 应用后，将按 is_admin=true 实时联动；
  // 未应用迁移时使用 loadAdminRoleCodes 内的 fallback（保持兼容历史 token role）
  return withPermissionCheck({}, handler);
};

export const withSuperAdmin = <T extends (req: NextRequest, user: any) => Promise<NextResponse>>(
  handler: T
): ((request: NextRequest) => Promise<NextResponse>) => {
  // 仅 super_admin 通过：让 checkPermission 通过 loadSuperAdminRoleCodes 从 roles 表读取
  // 我们用 options.__superAdminOnly 作为信号
  return withPermissionCheck({ __superAdminOnly: true } as any, handler);
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
