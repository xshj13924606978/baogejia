import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * /api/admin/levels/[level]
 *
 * 鉴权 0 硬编码：requireAdmin() 数据库驱动
 * 数据完全数据库驱动：不存任何默认值的硬编码 fake data；若 DB 异常返回 404/500
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

    const config = await userLevelService.getLevelFullConfig(levelNum);
    if (!config) {
      return NextResponse.json({ error: '等级不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error('[AdminLevelDetail API] 获取等级配置失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '服务器错误') }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const { level } = await params;
    const levelNum = parseInt(level, 10);
    const body = await request.json();
    const { changes, reason } = body;

    if (!changes) {
      return NextResponse.json({ error: '缺少参数：changes' }, { status: 400 });
    }

    const updated = await userLevelService.updateLevelPermissions(
      levelNum,
      Number(currentUser.id),
      changes,
      reason || '管理员手动调整'
    );

    const updatedConfig = await userLevelService.getLevelFullConfig(levelNum);
    return NextResponse.json({
      success: true,
      message: '等级权限更新成功',
      updated,
      config: updatedConfig,
    });
  } catch (error: any) {
    console.error('[AdminLevelDetail API] 更新等级权限失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '服务器错误') }, { status: 500 });
  }
}
