import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  FIELD_PERMISSION_DEFS,
  MODULE_PERMISSION_DEFS,
  LEVEL_CODE_TO_NUM,
  getDefaultModulePermission,
} from '@/lib/member-permission-defs';
// #202608302400 阶段2：模块权限默认矩阵统一来源（与 permission-gate 运行时一致）
import { MODULE_DEFAULT_PERMISSIONS } from '@/lib/permission-gate';
// #202608302400 阶段3：字段权限变更时清除脱敏缓存
import { clearFieldPermissionCache } from '@/lib/product-visibility';

/**
 * 会员等级 + 字段权限 + 模块权限 统一服务层
 * 数据源: member_levels / member_field_permissions / member_module_permissions
 * 关联: 同步更新 level_definitions（业务层 userLevelService / product-visibility 实时生效）
 * 对话窗: [#20260824-MEMBERSHIP-OPT]
 */

export { FIELD_PERMISSION_DEFS, MODULE_PERMISSION_DEFS, LEVEL_CODE_TO_NUM };
export const NUM_TO_LEVEL_CODE: Record<number, string> = {
  1: 'L0', 2: 'L1', 3: 'L2', 4: 'L3', 5: 'L4',
};

// 接口定义
export interface FieldPermission {
  field_key: string;
  field_label: string;
  has_permission: boolean;
  sort_order: number;
}

export interface ModulePermission {
  module_key: string;
  module_label: string;
  has_permission: boolean;
  sort_order: number;
}

export interface MemberLevelFull {
  level_code: string;
  level_name: string;
  required_points: number;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  daily_quota: number;
  max_files: number;
  max_chat_messages: number;
  description: string | null;
  field_permissions: FieldPermission[];
  module_permissions: ModulePermission[];
  created_at?: string;
  updated_at?: string;
}

export interface MemberLevelInput {
  level_code?: string;
  level_name: string;
  required_points: number;
  sort_order?: number;
  is_default?: boolean;
  is_enabled?: boolean;
  daily_quota?: number;
  max_files?: number;
  max_chat_messages?: number;
  description?: string | null;
}

export interface ChangeLogEntry {
  id: string;
  level_code: string | null;
  action: string;
  change_summary: string | null;
  changed_by: string | null;
  created_at: string;
}

const supabase = getSupabaseClient();

/** 校验并补齐字段权限（缺失项自动补默认 false） */
function normalizeFieldPermissions(
  perms: { field_key: string; has_permission?: boolean; field_label?: string }[],
  sortBase = 0
): FieldPermission[] {
  return FIELD_PERMISSION_DEFS.map((def, idx) => {
    const found = perms.find(p => p.field_key === def.field_key);
    return {
      field_key: def.field_key,
      field_label: def.field_label,
      has_permission: found ? !!found.has_permission : false,
      sort_order: sortBase + idx + 1,
    };
  });
}

/** 校验并补齐模块权限（缺失项自动补默认 false） */
function normalizeModulePermissions(
  perms: { module_key: string; has_permission?: boolean; module_label?: string }[],
  sortBase = 0
): ModulePermission[] {
  return MODULE_PERMISSION_DEFS.map((def, idx) => {
    const found = perms.find(p => p.module_key === def.module_key);
    return {
      module_key: def.module_key,
      module_label: def.module_label,
      has_permission: found ? !!found.has_permission : false,
      sort_order: sortBase + idx + 1,
    };
  });
}

/**
 * 读取用：按 MODULE_PERMISSION_DEFS 全量补齐模块权限（#202608302500）
 *
 * 背景：member_module_permissions 表仅种子了 5 个模块（迁移 073），
 *   阶段2 新增的 enhance_proposal / knowledge_download / data_export / customer_manage
 *   在 DB 中无行 → 后台「等级权限配置」页只渲染出 5 个模块开关。
 *
 * 缺失行不补 false（会与运行时拦截网关的默认矩阵判定不一致，导致后台显示"关闭"
 *   但实际放行），改为取 MODULE_DEFAULT_PERMISSIONS 默认值，保证
 *   「后台显示」与「运行时判定」完全一致。DB 已配置的模块仍以 DB 为准。
 */
function mergeModulePermissions(
  perms: { module_key: string; has_permission?: boolean; module_label?: string; sort_order?: number }[],
  levelCode: string
): ModulePermission[] {
  return MODULE_PERMISSION_DEFS.map((def, idx) => {
    const found = perms.find(p => p.module_key === def.module_key);
    return {
      module_key: def.module_key,
      module_label: found?.module_label || def.module_label,
      has_permission: found
        ? !!found.has_permission
        : getDefaultModulePermission(def.module_key, levelCode),
      sort_order: found?.sort_order ?? idx + 1,
    };
  });
}

