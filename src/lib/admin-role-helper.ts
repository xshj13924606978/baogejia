/**
 * 统一的管理员/超管角色识别（DB 驱动，零硬编码 ADMIN_ROLES 数组）。
 *
 * 设计要点：
 *  1. ADMIN_ROLES 全部从数据库 `roles` 表（migration 075）加载，is_admin=true 实时联动
 *  2. 提供中英文 fallback（兼容历史 token role 字段值、未应用迁移 075 的环境）
 *  3. ROLE_NAME_MAP 作为独立的"中英文角色值映射"，避免 ROLE_NAME_MAP 跟 role code 集合混在一起
 *  4. 5 秒内存缓存（cache TTL）保证性能同时跨请求刷新（实时联动）
 *  5. `/api/admin/my-permissions` 等端点也能复用这里的 helper
 */

export type SupabaseClientLike = {
  from: (table: string) => any;
  rpc?: (fn: string, args?: any) => any; // Supabase 真实类型在 PostgrestFilterBuilder 上，不强制 Promise 以兼容
};

// 中英文角色值映射（兼容历史 token payload 中的中文 role 值）
// 注意：这里只承担"翻译表"的职责，不参与权限判断；权限判断靠 roles.is_admin=true 这一列。
export const ROLE_NAME_MAP: Readonly<Record<string, string>> = Object.freeze({
  超级管理员: 'super_admin',
  系统管理员: 'admin',
  管理员: 'admin',
  企业管理员: 'enterprise_admin',
  'VIP会员': 'vip',
  付费会员: 'premium',
  免费用户: 'free',
  待审核: 'pending',
});

/**
 * 标准化角色值（中文 -> 英文）
 */
export function normalizeRole(role: string): string {
  return ROLE_NAME_MAP[role] || role;
}

interface RoleCodesCache {
  codes: string[];
  loadedAt: number;
}
let _adminRoleCodesCache: RoleCodesCache | null = null;
let _superAdminRoleCodesCache: RoleCodesCache | null = null;
const ROLE_CACHE_TTL_MS = 5_000;

/**
 * 中英文 fallback 管理员角色集。
 * 当数据库 roles 表为空（迁移 075 未应用或被清空）时回退到这些值，避免生产 403。
 * 所有已知的 admin 写法（中文/英文/全大写）都包含在内以保留历史兼容。
 */
const ADMIN_ROLE_FALLBACK: readonly string[] = Object.freeze([
  'admin',
  'super_admin',
  'Admin',
  'SUPER_ADMIN',
  'Administrator',
  'SUPER',
  'ADMIN',
  '管理员',
  '超级管理员',
  '系统管理员',
  'enterprise_admin',
]);

const SUPER_ADMIN_ROLE_FALLBACK: readonly string[] = Object.freeze([
  'super_admin',
  '超级管理员',
  'SUPER_ADMIN',
  'SUPER',
]);

/**
 * 从数据库 roles 表读取 is_admin=true 的角色代码（数据源）
 * 失败则返回 null（调用方应使用 fallback）
 */
async function fetchAdminRoleCodesFromDB(supabase: SupabaseClientLike | null | undefined): Promise<string[] | null> {
  if (!supabase) return null;
  // 方式 A：roles 表（迁移 075 已应用）
  try {
    const client: any = supabase;
    const { data, error } = await client
      .from('roles')
      .select('code')
      .eq('is_active', true)
      .eq('is_admin', true);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r: any) => String(r.code));
    }
  } catch {
    // ignore
  }
  // 方式 B：RPC 函数
  try {
    if (supabase.rpc) {
      const { data, error } = await supabase.rpc('get_admin_role_codes');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((c: any) => String(c));
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchSuperAdminRoleCodesFromDB(supabase: SupabaseClientLike | null | undefined): Promise<string[] | null> {
  if (!supabase) return null;
  try {
    const client: any = supabase;
    const { data, error } = await client
      .from('roles')
      .select('code')
      .eq('is_active', true)
      .eq('is_super_admin', true);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r: any) => String(r.code));
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 从 DB 加载管理员角色代码（含 fallback）。
 * @param supabase 可选；如果传入 supabase，会先尝试从 roles 表读取，失败则用 fallback
 * @param forceRefresh 强制跳过缓存（用于权限诊断接口实时刷新）
 */
export async function loadAdminRoleCodes(
  supabase?: SupabaseClientLike | null,
  options?: { forceRefresh?: boolean }
): Promise<string[]> {
  if (!options?.forceRefresh && _adminRoleCodesCache && Date.now() - _adminRoleCodesCache.loadedAt < ROLE_CACHE_TTL_MS) {
    return _adminRoleCodesCache.codes;
  }
  const fromDB = await fetchAdminRoleCodesFromDB(supabase);
  const codes = fromDB && fromDB.length > 0 ? fromDB : [...ADMIN_ROLE_FALLBACK];
  _adminRoleCodesCache = { codes, loadedAt: Date.now() };
  return codes;
}

/**
 * 从 DB 加载 super_admin 角色代码（含 fallback）。
 */
export async function loadSuperAdminRoleCodes(
  supabase?: SupabaseClientLike | null,
  options?: { forceRefresh?: boolean }
): Promise<string[]> {
  if (!options?.forceRefresh && _superAdminRoleCodesCache && Date.now() - _superAdminRoleCodesCache.loadedAt < ROLE_CACHE_TTL_MS) {
    return _superAdminRoleCodesCache.codes;
  }
  const fromDB = await fetchSuperAdminRoleCodesFromDB(supabase);
  const codes = fromDB && fromDB.length > 0 ? fromDB : [...SUPER_ADMIN_ROLE_FALLBACK];
  _superAdminRoleCodesCache = { codes, loadedAt: Date.now() };
  return codes;
}

/**
 * 提供一个"DB 加载或仅 fallback"的简化入口（无需 supabase 时的兜底）。
 */
export async function loadAdminRoleCodesOrFallback(): Promise<string[]> {
  return loadAdminRoleCodes(null);
}

/**
 * 判断用户的 role 字符串是否是管理员（含 super_admin 的角色代码、中英文兼容）。
 */
export function isUserAdminRole(role: string | null | undefined, allowedRoles?: readonly string[]): boolean {
  if (!role) return false;
  const codes = allowedRoles && allowedRoles.length > 0 ? allowedRoles : ADMIN_ROLE_FALLBACK;
  const normalized = normalizeRole(String(role));
  return codes.some((c) => normalizeRole(String(c)) === normalized);
}

/**
 * 清除模块级缓存（用于测试、调试接口、或运维强制刷新）。
 */
export function clearAdminRoleCodesCache(): void {
  _adminRoleCodesCache = null;
  _superAdminRoleCodesCache = null;
}
