/**
 * 统一模块权限拦截网关
 * 对话窗: [#202608302400-权限体系全面修复] 阶段2 P0-4
 *
 * 背景（审计结论）：
 *   member_module_permissions 表已配置，但没有任何业务接口读取它 → 模块权限形同虚设。
 *   同时系统已存在一套 RBAC 权限服务（src/lib/permission/permission-service.ts，
 *   数据源 permission_overrides / system_modules，已在资料下载接口生效）。
 *
 * 设计原则：**融合而非替换**，避免与既有 RBAC 冲突。
 * 判定顺序（短路）：
 *   1. 管理员（roles 表 DB 驱动）           → 放行
 *   2. 既有 RBAC 显式拒绝（system_modules）  → 拒绝（尊重历史配置）
 *   3. 等级模块权限（member_module_permissions）→ 按 DB 配置判定
 *   4. 均未配置 → 代码默认矩阵 MODULE_DEFAULT_PERMISSIONS
 *   5. 未知模块（不在定义清单中）            → 放行（避免误伤新功能）
 *
 * 迁移 117 未应用时同样可用：等级读取失败回退到 L1，不会抛错。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser, requireAdmin } from './auth-utils';
import { userLevelService } from './user-level-service';
import { MODULE_PERMISSION_DEFS } from './member-permission-defs';
// #202608302500：默认矩阵下沉到 member-permission-defs（客户端安全），此处仅转出保持兼容
import { MODULE_DEFAULT_PERMISSIONS } from './member-permission-defs';

export { MODULE_DEFAULT_PERMISSIONS };
import { loadAdminRoleCodes, isUserAdminRole } from './admin-role-helper';
import { getUserPermissions } from './permission/permission-service';
import {
  getLevelName,
  LEVEL_NUM_TO_CODE,
  MAX_LEVEL,
  MIN_LEVEL,
} from './level-constants';

/** 受控模块键（与 MODULE_PERMISSION_DEFS 保持一致） */
export type ModuleKey =
  | 'chat'
  | 'quote_generate'
  | 'history'
  | 'edit'
  | 'preview'
  | 'enhance_proposal'
  | 'knowledge_download'
  | 'data_export'
  | 'customer_manage';

/** 权限判定来源（便于排查） */
export type PermissionSource = 'admin' | 'rbac' | 'db' | 'default' | 'unknown_module';

export interface ModulePermissionResult {
  allowed: boolean;
  moduleKey: string;
  moduleLabel: string;
  /** 用户当前等级（level 1-5） */
  level: number;
  levelCode: string;
  levelName: string;
  /** 判定来源 */
  source: PermissionSource;
  reason?: string;
  /** 拒绝时：所需最低等级 */
  requiredLevel?: number;
  requiredLevelName?: string;
  upgradeHint?: string;
}

/** 取某个模块的最低可用等级（基于默认矩阵） */
export function getRequiredLevelForModule(moduleKey: string): number {
  const matrix = MODULE_DEFAULT_PERMISSIONS[moduleKey];
  if (!matrix) return MIN_LEVEL;
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i]) return i + 1;
  }
  return MAX_LEVEL;
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.trunc(level)));
}

/**
 * 检查用户是否拥有某模块权限
 *
 * @param params.userId 用户ID
 * @param params.moduleKey 模块键
 * @param params.role 用户角色（可选，用于管理员判定；不传则忽略管理员直通）
 */
export async function checkModulePermission(params: {
  userId: string;
  moduleKey: string;
  role?: string | null;
}): Promise<ModulePermissionResult> {
  const { userId, moduleKey, role } = params;
  const def = MODULE_PERMISSION_DEFS.find((m) => m.module_key === moduleKey);
  const moduleLabel = def?.module_label || moduleKey;
  const supabase = getSupabaseClient();

  const base = {
    moduleKey,
    moduleLabel,
  };

  // 未知模块：不在定义清单内 → 放行（避免误伤未纳管的新功能）
  if (!def) {
    return {
      ...base,
      allowed: true,
      level: MIN_LEVEL,
      levelCode: 'L0',
      levelName: getLevelName(MIN_LEVEL),
      source: 'unknown_module',
    };
  }

  // 1. 管理员直通（roles 表 DB 驱动，含中英文 fallback）
  if (role) {
    try {
      const adminCodes = await loadAdminRoleCodes(supabase);
      if (isUserAdminRole(role, adminCodes)) {
        return {
          ...base,
          allowed: true,
          level: MAX_LEVEL,
          levelCode: LEVEL_NUM_TO_CODE[MAX_LEVEL],
          levelName: getLevelName(MAX_LEVEL),
          source: 'admin',
        };
      }
    } catch (error) {
      console.warn('[PermissionGate] 管理员角色判定失败，按普通用户处理:', error);
    }
  }

  // 2. 获取用户等级（内部会自动处理临时等级过期降级，#202608302400 P0-3）
  let level = MIN_LEVEL;
  try {
    const levelInfo = await userLevelService.getUserLevel(userId);
    level = clampLevel(levelInfo?.level ?? MIN_LEVEL);
  } catch (error) {
    console.warn('[PermissionGate] 读取用户等级失败，回退 L1:', error);
  }
  const levelCode = LEVEL_NUM_TO_CODE[level] ?? 'L0';
  const levelName = getLevelName(level);

  // 3. 既有 RBAC 体系显式拒绝优先（尊重历史配置，避免与 permission-service 冲突）
  try {
    const perms = await getUserPermissions(userId, role || undefined, level);
    if (perms.modules[moduleKey] === false) {
      return {
        ...base,
        allowed: false,
        level,
        levelCode,
        levelName,
        source: 'rbac',
        reason: `当前角色无「${moduleLabel}」权限`,
        requiredLevel: getRequiredLevelForModule(moduleKey),
        requiredLevelName: getLevelName(getRequiredLevelForModule(moduleKey)),
        upgradeHint: `请联系管理员开通「${moduleLabel}」权限`,
      };
    }
  } catch (error) {
    console.warn('[PermissionGate] RBAC 权限读取失败，跳过该层判定:', error);
  }

  // 4. 等级模块权限（member_module_permissions，后台可配置）
  try {
    const { data, error } = await supabase
      .from('member_module_permissions')
      .select('has_permission')
      .eq('level_code', levelCode)
      .eq('module_key', moduleKey)
      .maybeSingle();

    if (!error && data) {
      const allowed = !!data.has_permission;
      return {
        ...base,
        allowed,
        level,
        levelCode,
        levelName,
        source: 'db',
        ...(allowed
          ? {}
          : {
              reason: `当前等级（${levelName}）无「${moduleLabel}」权限`,
              requiredLevel: getRequiredLevelForModule(moduleKey),
              requiredLevelName: getLevelName(getRequiredLevelForModule(moduleKey)),
              upgradeHint: buildUpgradeHint(moduleKey, moduleLabel, level),
            }),
      };
    }
  } catch (error) {
    console.warn('[PermissionGate] 等级模块权限读取失败，回退默认矩阵:', error);
  }

  // 5. 回退：代码默认矩阵
  const matrix = MODULE_DEFAULT_PERMISSIONS[moduleKey];
  const allowed = matrix ? (matrix[level - 1] ?? true) : true;

  return {
    ...base,
    allowed,
    level,
    levelCode,
    levelName,
    source: 'default',
    ...(allowed
      ? {}
      : {
          reason: `当前等级（${levelName}）无「${moduleLabel}」权限`,
          requiredLevel: getRequiredLevelForModule(moduleKey),
          requiredLevelName: getLevelName(getRequiredLevelForModule(moduleKey)),
          upgradeHint: buildUpgradeHint(moduleKey, moduleLabel, level),
        }),
  };
}

