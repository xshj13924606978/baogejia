import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import {
  getAllMemberLevels,
  createMemberLevel,
  MemberLevelInput,
} from '@/lib/member-level-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * /api/admin/member-levels
 *
 * 鉴权说明（0 硬编码，全部数据库驱动）：
 *  - withPermissionCheck 内核会走：
 *      a. requireAuth()                     -> token/Bearer 拿到 user（含 token verified.role）
 *      b. loadAdminRoleCodes(supabase)      -> 数据库 roles.is_admin=true 动态加载
 *      c. permissionService.hasPermission() -> 数据库 permissions.role_permissions 校验
 *  - 因此管理员角色集与具体权限码变更会实时联动，token 中中文 role 也能被 ROLE_NAME_MAP 归一化
 *  - 不再有 ADMIN_ROLES 硬编码、也没有 false 重查 user_roles 的反模式
 *
 * 路由：
 *  - GET  -> admin.levels.view
 *  - POST -> admin.levels.create
 */

async function handleGET(_request: NextRequest, _user: any): Promise<NextResponse> {
  try {
    const data = await getAllMemberLevels();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[member-levels GET] 失败:', error);
    return NextResponse.json({ success: false, error: '获取等级列表失败' }, { status: 500 });
  }
}

async function handlePOST(request: NextRequest, user: any): Promise<NextResponse> {
  try {
    const body = (await request.json()) as MemberLevelInput;
    if (!body.level_name) {
      return NextResponse.json({ success: false, error: '等级名称不能为空' }, { status: 400 });
    }
    const identifier = user?.email || user?.name || '管理员';
    const level = await createMemberLevel(body, identifier);
    return NextResponse.json({ success: true, data: level }, { status: 201 });
  } catch (error: any) {
    console.error('[member-levels POST] 失败:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '创建等级失败') }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.levels.view' }, handleGET);
export const POST = withPermissionCheck({ permissions: 'admin.levels.create' }, handlePOST);
