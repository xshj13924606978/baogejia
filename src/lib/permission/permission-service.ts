/**
 * 用户权限计算服务
 * 权限优先级：用户个性化覆盖 (priority=5) > 角色权限 (10) > 等级默认权限 (20) > 系统默认配置
 *
 * 数据库表：permission_overrides
 *   - is_visible  BOOLEAN  -- 是否可见
 *   - is_editable BOOLEAN  -- 是否可编辑（仅字段有意义）
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// ── 类型定义 ──

export interface FieldPermission {
  visible: boolean;
  editable: boolean;
}

export interface UserPermissions {
  modules: Record<string, boolean>;              // { module_key: visible }
  pages: Record<string, boolean>;                 // { page_key: visible }
  fields: Record<string, FieldPermission>;        // { "page_key:field_key": {visible, editable} }
  actions: Record<string, boolean>;               // { "page_key:action_key": visible }
}

interface OverrideRule {
  target_type: string;
  target_id: string;
  permission_type: string;
  permission_key: string;
  is_visible: boolean | null;
  is_editable: boolean | null;
  priority: number;
}

// ── 缓存 ──

const permCache = new Map<string, { perms: UserPermissions; ts: number }>();
const CACHE_TTL = 60_000; // 1 分钟

// ── 权限优先级常量 ──

const PRIORITY: Record<string, number> = { user: 5, role: 10, level: 20 };

/**
 * 获取用户完整权限配置（带缓存）
 */
export async function getUserPermissions(
  userId: string,
  userRole?: string,
  userLevel?: number
): Promise<UserPermissions> {
  // 检查缓存
  const cached = permCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.perms;

  const db = getSupabaseServiceClient();

  // 1. 查询所有与该用户相关的覆盖规则
  const conditions: string[] = [];
  conditions.push(`target_type.eq.${userId},${userId}`.length > 0 ? `target_type.eq.user,target_id.eq.${userId}` : '');

  // 用 or 条件组装
  const orParts: string[] = [`target_type.eq.user,target_id.eq.${userId}`];
  if (userRole) {
    orParts.push(`target_type.eq.role,target_id.eq.${userRole}`);
  }
  if (userLevel && userLevel > 0) {
    orParts.push(`target_type.eq.level,target_id.eq.${String(userLevel)}`);
  }

  const { data: rules, error } = await db
    .from('permission_overrides')
    .select('*')
    .or(orParts.join(','));

  if (error) {
    console.error('[PermissionService] 查询规则失败:', error);
    return defaultPermissions();
  }

  // 按优先级排序（数字越小越高）
  const sorted = (rules || []) as OverrideRule[];
  sorted.sort((a, b) => a.priority - b.priority);

  // 2. 查询系统默认配置（启用的模块/页面/字段/按钮）
  const { data: defaultModules } = await db
    .from('system_modules')
    .select('module_key, is_enabled, is_visible_in_menu')
    .eq('is_enabled', true);

  const { data: defaultPages } = await db
    .from('system_pages')
    .select('page_key, module_id, is_enabled')
    .eq('is_enabled', true);

  // JOIN 页面获取 page_key，用于构建复合键
  const { data: defaultFields } = await db
    .from('system_fields')
    .select('field_key, page_id, is_visible, is_editable, system_pages!page_id(page_key)');

  const { data: defaultActions } = await db
    .from('system_actions')
    .select('action_key, page_id, is_visible, system_pages!page_id(page_key)');

  // 3. 构建默认权限
  const perms = defaultPermissions();

  for (const m of defaultModules || []) {
    perms.modules[m.module_key] = true;
  }

  for (const p of defaultPages || []) {
    perms.pages[p.page_key] = true;
  }

  for (const f of defaultFields || []) {
    const pageKey = (f as any).system_pages?.page_key || '';
    const compositeKey = pageKey ? `${pageKey}:${f.field_key}` : f.field_key;
    perms.fields[compositeKey] = { visible: f.is_visible, editable: f.is_editable };
  }

  for (const a of defaultActions || []) {
    const pageKey = (a as any).system_pages?.page_key || '';
    const compositeKey = pageKey ? `${pageKey}:${a.action_key}` : a.action_key;
    perms.actions[compositeKey] = a.is_visible;
  }

  // 4. 应用覆盖规则（按优先级从高到低，低优先级不会覆盖高优先级的显式设置）
  for (const rule of sorted) {
    switch (rule.permission_type) {
      case 'module':
        if (rule.is_visible !== null) perms.modules[rule.permission_key] = rule.is_visible;
        break;
      case 'page':
        if (rule.is_visible !== null) perms.pages[rule.permission_key] = rule.is_visible;
        break;
      case 'field': {
        if (!perms.fields[rule.permission_key]) {
          perms.fields[rule.permission_key] = { visible: true, editable: true };
        }
        if (rule.is_visible !== null) perms.fields[rule.permission_key].visible = rule.is_visible;
        if (rule.is_editable !== null) perms.fields[rule.permission_key].editable = rule.is_editable;
        break;
      }
      case 'action':
        if (rule.is_visible !== null) perms.actions[rule.permission_key] = rule.is_visible;
        break;
    }
  }

  // 写入缓存
  permCache.set(userId, { perms, ts: Date.now() });

  return perms;
}

