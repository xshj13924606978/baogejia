import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { batchUpdateMemberLevels } from '@/lib/member-level-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST /api/admin/member-levels/batch-update —— 批量更新所有等级
 *
 * 鉴权 0 硬编码：withPermissionCheck 内核（roles + permissions 表驱动）
 * 要求权限码：admin.levels.batch_update
 */
async function handlePOST(request: NextRequest, user: any): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      items: {
        level_code: string;
        level_name?: string;
        required_points?: number;
        daily_quota?: number;
        max_files?: number;
        max_chat_messages?: number;
        field_permissions?: { field_key: string; has_permission?: boolean }[];
        module_permissions?: { module_key: string; has_permission?: boolean }[];
      }[];
    };

    if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ success: false, error: 'items 不能为空' }, { status: 400 });
    }

    const operator = user?.email || user?.name || '管理员';
    const result = await batchUpdateMemberLevels(body.items as any, operator);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[member-levels batch-update POST] 失败:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '批量更新失败') }, { status: 500 });
  }
}

export const POST = withPermissionCheck({ permissions: 'admin.levels.batch_update' }, handlePOST);
