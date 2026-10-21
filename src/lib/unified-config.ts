/**
 * 统一配置读取服务（#[20260831-1700] P1-7）
 *
 * 背景：项目同时存在 site_config（业务配置，约 49 项）与 trade_config（交易/系统配置，约 22 项）
 * 两套配置源，读取代码散落各处，易出现键名冲突、优先级混乱、遗漏同步。
 *
 * 本服务提供统一的读取入口，底层基于迁移 124 创建的 `unified_config` 视图：
 * - key 全局唯一（两表之间不应存在同名 key，否则视图会以 site_config 优先）
 * - 按 category / source_table 可区分归属
 * - 值统一以字符串返回，调用方按 config_type 自行转换
 */
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export interface UnifiedConfigItem {
  config_key: string;
  config_value: string;
  config_type: string;
  category: string;
  description: string | null;
  is_public: boolean;
  is_active: boolean;
  updated_at: string;
  source_table: 'site_config' | 'trade_config';
}

export interface UnifiedConfigQuery {
  key?: string;
  category?: string;
  sourceTable?: 'site_config' | 'trade_config';
  isPublic?: boolean;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

/** 读取全部或按条件筛选的统一配置 */
export async function queryUnifiedConfig(
  params: UnifiedConfigQuery = {}
): Promise<{ items: UnifiedConfigItem[]; total: number }> {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));

  let query = db.from('unified_config').select('*', { count: 'exact' });

  if (params.key) query = query.eq('config_key', params.key);
  if (params.category) query = query.eq('category', params.category);
  if (params.sourceTable) query = query.eq('source_table', params.sourceTable);
  if (params.isPublic !== undefined) query = query.eq('is_public', params.isPublic);
  if (params.isActive !== undefined) query = query.eq('is_active', params.isActive);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('source_table', { ascending: true })
    .order('category', { ascending: true })
    .order('config_key', { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error('[UnifiedConfig] 查询失败:', error.message);
    return { items: [], total: 0 };
  }

  return { items: (data ?? []) as UnifiedConfigItem[], total: count ?? 0 };
}

/** 按 key 读取单个配置；未找到返回 null */
export async function getUnifiedConfig(key: string): Promise<UnifiedConfigItem | null> {
  const { items } = await queryUnifiedConfig({ key, pageSize: 1 });
  return items[0] ?? null;
}

/** 按类型解析配置值 */
export function parseUnifiedConfigValue(item: UnifiedConfigItem): string | number | boolean | Record<string, unknown> | null {
  const { config_value, config_type } = item;
  switch (config_type) {
    case 'number':
      return Number(config_value) || 0;
    case 'boolean':
      return config_value === 'true' || config_value === '1';
    case 'json':
      try {
        return JSON.parse(config_value) as Record<string, unknown>;
      } catch {
        return config_value;
      }
    default:
      return config_value;
  }
}

/** 便捷：读取并解析为指定类型（调用方常用） */
export async function getUnifiedConfigValue<T extends string | number | boolean | Record<string, unknown>>(
  key: string,
  defaultValue: T
): Promise<T> {
  const item = await getUnifiedConfig(key);
  if (!item) return defaultValue;
  const parsed = parseUnifiedConfigValue(item);
  return (parsed as T) ?? defaultValue;
}
