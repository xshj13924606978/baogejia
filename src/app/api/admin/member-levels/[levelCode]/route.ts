import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import {
  getMemberLevel,
  updateMemberLevel,
  deleteMemberLevel,
  MemberLevelInput,
} from '@/lib/member-level-service';
import { safeErrorMessage } from '@/lib/error-handler';

interface RouteContext {
  params: { levelCode: string };
}

/**
 * /api/admin/member-levels/[levelCode]
 *
 * 鉴权 0 硬编码：完全数据库驱动
 *  - GET    -> admin.levels.view
 *  - PUT    -> admin.levels.edit
 *  - DELETE -> admin.levels.delete
 *
 * 注：withPermissionCheck 透传 NextJS ctx（含 params）
 */
async function handleGET(_request: NextRequest, _user: any, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { levelCode } = ctx.params;
    const level = await getMemberLevel(levelCode);
    if (!level) {
      return NextResponse.json({ success: false, error: '等级不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: level });
  } catch (error) {
    console.error('[member-levels GET detail] 失败:', error);
    return NextResponse.json({ success: false, error: '获取等级详情失败' }, { status: 500 });
  }
}

async function handlePUT(request: NextRequest, user: any, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { levelCode } = ctx.params;
    const body = (await request.json()) as Partial<MemberLevelInput>;
    const operator = user?.email || user?.name || '管理员';
    const updated = await updateMemberLevel(levelCode, body, operator);
    if (!updated) {
      return NextResponse.json({ success: false, error: '等级不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[member-levels PUT] 失败:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '更新等级失败') }, { status: 500 });
  }
}

async function handleDELETE(_request: NextRequest, user: any, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { levelCode } = ctx.params;
    const operator = user?.email || user?.name || '管理员';
    const deleted = await deleteMemberLevel(levelCode, operator);
    if (!deleted) {
      return NextResponse.json({ success: false, error: '等级不存在或为默认等级' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: '等级已删除' });
  } catch (error: any) {
    console.error('[member-levels DELETE] 失败:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '删除等级失败') }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.levels.view' }, handleGET);
export const PUT = withPermissionCheck({ permissions: 'admin.levels.edit' }, handlePUT);
export const DELETE = withPermissionCheck({ permissions: 'admin.levels.delete' }, handleDELETE);
