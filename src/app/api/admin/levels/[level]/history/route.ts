import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * /api/admin/levels/[level]/history —— 等级权限修改历史（旧版）
 *
 * 鉴权 0 硬编码：requireAdmin() 数据库驱动
 * 数据完全数据库驱动：只从 userLevelService 读取真实历史；不返回任何 fake data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const { level } = await params;
    const levelNum = parseInt(level, 10);
    if (!Number.isFinite(levelNum)) {
      return NextResponse.json({ error: 'level 必须是数字' }, { status: 400 });
    }

    const history = await userLevelService.getLevelPermissionHistory(levelNum);
    return NextResponse.json({ success: true, history: history || [] });
  } catch (error: any) {
    console.error('[AdminLevelHistory API] 获取历史失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '获取历史失败') }, { status: 500 });
  }
}
