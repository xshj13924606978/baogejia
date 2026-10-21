/**
 * 用户权限查询接口（供前端 usePermission Hook 调用）
 * GET /api/user/permissions
 * 返回当前登录用户的完整权限配置
 *
 * #202608302400 阶段2：附加 levelModulePermissions（等级模块权限融合判定结果），
 *   与既有 RBAC 的 modules 字段区分开，前端可据此渲染"当前等级可用功能"。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserPermissions, getUserRoleAndLevel } from '@/lib/permission/permission-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getUserModulePermissions } from '@/lib/permission-gate';

/**
 * 从请求中获取用户信息
 *
 * #202608302500：优先级改为「统一鉴权 getCurrentUser → x-user-id 请求头」。
 *   旧实现只认 x-user-id（且把 Bearer token 当成用户 ID 直接查表），
 *   登录用户若未带该头会被判成游客 → levelModulePermissions 恒为空集，
 *   前端「增强方案」按钮对会员/管理员同样显示为锁定态。
 *   getCurrentUser 与业务接口（如 /api/proposal/enhance 的 requireAuth）同源，
 *   保证「按钮可见性判定」与「接口拦截判定」拿到的是同一个身份。
 */
async function getUserFromRequest(request: NextRequest): Promise<{ id: string; role: string; level: number } | null> {
  try {
    let userId: string | null = null;
    let role: string | null = null;

    // 优先级 1：统一鉴权（Supabase cookie / Bearer / session_token cookie）
    const currentUser = await getCurrentUser(request);
    if (currentUser?.id) {
      userId = currentUser.id;
      role = currentUser.role || null;
    }

    // 优先级 2：前端显式传入的用户 ID（兼容历史调用方）
    if (!userId) userId = request.headers.get('x-user-id');

    if (!userId) return null;

    // 无法在 users 表确认的用户（如降级登录的本地用户）一律视为无效身份，
    // 返回 null 以走"空权限"路径（前端默认拒绝，避免泄露管理菜单）。
    const { role: dbRole, level, found } = await getUserRoleAndLevel(userId);
    if (!found) return null;
    return { id: userId, role: role || dbRole, level };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userInfo = await getUserFromRequest(request);
    if (!userInfo) {
      // 未登录 / 身份无法确认：返回空权限（前端默认拒绝，避免越权展示入口）
      return NextResponse.json({ success: true, data: { modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {}, levelModulePermissions: {} } });
    }

    const perms = await getUserPermissions(userInfo.id, userInfo.role, userInfo.level);

    // 等级模块权限（管理员直通 / RBAC / member_module_permissions / 默认矩阵 融合判定）
    let levelModulePermissions: Record<string, boolean> = {};
    try {
      levelModulePermissions = await getUserModulePermissions({
        userId: userInfo.id,
        role: userInfo.role,
      });
    } catch (gateError) {
      console.warn('[UserPermissionsAPI] 等级模块权限读取失败，返回空集:', gateError);
    }

    return NextResponse.json({
      success: true,
      data: { ...perms, levelModulePermissions },
    });
  } catch (error) {
    console.error('[UserPermissionsAPI] 失败:', error);
    // 降级返回空权限（与未登录一致，前端默认拒绝）
    return NextResponse.json({ success: true, data: { modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {}, levelModulePermissions: {} } });
  }
}