/** 写入变更日志 */
export async function recordChangeLog(
  levelCode: string | null,
  action: string,
  summary: string,
  changedBy: string | null
): Promise<void> {
  try {
    await supabase.from('member_level_change_log').insert({
      level_code: levelCode,
      action,
      change_summary: summary,
      changed_by: changedBy,
    });
  } catch (err) {
    console.error('[member-level-service] 写入变更日志失败:', err);
  }
}

/** 同步单个等级到 level_definitions（业务层实时生效） */
async function syncToLevelDefinitions(
  levelCode: string,
  data: Partial<MemberLevelInput>,
  fieldPermissions?: FieldPermission[]
): Promise<void> {
  const num = LEVEL_CODE_TO_NUM[levelCode];
  if (!num) return;

  const updatePayload: Record<string, any> = {};
  if (data.level_name !== undefined) updatePayload.name = data.level_name;
  if (data.required_points !== undefined) updatePayload.required_points = data.required_points;
  if (data.daily_quota !== undefined) updatePayload.daily_quota = data.daily_quota;
  if (data.max_files !== undefined) updatePayload.max_files = data.max_files;
  if (data.max_chat_messages !== undefined) updatePayload.max_chat_messages = data.max_chat_messages;

  if (fieldPermissions) {
    const byKey: Record<string, boolean> = {};
    for (const fp of fieldPermissions) byKey[fp.field_key] = fp.has_permission;
    updatePayload.can_view_min_price = byKey.can_view_min_price ?? false;
    updatePayload.can_view_cost_price = byKey.can_view_cost_price ?? false;
    updatePayload.can_view_manufacturer = byKey.can_view_manufacturer ?? false;
    updatePayload.can_view_contact = byKey.can_view_contact ?? false;
    updatePayload.can_view_phone = byKey.can_view_phone ?? false;
  }

  if (Object.keys(updatePayload).length > 0) {
    await supabase.from('level_definitions').update(updatePayload).eq('level', num);
  }
}

/** 获取所有等级（含字段权限 + 模块权限） */
export async function getAllMemberLevels(): Promise<MemberLevelFull[]> {
  const [levelsRes, fieldsRes, modulesRes] = await Promise.all([
    supabase.from('member_levels').select('*').order('sort_order'),
    supabase.from('member_field_permissions').select('*').order('sort_order'),
    supabase.from('member_module_permissions').select('*').order('sort_order'),
  ]);

  const levels = levelsRes.data || [];
  const fields = fieldsRes.data || [];
  const modules = modulesRes.data || [];

  return levels.map(l => ({
    level_code: l.level_code,
    level_name: l.level_name,
    required_points: l.required_points,
    sort_order: l.sort_order,
    is_default: l.is_default,
    is_enabled: l.is_enabled,
    daily_quota: l.daily_quota,
    max_files: l.max_files,
    max_chat_messages: l.max_chat_messages,
    description: l.description,
    created_at: l.created_at,
    updated_at: l.updated_at,
    field_permissions: fields
      .filter(f => f.level_code === l.level_code)
      .map(f => ({
        field_key: f.field_key,
        field_label: f.field_label,
        has_permission: f.has_permission,
        sort_order: f.sort_order,
      })),
    // #202608302500：全量补齐 9 个模块（DB 缺失的取默认矩阵值）
    module_permissions: mergeModulePermissions(
      modules.filter(m => m.level_code === l.level_code),
      l.level_code
    ),
  }));
}

/** 获取单个等级 */
export async function getMemberLevel(levelCode: string): Promise<MemberLevelFull | null> {
  const { data: level } = await supabase
    .from('member_levels')
    .select('*')
    .eq('level_code', levelCode)
    .single();

  if (!level) return null;

  const { data: fields } = await supabase
    .from('member_field_permissions')
    .select('*')
    .eq('level_code', levelCode)
    .order('sort_order');
  const { data: modules } = await supabase
    .from('member_module_permissions')
    .select('*')
    .eq('level_code', levelCode)
    .order('sort_order');

  return {
    level_code: level.level_code,
    level_name: level.level_name,
    required_points: level.required_points,
    sort_order: level.sort_order,
    is_default: level.is_default,
    is_enabled: level.is_enabled,
    daily_quota: level.daily_quota,
    max_files: level.max_files,
    max_chat_messages: level.max_chat_messages,
    description: level.description,
    created_at: level.created_at,
    updated_at: level.updated_at,
    field_permissions: (fields || []).map(f => ({
      field_key: f.field_key,
      field_label: f.field_label,
      has_permission: f.has_permission,
      sort_order: f.sort_order,
    })),
    // #202608302500：全量补齐 9 个模块（DB 缺失的取默认矩阵值）
    module_permissions: mergeModulePermissions(modules || [], levelCode),
  };
}

