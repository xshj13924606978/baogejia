/**
 * 交易配置分类中文标签字典（#[20260829-2343] 全局汉化-交易配置）
 *
 * 设计要点：
 *  1. 全部从数据库 `trade_config_category_labels` 表（migration 113）加载
 *     —— UI 不再硬编码任何中英映射；后续增删/启停 category_labels，全局实时生效。
 *  2. 5 秒内存缓存：与 admin-role-helper 的实现一致，保证性能同时跨请求刷新。
 *  3. DB 读失败 / 表为空 / 迁移 113 未应用：回退到内置 FALLBACK_LABELS，避免生产 500。
 *  4. 单条查询接口 `getTradeConfigCategoryLabel(code)` 同样走缓存（数据驱动）。
 *  5. 提供 `clearTradeConfigCategoryLabelsCache()` 用于诊断/测试接口强制刷新。
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

interface CategoryLabelsCache {
  /** code -> { name_zh, display_order } */
  map: Record<string, { name_zh: string; display_order: number }>;
  /** 二级缓存：仅含中文名（admin UI / 公开 API 通用） */
  nameMap: Record<string, string>;
  loadedAt: number;
}

let _labelsCache: CategoryLabelsCache | null = null;
const LABELS_CACHE_TTL_MS = 5_000;

/**
 * 内置 fallback（迁移 113 未应用 / DB 读取失败 / 表为空时使用）
 * 包含 trade_config.category CHECK 约束中的全部 7 个 code。
 */
const FALLBACK_LABELS: Readonly<Record<string, { name_zh: string; display_order: number }>> = Object.freeze({
  system:     { name_zh: '系统',  display_order: 1 },
  payment:    { name_zh: '支付',  display_order: 2 },
  membership: { name_zh: '会员',  display_order: 3 },
  token:      { name_zh: 'Token', display_order: 4 },
  brand:      { name_zh: '品牌',  display_order: 5 },
  mall:       { name_zh: '商城',  display_order: 6 },
  withdraw:   { name_zh: '提现',  display_order: 7 },
});

/**
 * 从数据库加载 trade_config_category_labels 全部记录（含 is_active=false 用于诊断）
 */
async function fetchCategoryLabelsFromDB(): Promise<Record<string, { name_zh: string; display_order: number }> | null> {
  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('trade_config_category_labels')
      .select('code, name_zh, display_order, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const map: Record<string, { name_zh: string; display_order: number }> = {};
    for (const row of data) {
      const code = String(row.code);
      map[code] = {
        name_zh: String(row.name_zh),
        display_order: Number(row.display_order) || 0,
      };
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * 取全部 category code -> 中文标签 映射（DB 驱动 + 5s 内存缓存）
 */
export async function loadTradeConfigCategoryLabels(
  options?: { forceRefresh?: boolean }
): Promise<Record<string, string>> {
  if (
    !options?.forceRefresh &&
    _labelsCache &&
    Date.now() - _labelsCache.loadedAt < LABELS_CACHE_TTL_MS
  ) {
    return _labelsCache.nameMap;
  }
  const fromDB = await fetchCategoryLabelsFromDB();
  const merged: Record<string, { name_zh: string; display_order: number }> = {};
  // 1. 先放 fallback（兜底）
  for (const [code, v] of Object.entries(FALLBACK_LABELS)) {
    merged[code] = { ...v };
  }
  // 2. 用 DB 数据覆盖（DB 是权威数据源）
  if (fromDB) {
    for (const [code, v] of Object.entries(fromDB)) {
      merged[code] = v;
    }
  }
  const nameMap: Record<string, string> = {};
  for (const [code, v] of Object.entries(merged)) {
    nameMap[code] = v.name_zh;
  }
  _labelsCache = { map: merged, nameMap, loadedAt: Date.now() };
  return nameMap;
}

/**
 * 取全部（含 display_order）—— 用于 sort/filter 场景
 */
export async function loadTradeConfigCategoryLabelsWithOrder(
  options?: { forceRefresh?: boolean }
): Promise<Record<string, { name_zh: string; display_order: number }>> {
  await loadTradeConfigCategoryLabels(options); // 触发同一次缓存
  if (_labelsCache) return _labelsCache.map;
  const out: Record<string, { name_zh: string; display_order: number }> = {};
  for (const [code, v] of Object.entries(FALLBACK_LABELS)) {
    out[code] = { ...v };
  }
  return out;
}

/**
 * 取单个分类的中文标签（缓存命中则不查 DB）
 */
export async function getTradeConfigCategoryLabel(
  code: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const map = await loadTradeConfigCategoryLabels(options);
  return map[code] || code;
}

/**
 * 清除模块级缓存（用于诊断接口或运维强制刷新）
 */
export function clearTradeConfigCategoryLabelsCache(): void {
  _labelsCache = null;
}
