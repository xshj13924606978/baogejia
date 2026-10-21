/**
 * 产品敏感信息脱敏工具
 *
 * 产品列表/详情中以下字段属于敏感信息：
 * - supplier        厂家/供应商
 * - contact_person  联系人
 * - contact_phone   联系电话
 * - cost_price      进价/成本价
 * - min_price       最低销售价
 *
 * ============================================================
 * #202608302400 阶段3 P0-5 改造说明
 * ============================================================
 * 修复前：仅管理员可见完整信息，其余角色一律脱敏（二元），
 *        member_field_permissions 表配置了但完全没生效。
 *
 * 修复后：**按等级逐字段判定**
 *   1. 管理员（roles 表 DB 驱动）      → 全部可见
 *   2. 创建者本人（creator_id 匹配）   → 全部可见（编辑自己贡献的产品）
 *   3. 未登录 / 身份识别失败           → 全部脱敏（等同 L0）
 *   4. 其他                            → 按 member_field_permissions 表判定
 *   5. 表无配置                        → 回退默认矩阵 FIELD_DEFAULT_PERMISSIONS
 *
 * 字段映射见 level-constants.PRODUCT_FIELD_PERMISSION_MAP。
 * 迁移 117 未应用时同样可用（等级读取失败回退 L1）。
 */

import { NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { userLevelService } from './user-level-service';
import { loadAdminRoleCodes, isUserAdminRole } from './admin-role-helper';
import {
  FIELD_DEFAULT_PERMISSIONS,
  LEVEL_NUM_TO_CODE,
  MAX_LEVEL,
  MIN_LEVEL,
  PRODUCT_FIELD_PERMISSION_MAP,
} from './level-constants';

export const SENSITIVE_PRODUCT_FIELDS = [
  'supplier',
  'contact_person',
  'contact_phone',
  'cost_price',
  'min_price',
] as const;

/** 逐字段可见性映射：{ supplier: true, cost_price: false, ... } */
export type ProductFieldVisibility = Record<string, boolean>;

/** 字段权限缓存：levelCode -> { perms, ts }（后台改配置后 60s 内生效） */
const fieldPermCache = new Map<string, { perms: Record<string, boolean>; ts: number }>();
const FIELD_CACHE_TTL = 60_000;

/** 是否管理员角色（可查看产品敏感信息） */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

function allVisible(): ProductFieldVisibility {
  return SENSITIVE_PRODUCT_FIELDS.reduce((acc, f) => {
    acc[f] = true;
    return acc;
  }, {} as ProductFieldVisibility);
}

function allMasked(): ProductFieldVisibility {
  return SENSITIVE_PRODUCT_FIELDS.reduce((acc, f) => {
    acc[f] = false;
    return acc;
  }, {} as ProductFieldVisibility);
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.trunc(level)));
}

/**
 * 读取指定等级的字段权限（DB 优先，回退默认矩阵）
 *
 * 数据源：member_field_permissions（后台「等级权限配置」页维护）
 */
export async function getFieldPermissionsByLevel(
  level: number
): Promise<Record<string, boolean>> {
  const safeLevel = clampLevel(level);
  const levelCode = LEVEL_NUM_TO_CODE[safeLevel] ?? 'L0';

  const cached = fieldPermCache.get(levelCode);
  if (cached && Date.now() - cached.ts < FIELD_CACHE_TTL) {
    return cached.perms;
  }

  let perms: Record<string, boolean> | null = null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('member_field_permissions')
      .select('field_key, has_permission')
      .eq('level_code', levelCode);

    if (!error && data && data.length > 0) {
      perms = {};
      for (const row of data as { field_key: string; has_permission: boolean | null }[]) {
        perms[row.field_key] = !!row.has_permission;
      }
    }
  } catch (error) {
    console.warn('[ProductVisibility] 读取等级字段权限失败，回退默认矩阵:', error);
  }

  if (!perms) {
    perms = { ...(FIELD_DEFAULT_PERMISSIONS[safeLevel] ?? FIELD_DEFAULT_PERMISSIONS[MIN_LEVEL]) };
  }

  fieldPermCache.set(levelCode, { perms, ts: Date.now() });
  return perms;
}

/** 清除字段权限缓存（后台配置变更后调用；不传则清空全部） */
export function clearFieldPermissionCache(levelCode?: string): void {
  if (levelCode) {
    fieldPermCache.delete(levelCode);
  } else {
    fieldPermCache.clear();
  }
}

/**
 * 获取当前请求的逐字段可见性
 *
 * 这是阶段3 的新主入口：不同等级得到不同的可见性映射。
 */
export async function getProductFieldVisibilityMap(
  request: NextRequest
): Promise<ProductFieldVisibility> {
  try {
    const ctx = await resolveAuthContext(request);
    return await resolveVisibilityByContext(ctx.effectiveRole, ctx.currentUserId);
  } catch (error) {
    console.warn('[ProductVisibility] 解析身份失败，按未登录脱敏处理:', error);
    return allMasked();
  }
}

/**
 * 上下文版：返回可见性映射 + 当前用户 id + 是否管理员
 *
 * 供需要按「创建者本人」放行的列表/搜索接口使用。
 */
