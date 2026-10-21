/**
 * 资料中心积分扣费 + 积分分成服务
 *
 * 需求：#20260816001 资料中心权限控制与积分分成机制
 *
 * - 扣费规则：points_download_config 表按 资源类型 + 动作 + 角色 配置积分数
 *   document.download=10 / standard.download=10 / drawing.download=15 / quota.view=5
 * - 分成规则：下载者扣分后，70% 给上传者、30% 归平台（site_config 可配，实时生效）
 * - 自上传资源不扣费、不分成
 * - 幂等：扣费与分成均使用 reference_id 防止重复
 */

import { pointsService } from '@/lib/points-service';
import { getTradeConfigValue } from '@/lib/trade-config-service';

export type KnowledgeResourceType = 'document' | 'standard' | 'drawing' | 'quota';
export type KnowledgeActionType = 'download' | 'view';

export interface DownloadCostConfig {
  id: string;
  resource_type: string;
  action_type: string;
  role: string | null;
  cost: number;
  is_enabled: boolean;
  description?: string | null;
}

// 内置默认扣费（与迁移 050 种子数据一致，防止配置表被误删时功能失效）
export const DEFAULT_DOWNLOAD_COSTS: Record<string, number> = {
  'document:download': 10,
  'standard:download': 10,
  'drawing:download': 15,
  'quota:view': 5,
  'quota:download': 5,
};

/**
 * 读取扣费配置：优先按角色精确匹配，其次取该资源类型的全局默认，最后回退内置默认
 */
export async function getDownloadCostConfig(
  db: any,
  resourceType: string,
  actionType: string,
  role?: string | null
): Promise<DownloadCostConfig | null> {
  try {
    // 1. 角色精确匹配
    if (role) {
      const { data: roleCfg, error } = await db
        .from('points_download_config')
        .select('*')
        .eq('resource_type', resourceType)
        .eq('action_type', actionType)
        .eq('is_enabled', true)
        .eq('role', role)
        .maybeSingle();
      if (!error && roleCfg) return roleCfg;
    }
    // 2. 全局默认
    const { data: globalCfg, error: gErr } = await db
      .from('points_download_config')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('action_type', actionType)
      .eq('is_enabled', true)
      .is('role', null)
      .maybeSingle();
    if (!gErr && globalCfg) return globalCfg;
  } catch (e) {
    console.error('[PointsDownload] 读取扣费配置异常:', e);
  }
  return null;
}

/**
 * 读取某资源类型的实际扣费积分数（返回内置默认兜底）
 */
export async function getDownloadCostValue(
  db: any,
  resourceType: string,
  actionType: string,
  role?: string | null
): Promise<number> {
  const cfg = await getDownloadCostConfig(db, resourceType, actionType, role);
  if (cfg) return cfg.cost;
  return DEFAULT_DOWNLOAD_COSTS[`${resourceType}:${actionType}`] ?? 0;
}

/**
 * 读取分成比例（#202608302200 配置数据动态同步）
 * 统一数据源 trade_config（points.split_rates）优先，site_config 仅作历史回退，
 * 默认 0.7 / 0.3。
 */
export async function getSplitRates(db: any): Promise<{ creatorRate: number; platformRate: number }> {
  try {
    // 1) 统一数据源：trade_config
    const tc = await getTradeConfigValue<{ creator_rate?: number; platform_rate?: number }>('points.split_rates');
    if (tc && (typeof tc.creator_rate === 'number' || typeof tc.platform_rate === 'number')) {
      const creatorRate =
        typeof tc.creator_rate === 'number' && Number.isFinite(tc.creator_rate)
          ? tc.creator_rate
          : 1 - (typeof tc.platform_rate === 'number' && Number.isFinite(tc.platform_rate) ? tc.platform_rate : 0.3);
      const platformRate =
        typeof tc.platform_rate === 'number' && Number.isFinite(tc.platform_rate)
          ? tc.platform_rate
          : 1 - creatorRate;
      return { creatorRate, platformRate };
    }

    // 2) 兼容回退：site_config
    const { data } = await db
      .from('site_config')
      .select('config_key, config_value')
      .in('config_key', ['points_split_creator_rate', 'points_split_platform_rate']);
    const map: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const v = parseFloat(row.config_value);
      if (!Number.isNaN(v)) map[row.config_key] = v;
    });
    const creatorRate = map['points_split_creator_rate'] ?? 0.7;
    const platformRate = map['points_split_platform_rate'] ?? 0.3;
    return { creatorRate, platformRate };
  } catch (e) {
    console.error('[PointsDownload] 读取分成比例异常:', e);
    return { creatorRate: 0.7, platformRate: 0.3 };
  }
}