/** 生成升级引导文案 */
function buildUpgradeHint(
  moduleKey: string,
  moduleLabel: string,
  currentLevel: number
): string {
  const required = getRequiredLevelForModule(moduleKey);
  if (required <= currentLevel) {
    return `当前等级暂未开通「${moduleLabel}」，请联系管理员或在后台调整等级权限`;
  }
  return `升级到「${getLevelName(required)}」即可使用${moduleLabel}功能，可在「我的权限」中用积分兑换或开通会员`;
}

/**
 * 批量获取用户全部模块权限（供前端展示 / 诊断接口使用）
 */
export async function getUserModulePermissions(params: {
  userId: string;
  role?: string | null;
}): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    MODULE_PERMISSION_DEFS.map((m) =>
      checkModulePermission({ userId: params.userId, moduleKey: m.module_key, role: params.role })
    )
  );
  return results.reduce<Record<string, boolean>>((acc, r) => {
    acc[r.moduleKey] = r.allowed;
    return acc;
  }, {});
}

/**
 * #20260901-0900 P2-2：报表查看权限校验（统计/数据分析接口统一入口）
 *
 * 判定顺序：
 *   1. 管理员直通（requireAdmin：token role + DB 多源升级，roles 表驱动）
 *   2. 非管理员：report_view 模块权限（member_module_permissions 等级配置，迁移 125 种子默认全关）
 *
 * 用法：
 * ```ts
 * const gate = await requireReportView(request);
 * if (gate.errorResponse) return gate.errorResponse;
 * ```
 */
export async function requireReportView(
  request: NextRequest
): Promise<{ errorResponse?: NextResponse; result?: ModulePermissionResult }> {
  const { errorResponse } = await requireAdmin(request);
  if (!errorResponse) return {}; // 管理员直通
  // 非管理员（含未登录）：走 report_view 模块权限判定（未登录返回 401）
  return requireModulePermission(request, 'report_view');
}

/**
 * API 路由专用：校验登录 + 模块权限
 *
 * 用法：
 * ```ts
 * const gate = await requireModulePermission(request, 'enhance_proposal');
 * if (gate.errorResponse) return gate.errorResponse;
 * ```
 *
 * 无权限时返回 403，并附带当前等级 / 所需等级 / 升级引导。
 */
export async function requireModulePermission(
  request: NextRequest,
  moduleKey: ModuleKey | string
): Promise<{ errorResponse?: NextResponse; result?: ModulePermissionResult }> {
  try {
    const user = await getCurrentUser(request);

    if (!user?.id) {
      return {
        errorResponse: NextResponse.json(
          { success: false, error: '请先登录', code: 'UNAUTHORIZED' },
          { status: 401 }
        ),
      };
    }

    const result = await checkModulePermission({
      userId: user.id,
      moduleKey,
      role: user.role,
    });

    if (!result.allowed) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            error: result.reason || '无权限',
            code: 'MODULE_PERMISSION_DENIED',
            module: result.moduleKey,
            moduleLabel: result.moduleLabel,
            currentLevel: result.level,
            currentLevelName: result.levelName,
            requiredLevel: result.requiredLevel,
            requiredLevelName: result.requiredLevelName,
            upgradeHint: result.upgradeHint,
            source: result.source,
          },
          { status: 403 }
        ),
        result,
      };
    }

    return { result };
  } catch (error) {
    console.error('[PermissionGate] 权限校验异常:', error);
    // 失败开放：网关自身异常时不阻断业务（避免权限系统故障导致全站不可用）
    return {};
  }
}
