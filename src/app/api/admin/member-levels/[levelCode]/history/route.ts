import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getChangeLog } from '@/lib/member-level-service';

interface RouteContext {
  params: { levelCode: string };
}

/**
 * GET /api/admin/member-levels/:levelCode/history —— 获取等级变更历史
 *
 * 鉴权 0 硬编码：withPermissionCheck 内核数据库驱动
 * 要求权限码：admin.levels.view_history（permissions 表已定义）
 */
async function handleGET(_request: NextRequest, _user: any, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { levelCode } = ctx.params;
    const data = await getChangeLog(levelCode);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[member-levels history GET] 失败:', error);
    return NextResponse.json({ success: false, error: '获取变更历史失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.levels.view_history' }, handleGET);