export interface ConsumeResourceResult {
  success: boolean;
  reason?: string;
  /** 本次消费的积分数（自上传或免费资源为 0） */
  cost: number;
  /** 上传者分成积分 */
  creatorShare: number;
  /** 平台分成积分 */
  platformShare: number;
  /** 是否产生了上传者分成 */
  split: boolean;
}

export interface ConsumeResourceParams {
  db: any;
  /** 知识条目（必须包含 id/type/user_id） */
  entry: { id: string; type: string; user_id?: string | null };
  actionType: KnowledgeActionType;
  currentUserId?: string | null;
  effectiveRole?: string | null;
  /** 扣费说明，默认自动生成 */
  description?: string;
}

/**
 * 消费知识资源：扣费 + 分成 + 分成记录落库（一次性完成）
 *
 * 流程：
 * 1. 自上传（entry.user_id === currentUserId）→ 不扣费不分成，直接成功
 * 2. 读取扣费配置（按类型+动作+角色）→ cost<=0 视为免费
 * 3. 原子扣费（幂等键 download:{userId}:{entryId}:{action}）
 * 4. 扣费成功后按比例分成（幂等键 split:{userId}:{entryId}:{action}）
 * 5. 写 points_split_records 流水
 */
export async function consumeKnowledgeResource(
  params: ConsumeResourceParams
): Promise<ConsumeResourceResult> {
  const { db, entry, actionType, currentUserId, effectiveRole, description } = params;

  // 自上传：不扣费不分成
  if (currentUserId && entry.user_id && entry.user_id === currentUserId) {
    return { success: true, cost: 0, creatorShare: 0, platformShare: 0, split: false };
  }

  if (!currentUserId) {
    return { success: false, reason: '未登录，无法消费资料', cost: 0, creatorShare: 0, platformShare: 0, split: false };
  }

  const cost = await getDownloadCostValue(db, entry.type, actionType, effectiveRole);
  if (cost <= 0) {
    return { success: true, cost: 0, creatorShare: 0, platformShare: 0, split: false };
  }

  const actionLabel = actionType === 'view' ? '查看详情' : '下载';
  const dedRefId = `download:${currentUserId}:${entry.id}:${actionType}`;
  const deduct = await pointsService.deductPoints(
    currentUserId,
    cost,
    'exchange',
    description || `资料${actionLabel}消耗 ${cost} 积分`,
    dedRefId
  );
  if (!deduct.success) {
    return { success: false, reason: deduct.reason || '积分不足', cost, creatorShare: 0, platformShare: 0, split: false };
  }

  // 无上传者（系统/管理员上传）或自上传：仅扣费不分成
  if (!entry.user_id || entry.user_id === currentUserId) {
    return { success: true, cost, creatorShare: 0, platformShare: 0, split: false };
  }

  // 分成：70% 给上传者，30% 归平台
  const { creatorRate, platformRate } = await getSplitRates(db);
  const creatorShare = Math.floor(cost * creatorRate);
  const platformShare = cost - creatorShare;

  if (creatorShare > 0) {
    const splitRefId = `split:${currentUserId}:${entry.id}:${actionType}`;
    try {
      await pointsService.addPoints(
        entry.user_id,
        creatorShare,
        'knowledge_share',
        `资料被${actionLabel}分成 +${creatorShare} 积分`,
        splitRefId
      );

      await db.from('points_split_records').insert({
        resource_type: entry.type,
        resource_id: entry.id,
        action_type: actionType,
        uploader_id: entry.user_id,
        downloader_id: currentUserId,
        total_points: cost,
        creator_share: creatorShare,
        platform_share: platformShare,
        creator_share_rate: creatorRate,
        platform_share_rate: platformRate,
        split_reference_id: splitRefId,
      });
    } catch (e) {
      console.error('[PointsDownload] 分成失败（不影响主流程）:', e);
      return { success: true, cost, creatorShare: 0, platformShare: 0, split: false };
    }
  }

  return { success: true, cost, creatorShare, platformShare, split: creatorShare > 0 };
}
