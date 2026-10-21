import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { updateModulePermissions } from '@/lib/member-level-service';
import { safeErrorMessage } from '@/lib/error-handler';

interface RouteContext {
  params: { levelCode: string };
}

/**
 * PUT /api/admin/member-levels/:levelCode/module-permissions —— 批量更新模块权限
 *
 * 鉴权 0 硬编码：withPermissionCheck 内核数据库驱动
 * 要求权限码：admin.levels.edit
 */
async function handlePUT(request: NextRequest, user: any, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { levelCode } = ctx.params;
    const body = (await request.json()) as { permissions?: { module_key: string; has_permission?: boolean }[] };
    const perms = body.permissions || [];
    const operator = user?.email || user?.name || '管理员';
    const result = await updateModulePermissions(levelCode, perms, operator);
    if (!result) {
      return NextResponse.json({ success: false, error: '等级不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[member-levels module-permissions PUT] 失败:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '更新模块权限失败') }, { status: 500 });
  }
}

export const PUT = withPermissionCheck({ permissions: 'admin.levels.edit' }, handlePUT);
