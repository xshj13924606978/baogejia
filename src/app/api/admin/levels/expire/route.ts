import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST /api/admin/levels/expire
 *
 * 批量处理已过期的临时等级（积分兑换 / 付费购买），按当前积分自动降级。
 * 对话窗: [#202608302400-权限体系全面修复] 阶段1 P0-3
 *
 * 说明：
 * - 正常读取等级时（getUserLevel）已会逐个用户自动降级，本接口用于
 *   「批量清理」场景（定时任务 / 管理员手动触发），避免长期未登录用户
 *   的等级数据停留在过期状态。
 * - 依赖迁移 117 提供的 expire_expired_user_levels() 函数；
 *   未应用迁移时返回 0，不报错（兼容老环境）。
 *
 * 权限：管理员（requireAdmin，数据库角色驱动）
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const affected = await userLevelService.expireAllExpiredLevels();

    return NextResponse.json({
      success: true,
      data: {
        affected,
        message:
          affected > 0
            ? `已降级 ${affected} 个过期等级`
            : '没有需要降级的过期等级（如确认有过期数据，请检查迁移 117 是否已应用）',
      },
    });
  } catch (error) {
    console.error('[AdminLevelExpire API] 批量过期降级失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? safeErrorMessage(error) : '服务器错误' },
      { status: 500 }
    );
  }
}

/** GET 便于浏览器/健康检查直接触发（同样需要管理员权限） */
export async function GET(request: NextRequest) {
  return POST(request);
}