/**
 * 检查用户能否访问某个模块
 */
export async function canAccessModule(
  userId: string,
  moduleKey: string,
  userRole?: string,
  userLevel?: number
): Promise<boolean> {
  const perms = await getUserPermissions(userId, userRole, userLevel);
  return perms.modules[moduleKey] !== false;
}

/**
 * 检查用户能否访问某个页面
 */
export async function canAccessPage(
  userId: string,
  pageKey: string,
  userRole?: string,
  userLevel?: number
): Promise<boolean> {
  const perms = await getUserPermissions(userId, userRole, userLevel);
  return perms.pages[pageKey] !== false;
}

/**
 * 获取用户对某个字段的权限
 */
export async function getFieldPermission(
  userId: string,
  fieldKey: string,
  userRole?: string,
  userLevel?: number
): Promise<FieldPermission> {
  const perms = await getUserPermissions(userId, userRole, userLevel);
  return perms.fields[fieldKey] || { visible: true, editable: true };
}

/**
 * 检查用户能否使用某个操作按钮
 */
export async function canUseAction(
  userId: string,
  actionKey: string,
  userRole?: string,
  userLevel?: number
): Promise<boolean> {
  const perms = await getUserPermissions(userId, userRole, userLevel);
  return perms.actions[actionKey] !== false;
}

/**
 * 清除用户权限缓存（配置变更时调用）
 */
export function clearUserCache(userId?: string): void {
  if (userId) {
    permCache.delete(userId);
  } else {
    permCache.clear();
  }
}

/**
 * 清除指定维度下所有关联用户的缓存（配置变更时批量清除）
 */
export async function clearCacheByTarget(
  targetType: string,
  targetId: string
): Promise<number> {
  let cleared = 0;

  if (targetType === 'user') {
    permCache.delete(targetId);
    cleared = 1;
  } else {
    // role / level 维度：清除所有缓存（保守策略）
    permCache.clear();
    cleared = -1; // -1 表示全部清除
  }

  return cleared;
}

/**
 * 获取用户的角色和等级信息（从 users 表）
 */
export async function getUserRoleAndLevel(userId: string): Promise<{ role: string; level: number }> {
  const db = getSupabaseServiceClient();
  const { data } = await db.from('users').select('role, metadata').eq('id', userId).single();
  if (!data) return { role: '', level: 0 };
  return {
    role: data.role || '',
    level: (data.metadata as any)?.level || 0,
  };
}

// ── 内部工具 ──

function defaultPermissions(): UserPermissions {
  return { modules: {}, pages: {}, fields: {}, actions: {} };
}
