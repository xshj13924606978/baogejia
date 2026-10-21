import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import {
  loadAdminRoleCodes,
  loadSuperAdminRoleCodes,
  normalizeRole,
} from '@/lib/admin-role-helper';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * GET /api/admin/my-permissions
 *
 * 返回当前用户（基于 token / 第三方登录）的真实权限信息，数据完全从数据库读取：
 *  - 当前 login 身份 (user.id / email / role)
 *  - 用户在 DB roles 表里命中的所有角色（含 is_admin/is_super_admin 标记）
 *  - 在 permissions.role_permissions / user_permissions 里的所有有效权限码
 *  - 当前 is_admin 状态（实时：roles.is_admin=true）
 *  - 当前 is_super_admin 状态（实时：roles.is_super_admin=true）
 *
 * 前端 /admin layout 守卫直接调用此接口获取 admin 判定，0 硬编码中英文角色数组；
 * 修改 roles 表后无需重新发布代码即可生效（缓存 TTL 5s）。
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const { user, errorResponse } = await requireAuth(_request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();

    // 读取 admin roles + super_admin roles（数据库实时）
    const [adminCodes, superCodes] = await Promise.all([
      loadAdminRoleCodes(supabase, { forceRefresh: true }),
      loadSuperAdminRoleCodes(supabase, { forceRefresh: true }),
    ]);

    // 用户当前 role 在 admin 集合吗？
    const userRoleRaw = user?.role || '';
    const userRoleNorm = normalizeRole(userRoleRaw);
    const isAdmin = adminCodes.some((c) => normalizeRole(String(c)) === userRoleNorm);
    const isSuperAdmin = superCodes.some((c) => normalizeRole(String(c)) === userRoleNorm);

    // 从数据库读用户的 effective permissions（用 is_user_admin RPC + 已有的视图也可）
    let permissions: string[] = [];
    try {
      // 用户在 permissions 表里实际生效的权限码（来自 role_permissions + user_permissions）
      // 用 has_permission 在每次加载前先校验登录 ID（user.id），这里简化为：直接查 user_effective_permissions 视图
      // 注意：user.id 在本地登录是 local-userId，无法查视图，所以用 email 去查 users 表拿到 DB id
      let dbUserId: string | null = user?.id || null;
      if (user?.email) {
        const { data: matched } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .maybeSingle();
        if (matched?.id) dbUserId = matched.id;
      }
      if (dbUserId) {
        // 视图若有则用；没有也无害（permissions 会返回空数组，仅代表没特殊权限；RBAC 仍通过 is_admin 判定）
        const { data, error } = await supabase
          .from('user_effective_permissions')
          .select('permission_code')
          .eq('user_id', dbUserId);
        if (!error && Array.isArray(data)) {
          permissions = data.map((r: any) => r.permission_code).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('[my-permissions] 读 effective permissions 失败:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user?.id || null,
          email: user?.email || null,
          name: user?.name || null,
          role: userRoleRaw,
          role_normalized: userRoleNorm,
        },
        is_admin: isAdmin,
        is_super_admin: isSuperAdmin,
        admin_roles: adminCodes,
        super_admin_roles: superCodes,
        permissions,
        source: 'database', // 标记从数据库实时读取
        checked_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[my-permissions] 异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '获取权限信息失败') },
      { status: 500 }
    );
  }
}
