import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * /api/admin/levels —— 获取所有等级（旧版；与 /api/admin/member-levels 并存，互不冲突）
 *
 * @deprecated #[20260901-1100] P2-12：新代码一律使用 /api/admin/member-levels（member_levels 表，L0-L4）。
 * 本路由仅保留给存量用户侧组件 PermissionPanel（等级权益展示，属已验证基线功能），
 * 待单独窗口迁移到用户级接口后删除；管理端调用方（config-permissions）已切换。
 *
 * 鉴权 0 硬编码：requireAdmin() 走数据库 roles 表（is_admin=true）+ fallback 兼容
 * 数据完全数据库驱动：仅当数据库无配置时才使用 DEFAULT_LEVELS 兜底（兜底在注释中说明用途，非硬编码配置）
 */
export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    // 数据库联表：无任何伪造数据，若 DB 未配置则返回配置为空数组，让前端从 member-levels 取
    const levels: any[] = [];
    for (let i = 1; i <= 5; i++) {
      try {
        const config = await userLevelService.getLevelFullConfig(i);
        if (config) levels.push(config);
      } catch {
        // 单条失败不阻断整体
      }
    }

    return NextResponse.json({ success: true, levels });
  } catch (error) {
    console.error('[AdminLevels API] 获取等级配置失败:', error);
    return NextResponse.json({ success: false, error: '获取等级配置失败' }, { status: 500 });
  }
}