/** 创建新等级（自动补齐字段/模块权限） */
export async function createMemberLevel(input: MemberLevelInput, changedBy: string | null): Promise<MemberLevelFull> {
  const levelCode = input.level_code || `L${Date.now()}`;

  const { data: level, error } = await supabase
    .from('member_levels')
    .insert({
      level_code: levelCode,
      level_name: input.level_name,
      required_points: input.required_points ?? 0,
      sort_order: input.sort_order ?? 99,
      is_default: input.is_default ?? false,
      is_enabled: input.is_enabled ?? true,
      daily_quota: input.daily_quota ?? 0,
      max_files: input.max_files ?? 0,
      max_chat_messages: input.max_chat_messages ?? 0,
      description: input.description ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // 初始化权限数据（默认全无权限）
  const fieldPerms = normalizeFieldPermissions([], 0);
  const modulePerms = normalizeModulePermissions([], 0);

  await supabase.from('member_field_permissions').insert(
    fieldPerms.map(fp => ({ level_code: levelCode, ...fp }))
  );
  await supabase.from('member_module_permissions').insert(
    modulePerms.map(mp => ({ level_code: levelCode, ...mp }))
  );

  await recordChangeLog(levelCode, 'create', `创建等级「${input.level_name}」(${levelCode})`, changedBy);

  return getMemberLevel(levelCode) as Promise<MemberLevelFull>;
}

/** 更新等级基础信息（名称/所需积分/配额），同步 level_definitions */
export async function updateMemberLevel(
  levelCode: string,
  input: Partial<MemberLevelInput>,
  changedBy: string | null
): Promise<MemberLevelFull | null> {
  const exists = await getMemberLevel(levelCode);
  if (!exists) return null;

  const updatePayload: Record<string, any> = {};
  if (input.level_name !== undefined) updatePayload.level_name = input.level_name;
  if (input.required_points !== undefined) updatePayload.required_points = input.required_points;
  if (input.sort_order !== undefined) updatePayload.sort_order = input.sort_order;
  if (input.is_default !== undefined) updatePayload.is_default = input.is_default;
  if (input.is_enabled !== undefined) updatePayload.is_enabled = input.is_enabled;
  if (input.daily_quota !== undefined) updatePayload.daily_quota = input.daily_quota;
  if (input.max_files !== undefined) updatePayload.max_files = input.max_files;
  if (input.max_chat_messages !== undefined) updatePayload.max_chat_messages = input.max_chat_messages;
  if (input.description !== undefined) updatePayload.description = input.description;

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabase
      .from('member_levels')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('level_code', levelCode);
    if (error) throw new Error(error.message);
  }

  // 同步业务表
  await syncToLevelDefinitions(levelCode, updatePayload);

  const parts: string[] = [];
  if (input.level_name !== undefined) parts.push(`名称→${input.level_name}`);
  if (input.required_points !== undefined) parts.push(`所需积分→${input.required_points}`);
  if (parts.length > 0) {
    await recordChangeLog(levelCode, 'update', `更新等级 ${levelCode}: ${parts.join('，')}`, changedBy);
  }

  return getMemberLevel(levelCode);
}

/** 批量更新字段权限，同步 level_definitions（仅更新传入项，未传入项保留） */
export async function updateFieldPermissions(
  levelCode: string,
  perms: { field_key: string; has_permission?: boolean }[],
  changedBy: string | null
): Promise<FieldPermission[] | null> {
  const exists = await getMemberLevel(levelCode);
  if (!exists) return null;

  if (perms.length > 0) {
    const defsIndex: Record<string, number> = Object.fromEntries(
      FIELD_PERMISSION_DEFS.map((def, idx) => [def.field_key, idx + 1])
    );
    for (const p of perms) {
      const def = FIELD_PERMISSION_DEFS.find(f => f.field_key === p.field_key);
      if (!def) continue;
      const current = exists.field_permissions.find(fp => fp.field_key === p.field_key);
      await supabase.from('member_field_permissions').upsert(
        {
          level_code: levelCode,
          field_key: p.field_key,
          field_label: def.field_label,
          has_permission: !!p.has_permission,
          sort_order: current?.sort_order ?? defsIndex[p.field_key] ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'level_code,field_key' }
      );
    }
  }

  // 读取最新全量，同步业务表
  const { data: latest } = await supabase
    .from('member_field_permissions')
    .select('*')
    .eq('level_code', levelCode)
    .order('sort_order');
  const normalized = normalizeFieldPermissions(
    (latest || []).map(fp => ({ field_key: fp.field_key, has_permission: fp.has_permission })),
    0
  );
  await syncToLevelDefinitions(levelCode, {}, normalized);

  // #202608302400 阶段3：字段权限已变更，清除 product-visibility 的等级字段权限缓存，
  //   使产品脱敏立即生效（否则最长延迟 60s）
  clearFieldPermissionCache(levelCode);

  const changed = perms.filter(p => {
    const old = exists.field_permissions.find(o => o.field_key === p.field_key);
    return old && old.has_permission !== !!p.has_permission;
  });
  if (changed.length > 0) {
    const summary = changed
      .map(p => {
        const label = FIELD_PERMISSION_DEFS.find(f => f.field_key === p.field_key)?.field_label || p.field_key;
        return `${label}${p.has_permission ? '✅' : '❌'}`;
      })
      .join('，');
    await recordChangeLog(levelCode, 'update', `更新字段权限: ${summary}`, changedBy);
  }

  return normalized;
}

/** 批量更新模块权限（仅更新传入项，未传入项保留） */
export async function updateModulePermissions(
  levelCode: string,
  perms: { module_key: string; has_permission?: boolean }[],
  changedBy: string | null
): Promise<ModulePermission[] | null> {
  const exists = await getMemberLevel(levelCode);
  if (!exists) return null;

  if (perms.length > 0) {
    const defsIndex: Record<string, number> = Object.fromEntries(
      MODULE_PERMISSION_DEFS.map((def, idx) => [def.module_key, idx + 1])
    );
    for (const p of perms) {
      const def = MODULE_PERMISSION_DEFS.find(m => m.module_key === p.module_key);
      if (!def) continue;
      const current = exists.module_permissions.find(mp => mp.module_key === p.module_key);
      await supabase.from('member_module_permissions').upsert(
        {
          level_code: levelCode,
          module_key: p.module_key,
          module_label: def.module_label,
          has_permission: !!p.has_permission,
          sort_order: current?.sort_order ?? defsIndex[p.module_key] ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'level_code,module_key' }
      );
    }
  }

  const { data: latest } = await supabase
    .from('member_module_permissions')
    .select('*')
    .eq('level_code', levelCode)
    .order('sort_order');
  const normalized = normalizeModulePermissions(
    (latest || []).map(mp => ({ module_key: mp.module_key, has_permission: mp.has_permission })),
    0
  );

  const changed = perms.filter(p => {
    const old = exists.module_permissions.find(o => o.module_key === p.module_key);
    return old && old.has_permission !== !!p.has_permission;
  });
  if (changed.length > 0) {
    const summary = changed
      .map(p => {
        const label = MODULE_PERMISSION_DEFS.find(m => m.module_key === p.module_key)?.module_label || p.module_key;
        return `${label}${p.has_permission ? '✅' : '❌'}`;
      })
      .join('，');
    await recordChangeLog(levelCode, 'update', `更新模块权限: ${summary}`, changedBy);
  }

  return normalized;
}

/** 批量更新所有等级（名称/积分/字段权限/模块权限） */
export async function batchUpdateMemberLevels(
  items: {
    level_code: string;
    level_name?: string;
    required_points?: number;
    daily_quota?: number;
    max_files?: number;
    max_chat_messages?: number;
    field_permissions?: { field_key: string; has_permission?: boolean }[];
    module_permissions?: { module_key: string; has_permission?: boolean }[];
  }[],
  changedBy: string | null
): Promise<{ success: boolean; updated: number; failed: string[] }> {
  let updated = 0;
  const failed: string[] = [];

  for (const item of items) {
    try {
      const exists = await getMemberLevel(item.level_code);
      if (!exists) {
        failed.push(item.level_code);
        continue;
      }

      const updatePayload: Record<string, any> = {};
      if (item.level_name !== undefined) updatePayload.level_name = item.level_name;
      if (item.required_points !== undefined) updatePayload.required_points = item.required_points;
      if (item.daily_quota !== undefined) updatePayload.daily_quota = item.daily_quota;
      if (item.max_files !== undefined) updatePayload.max_files = item.max_files;
      if (item.max_chat_messages !== undefined) updatePayload.max_chat_messages = item.max_chat_messages;

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('member_levels')
          .update({ ...updatePayload, updated_at: new Date().toISOString() })
          .eq('level_code', item.level_code);
        await syncToLevelDefinitions(item.level_code, updatePayload);
      }

      if (item.field_permissions) {
        await updateFieldPermissions(item.level_code, item.field_permissions, null);
      }
      if (item.module_permissions) {
        await updateModulePermissions(item.level_code, item.module_permissions, null);
      }

      updated++;
    } catch (err) {
      console.error(`[member-level-service] 批量更新失败 ${item.level_code}:`, err);
      failed.push(item.level_code);
    }
  }

  if (updated > 0) {
    await recordChangeLog(null, 'batch', `批量更新 ${updated} 个等级`, changedBy);
  }

  return { success: failed.length === 0, updated, failed };
}

