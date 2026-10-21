// ============================================================
// 交易配置中心 服务层（阶段四 #202608292700-统一订单与后台管理）
//
// 职责：
// - 读取配置（公开端点返回，供前端动态生效）
// - 管理端全部配置 CRUD（更新/创建，updated_by 记录操作人）
// 配置按 category 组织：system/payment/membership/token/brand/mall/withdraw
// ============================================================

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * #20260829-2343 全局汉化-交易配置
 *
 * 历史说明：本文件原本在最顶部硬编码导出 `TRADE_CONFIG_CATEGORY_LABEL` 常量对象
 * （中文标签写死在源码中）。该常量已下线，category code 的中文标签改为：
 *   - 优先从 `trade_config_category_labels` 表（迁移 113）实时读取
 *   - 失败/未应用迁移时回退到内置 FALLBACK（见 trade-config-category-label-service.ts）
 * UI 层从管理端 API `/api/admin/trade/config` 的 `category_labels` 字段获取翻译。
 *
 * 完整 category 由 trade_config.category 字段决定（CHECK 约束含
 * system/payment/membership/token/brand/mall/withdraw 7 项）。
 */

/** 读取单个配置值（解析 JSON），不存在返回 fallback */
export async function getTradeConfigValue<T = any>(key: string, fallback?: T): Promise<T | undefined> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from('trade_config').select('config_value').eq('config_key', key).maybeSingle();
  if (error || !data) return fallback;
  return data.config_value as T;
}

/** 读取全部激活配置（公开：返回 key → value 映射） */
export async function getActiveTradeConfigMap(): Promise<Record<string, any>> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('trade_config')
    .select('config_key, config_value, category, description')
    .eq('is_active', true);
  if (error || !data) return {};
  const map: Record<string, any> = {};
  for (const row of data) {
    map[row.config_key] = row.config_value;
  }
  return map;
}

/** 管理端：读取全部配置（含未激活，分页） */
export async function getAdminTradeConfigs(options: { category?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize || 50));
  const db = getSupabaseServiceClient();

  let query = db
    .from('trade_config')
    .select('*, updater:updated_by(id, username, email)', { count: 'exact' });
  if (options.category && options.category !== 'all') {
    query = query.eq('category', options.category);
  }

  const { data, count, error } = await query
    .order('category', { ascending: true })
    .order('config_key', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) {
    console.error('[TradeConfig] 查询配置失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  return { records: data || [], total: count || 0 };
}

/** 管理端：更新配置 */
export async function updateTradeConfig(key: string, input: { config_value?: any; description?: string; category?: string; config_type?: string; is_active?: boolean }, operatorId?: string) {
  const db = getSupabaseServiceClient();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.config_value !== undefined) patch.config_value = input.config_value;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.config_type !== undefined) patch.config_type = input.config_type;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (operatorId) patch.updated_by = operatorId;

  const { data, error } = await db.from('trade_config').update(patch).eq('config_key', key).select().single();
  if (error) {
    console.error('[TradeConfig] 更新配置失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, record: data };
}

/**
 * 管理端：幂等写入配置（#202608302200 配置数据动态同步）
 * 统一数据源 trade_config 的写入口：key 不存在则创建，存在则更新。
 * 供各配置页面（积分兑换规则 / 提现配置等）与 trade_config 保持一致。
 */
export async function upsertTradeConfig(input: {
  config_key: string;
  config_value: any;
  config_type?: string;
  description?: string;
  category?: string;
  is_active?: boolean;
}, operatorId?: string) {
  const db = getSupabaseServiceClient();
  // updated_by 是 UUID+FK users.id：仅当操作人 ID 为合法 UUID 时写入，避免非注册账号（本地 token user-<ts>-<rand>）触发外键失败
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeOperatorId = operatorId && UUID_REGEX.test(operatorId) ? operatorId : null;
  const { data, error } = await db
    .from('trade_config')
    .upsert(
      {
        config_key: input.config_key,
        config_value: input.config_value,
        config_type: input.config_type || 'json',
        description: input.description || null,
        category: input.category || 'system',
        is_active: input.is_active ?? true,
        updated_by: safeOperatorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'config_key' }
    )
    .select()
    .single();
  if (error) {
    console.error('[TradeConfig] 幂等写入配置失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, record: data };
}

/** 管理端：创建配置 */
export async function createTradeConfig(input: {
  config_key: string;
  config_value: any;
  config_type?: string;
  description?: string;
  category?: string;
  is_active?: boolean;
}, operatorId?: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('trade_config')
    .insert({
      config_key: input.config_key,
      config_value: input.config_value,
      config_type: input.config_type || 'json',
      description: input.description || null,
      category: input.category || 'system',
      is_active: input.is_active ?? true,
      updated_by: operatorId || null,
    })
    .select()
    .single();
  if (error) {
    console.error('[TradeConfig] 创建配置失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, record: data };
}
