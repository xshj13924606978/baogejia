import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { resetToDefaults } from '@/lib/member-level-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST /api/admin/member-levels/reset-defaults —— 恢复默认等级权限配置
 *
 * 鉴权 0 硬编码：走 withPermissionCheck 内核（roles + permissions 数据库驱动）
 * 要求权限码：admin.levels.restore_defaults
 */
async function handlePOST(_request: NextRequest, user: any): Promise<NextResponse> {
  try {
    const ok = await resetToDefaults(user?.email || user?.name || '管理员');
    if (!ok) {
      return NextResponse.json({ success: false, error: '无等级数据，无法恢复' }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: '已恢复默认配置' });
  } catch (error: any) {
    console.error('[member-levels reset-defaults POST] 失败:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '恢复默认配置失败') }, { status: 500 });
  }
}

export const POST = withPermissionCheck({ permissions: 'admin.levels.restore_defaults' }, handlePOST);