/** 删除等级（级联删除权限配置） */
export async function deleteMemberLevel(levelCode: string, changedBy: string | null): Promise<boolean> {
  const exists = await getMemberLevel(levelCode);
  if (!exists) return false;
  if (exists.is_default) {
    throw new Error('默认等级不可删除');
  }

  const { error } = await supabase.from('member_levels').delete().eq('level_code', levelCode);
  if (error) throw new Error(error.message);

  await recordChangeLog(levelCode, 'delete', `删除等级「${exists.level_name}」(${levelCode})`, changedBy);
  return true;
}

/** 获取变更历史 */
export async function getChangeLog(levelCode?: string): Promise<ChangeLogEntry[]> {
  let query = supabase.from('member_level_change_log').select('*').order('created_at', { ascending: false }).limit(100);
  if (levelCode) {
    query = supabase
      .from('member_level_change_log')
      .select('*')
      .eq('level_code', levelCode)
      .order('created_at', { ascending: false })
      .limit(50);
  }
  const { data } = await query;
  return (data || []).map(d => ({
    id: d.id,
    level_code: d.level_code,
    action: d.action,
    change_summary: d.change_summary,
    changed_by: d.changed_by,
    created_at: d.created_at,
  }));
}

/** 恢复默认配置（重置 3 张表为迁移种子数据） */
export async function resetToDefaults(changedBy: string | null): Promise<boolean> {
  const seed = await getAllMemberLevels();
  if (seed.length === 0) return false;

  // 重置为初始矩阵
  const resetField = async (levelCode: string) => {
    const defaults: Record<string, Record<string, boolean>> = {
      L0: {}, L1: { can_view_min_price: true }, L2: { can_view_min_price: true, can_view_manufacturer: true, can_view_contact: true },
      L3: { can_view_min_price: true, can_view_cost_price: true, can_view_manufacturer: true, can_view_contact: true },
      L4: { can_view_min_price: true, can_view_cost_price: true, can_view_manufacturer: true, can_view_contact: true, can_view_phone: true },
    };
    const perms = FIELD_PERMISSION_DEFS.map((def, idx) => ({
      field_key: def.field_key,
      field_label: def.field_label,
      has_permission: (defaults[levelCode] || {})[def.field_key] || false,
      sort_order: idx + 1,
    }));
    for (const fp of perms) {
      await supabase.from('member_field_permissions').upsert(
        { level_code: levelCode, ...fp, updated_at: new Date().toISOString() },
        { onConflict: 'level_code,field_key' }
      );
    }
    await syncToLevelDefinitions(levelCode, {}, perms);
    return perms;
  };

  const resetModule = async (levelCode: string) => {
    // #202608302400 阶段2：重置默认值统一取自 permission-gate 的 MODULE_DEFAULT_PERMISSIONS，
    //   保证「后台重置结果」与「运行时拦截判定」完全一致（旧实现为硬编码）
    const levelNum = LEVEL_CODE_TO_NUM[levelCode] ?? 1;
    const perms = MODULE_PERMISSION_DEFS.map((def, idx) => {
      const matrix = MODULE_DEFAULT_PERMISSIONS[def.module_key];
      const has_permission = matrix
        ? (matrix[levelNum - 1] ?? true)
        : def.module_key !== 'edit' && def.module_key !== 'preview';
      return {
        module_key: def.module_key,
        module_label: def.module_label,
        has_permission,
        sort_order: idx + 1,
      };
    });
    for (const mp of perms) {
      await supabase.from('member_module_permissions').upsert(
        { level_code: levelCode, ...mp, updated_at: new Date().toISOString() },
        { onConflict: 'level_code,module_key' }
      );
    }
    return perms;
  };

  for (const level of seed) {
    await resetField(level.level_code);
    await resetModule(level.level_code);
  }

  // #202608302400 阶段3：重置后清空全部字段权限缓存，使脱敏立即生效
  clearFieldPermissionCache();

  await recordChangeLog(null, 'reset', '恢复默认等级权限配置', changedBy);
  return true;
}
