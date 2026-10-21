import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST /api/admin/levels/batch —— 批量更新等级配置（旧版）
 *
 * 鉴权 0 硬编码：requireAdmin() 数据库驱动
 * 数据完全数据库驱动：仅写真实数据库，不返回伪造结果；DB 异常如实返回
 */
export async function POST(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { updates } = body;
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: '缺少参数：updates（必须是非空数组）' }, { status: 400 });
    }

    const result = await userLevelService.batchUpdateLevels(updates, Number(currentUser.id));
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AdminLevelsBatch API] 批量更新等级失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '服务器错误') }, { status: 500 });
  }
}