export async function getProductFieldVisibilityContextMap(request: NextRequest): Promise<{
  visibility: ProductFieldVisibility;
  currentUserId: string | null;
  isAdmin: boolean;
}> {
  try {
    const ctx = await resolveAuthContext(request);
    const isAdmin = await isAdminByIdentity(ctx.effectiveRole, ctx.currentUserId);
    const visibility = await resolveVisibilityByContext(ctx.effectiveRole, ctx.currentUserId);
    return {
      visibility,
      currentUserId: ctx.currentUserId || null,
      isAdmin,
    };
  } catch (error) {
    console.warn('[ProductVisibility] 解析身份失败，按未登录脱敏处理:', error);
    return { visibility: allMasked(), currentUserId: null, isAdmin: false };
  }
}

/** 按角色 + 用户 id 计算可见性映射（内部复用） */
async function resolveVisibilityByContext(
  role: string | null | undefined,
  currentUserId: string | null | undefined
): Promise<ProductFieldVisibility> {
  // 1. 管理员：全部可见（roles 表 DB 驱动，含中英文 fallback）
  if (await isAdminByIdentity(role, currentUserId)) {
    return allVisible();
  }

  // 2. 未登录：全部脱敏
  if (!currentUserId) {
    return allMasked();
  }

  // 3. 取用户等级（内部会自动处理临时等级过期降级）
  let level = MIN_LEVEL;
  try {
    const levelInfo = await userLevelService.getUserLevel(currentUserId);
    level = clampLevel(levelInfo?.level ?? MIN_LEVEL);
  } catch (error) {
    console.warn('[ProductVisibility] 读取用户等级失败，按 L0 脱敏:', error);
  }

  // 4. 按等级字段权限逐字段判定
  const perms = await getFieldPermissionsByLevel(level);
  const visibility: ProductFieldVisibility = {};
  for (const field of SENSITIVE_PRODUCT_FIELDS) {
    const permKey = PRODUCT_FIELD_PERMISSION_MAP[field];
    visibility[field] = permKey ? !!perms[permKey] : false;
  }
  return visibility;
}

/** 管理员判定：优先 roles 表（DB 驱动），失败回退硬编码角色名 */
async function isAdminByIdentity(
  role: string | null | undefined,
  currentUserId: string | null | undefined
): Promise<boolean> {
  if (isAdminRole(role)) return true;
  if (!role || !currentUserId) return false;
  try {
    const adminCodes = await loadAdminRoleCodes(getSupabaseClient());
    return isUserAdminRole(role, adminCodes);
  } catch {
    return false;
  }
}

/**
 * 构造「全部可见」的可见性映射
 * 用于创建者本人查看/编辑自己贡献的产品等场景
 */
export function buildFullVisibility(): ProductFieldVisibility {
  return allVisible();
}

/**
 * 逐字段脱敏（返回新对象，不改原对象）
 *
 * @param product 单个产品记录
 * @param visibility 由 getProductFieldVisibilityMap 得到的可见性映射
 */
export function maskProductFieldsByVisibility<T extends Record<string, unknown>>(
  product: T,
  visibility: ProductFieldVisibility
): T {
  const masked: Record<string, unknown> = { ...product };
  for (const field of SENSITIVE_PRODUCT_FIELDS) {
    if (!visibility[field]) {
      masked[field] = null;
    }
  }
  return masked as T;
}

// ============================================================
// 以下为向后兼容 API（保留原有签名，供导入模板等"写权限"场景使用）
// ============================================================

/**
 * 判断当前请求的产品敏感字段可见性上下文
 *
 * ⚠️ 兼容语义：canViewSensitive 表示"是否可查看全部敏感字段"，
 *    目前等价于管理员身份。读取产品数据请使用 getProductFieldVisibilityMap
 *    以获得按等级逐字段的结果。
 */
export async function getProductFieldVisibilityContext(
  request: NextRequest
): Promise<{ canViewSensitive: boolean; currentUserId: string | null }> {
  try {
    const ctx = await resolveAuthContext(request);
    return {
      canViewSensitive: await isAdminByIdentity(ctx.effectiveRole, ctx.currentUserId),
      currentUserId: ctx.currentUserId || null,
    };
  } catch {
    return { canViewSensitive: false, currentUserId: null };
  }
}

/**
 * 判断当前请求是否可查看产品敏感信息
 *
 * ⚠️ 兼容语义：仅管理员返回 true。用于"是否导出敏感列/是否可写敏感字段"等
 *    二元场景；读取场景请用 getProductFieldVisibilityMap。
 */
export async function getProductFieldVisibility(request: NextRequest): Promise<boolean> {
  const { canViewSensitive } = await getProductFieldVisibilityContext(request);
  return canViewSensitive;
}

/** 对单个产品整体脱敏（返回新对象，不改原对象） */
export function maskSensitiveProductFields<T extends Record<string, unknown>>(
  product: T,
  visible: boolean
): T {
  if (visible) return product;
  const masked: Record<string, unknown> = { ...product };
  for (const field of SENSITIVE_PRODUCT_FIELDS) {
    masked[field] = null;
  }
  return masked as T;
}
