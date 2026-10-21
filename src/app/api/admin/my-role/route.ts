import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import {
  loadAdminRoleCodes,
  loadSuperAdminRoleCodes,
  normalizeRole,
} from '@/lib/admin-role-helper';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * GET /api/admin/my-role —— 轻量级"我是否是管理员/超管"判断
 *
 * 数据完全从数据库 roles 表读取（roles.is_admin / is_super_admin），无硬编码字符串数组。
 * 用于前端 layout / 简单 bool 判断；详细权限请用 /api/admin/my-permissions。
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const { user, errorResponse } = await requireAuth(_request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();
    const [adminCodes, superCodes] = await Promise.all([
      loadAdminRoleCodes(supabase, { forceRefresh: true }),
      loadSuperAdminRoleCodes(supabase, { forceRefresh: true }),
    ]);

    const userRoleRaw = user?.role || '';
    const norm = normalizeRole(userRoleRaw);
    const is_admin = adminCodes.some((c) => normalizeRole(String(c)) === norm);
    const is_super_admin = superCodes.some((c) => normalizeRole(String(c)) === norm);

    return NextResponse.json({
      success: true,
      data: {
        role: userRoleRaw,
        role_normalized: norm,
        is_admin,
        is_super_admin,
      },
    });
  } catch (error: any) {
    console.error('[my-role] 异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '获取角色失败') },
      { status: 500 }
    );
  }
}
