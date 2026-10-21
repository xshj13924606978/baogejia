/**
 * 贡献者积分规则配置（#[20260827-1030]-8）
 * 数据持久化 + 动态关联 + 全局实时生效
 *
 * 数据来源：
 *   - 权威源：public.points_rules 表（迁移 085_contributor_points_rules.sql）
 *   - rule_key 体系：
 *       contributor_upload_product / document / case / standard / drawing / quota
 *       contributor_register
 *       contributor_adopt
 *       invite_register / invite_submit / invite_review
 *       invite_level1 / invite_level2 / invite_level3
 *       contributor_universal_invite_expiry（rule_config.expiry_days）
 *
 * 读取策略：
 *   1) 优先读 points_rules.rule_config.points（如果存在）或 rule_config.expiry_days
 *   2) 退化读 points_rules.base_points（迁移 085 显式写入）
 *   3) 都拿不到则用 FALLBACK 默认值（保证零停机、降级可用）
 *
 * 缓存：
 *   - 内存级 LRU + 30s TTL，避免每个请求都打 DB
 *   - 提供 clearContributorPointsConfigCache() 用于后台改配置后强制刷新
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import type { ContributorType } from './types';

// ============================================================================
// Fallback 默认值（与迁移 085 种子完全一致；DB 不可用时保证零停机降级）
// ============================================================================
export const FALLBACK_CONTRIBUTOR_UPLOAD_POINTS: Record<ContributorType, number> = {
  product: 50,
  document: 80,
  case: 60,
  standard: 80,
  drawing: 40,
  quota: 50,
};

export const FALLBACK_CONTRIBUTOR_REGISTER_POINTS = 100;
export const FALLBACK_CONTRIBUTOR_ADOPT_POINTS = 100;
export const FALLBACK_INVITE_REGISTER_POINTS = 20;
export const FALLBACK_INVITE_SUBMIT_POINTS = 30;
export const FALLBACK_INVITE_REVIEW_POINTS = 50;
export const FALLBACK_MULTI_LEVEL_REWARDS = {
  level1: 50,
  level2: 10,
  level3: 5,
} as const;
export const FALLBACK_UNIVERSAL_INVITE_EXPIRY_DAYS = 30;

// ============================================================================
// 内存缓存（30 秒 TTL）
// ============================================================================
const CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(cacheKey: string): T | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(cacheKey: string, value: T): void {
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * 清空缓存（管理员在后台改 points_rules 后调用此函数强制刷新）
 */
export function clearContributorPointsConfigCache(): void {
  cache.clear();
}

// ============================================================================
// DB 读取辅助
// ============================================================================
interface PointsRuleRow {
  rule_key: string;
  base_points: number | null;
  rule_config: Record<string, any> | null;
  is_active: boolean | null;
}

/**
 * 从 points_rules 一次性取出所有贡献者相关规则（带缓存）
 */
async function loadContributorRules(): Promise<Map<string, PointsRuleRow>> {
  const cached = getCached<Map<string, PointsRuleRow>>('all_contributor_rules');
  if (cached) return cached;

  const keys = [
    'contributor_upload_product',
    'contributor_upload_document',
    'contributor_upload_case',
    'contributor_upload_standard',
    'contributor_upload_drawing',
    'contributor_upload_quota',
    'contributor_register',
    'contributor_adopt',
    'invite_register',
    'invite_submit',
    'invite_review',
    'invite_level1',
    'invite_level2',
    'invite_level3',
    'contributor_universal_invite_expiry',
  ];

  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('points_rules')
      .select('rule_key, base_points, rule_config, is_active')
      .in('rule_key', keys);

    if (error) {
      console.warn('[points-config] 加载贡献者积分规则失败，使用 fallback:', error.message);
      return new Map();
    }

    const map = new Map<string, PointsRuleRow>();
    for (const row of data || []) {
      map.set(row.rule_key, row as PointsRuleRow);
    }
    setCached('all_contributor_rules', map);
    return map;
  } catch (err) {
    console.warn('[points-config] 加载贡献者积分规则异常，使用 fallback:', err);
    return new Map();
  }
}

/**
 * 从单行 rule_config 中提取积分值（rule_config.points 优先，回退到 base_points）
 */
function extractPoints(row: PointsRuleRow | undefined, fallback: number): number {
  if (!row || row.is_active === false) return fallback;
  const cfgPoints = row.rule_config?.points;
  if (typeof cfgPoints === 'number' && Number.isFinite(cfgPoints)) return cfgPoints;
  if (typeof row.base_points === 'number' && Number.isFinite(row.base_points)) return row.base_points;
  return fallback;
}

// ============================================================================
// 公开 API（业务层调用此处，替换原硬编码常量）
// ============================================================================

/**
 * 获取某种类型贡献资料审核通过积分
 */
export async function getContributorUploadPoints(type: ContributorType): Promise<number> {
  const fallback = FALLBACK_CONTRIBUTOR_UPLOAD_POINTS[type] ?? 0;
  const rules = await loadContributorRules();
  return extractPoints(rules.get(`contributor_upload_${type}`), fallback);
}

/**
 * 获取贡献者注册奖励积分
 */
export async function getContributorRegisterPoints(): Promise<number> {
  const rules = await loadContributorRules();
  return extractPoints(rules.get('contributor_register'), FALLBACK_CONTRIBUTOR_REGISTER_POINTS);
}

/**
 * 获取贡献者资料被采纳奖励积分
 */
export async function getContributorAdoptPoints(): Promise<number> {
  const rules = await loadContributorRules();
  return extractPoints(rules.get('contributor_adopt'), FALLBACK_CONTRIBUTOR_ADOPT_POINTS);
}

/**
 * 获取被邀请人注册奖励积分
 */
export async function getInviteRegisterPoints(): Promise<number> {
  const rules = await loadContributorRules();
  return extractPoints(rules.get('invite_register'), FALLBACK_INVITE_REGISTER_POINTS);
}

/**
 * 获取被邀请人提交资料奖励积分
 */
export async function getInviteSubmitPoints(): Promise<number> {
  const rules = await loadContributorRules();
  return extractPoints(rules.get('invite_submit'), FALLBACK_INVITE_SUBMIT_POINTS);
}

/**
 * 获取被邀请人资料审核通过奖励积分（发给邀请人）
 */
export async function getInviteReviewPoints(): Promise<number> {
  const rules = await loadContributorRules();
  return extractPoints(rules.get('invite_review'), FALLBACK_INVITE_REVIEW_POINTS);
}

/**
 * 获取多级邀请奖励（level1/level2/level3）
 */
export async function getMultiLevelInviteRewards(): Promise<{
  level1: number;
  level2: number;
  level3: number;
}> {
  const rules = await loadContributorRules();
  return {
    level1: extractPoints(rules.get('invite_level1'), FALLBACK_MULTI_LEVEL_REWARDS.level1),
    level2: extractPoints(rules.get('invite_level2'), FALLBACK_MULTI_LEVEL_REWARDS.level2),
    level3: extractPoints(rules.get('invite_level3'), FALLBACK_MULTI_LEVEL_REWARDS.level3),
  };
}

/**
 * 获取通用邀请码有效期（天数）
 */
export async function getUniversalInviteExpiryDays(): Promise<number> {
  const rules = await loadContributorRules();
  const row = rules.get('contributor_universal_invite_expiry');
  if (!row || row.is_active === false) return FALLBACK_UNIVERSAL_INVITE_EXPIRY_DAYS;
  const cfgDays = row.rule_config?.expiry_days;
  if (typeof cfgDays === 'number' && Number.isFinite(cfgDays) && cfgDays > 0) return cfgDays;
  return FALLBACK_UNIVERSAL_INVITE_EXPIRY_DAYS;
}

/**
 * 一次性获取全部贡献者积分配置（供前端展示用，避免多次请求）
 */
export async function getAllContributorPointsConfig(): Promise<{
  upload: Record<ContributorType, number>;
  register: number;
  adopt: number;
  invite: {
    register: number;
    submit: number;
    review: number;
  };
  multiLevel: { level1: number; level2: number; level3: number };
  universalInviteExpiryDays: number;
}> {
  const [
    product,
    document,
    caseP,
    standard,
    drawing,
    quota,
    register,
    adopt,
    inviteRegister,
    inviteSubmit,
    inviteReview,
    multi,
    expiryDays,
  ] = await Promise.all([
    getContributorUploadPoints('product'),
    getContributorUploadPoints('document'),
    getContributorUploadPoints('case'),
    getContributorUploadPoints('standard'),
    getContributorUploadPoints('drawing'),
    getContributorUploadPoints('quota'),
    getContributorRegisterPoints(),
    getContributorAdoptPoints(),
    getInviteRegisterPoints(),
    getInviteSubmitPoints(),
    getInviteReviewPoints(),
    getMultiLevelInviteRewards(),
    getUniversalInviteExpiryDays(),
  ]);

  return {
    upload: { product, document, case: caseP, standard, drawing, quota },
    register,
    adopt,
    invite: { register: inviteRegister, submit: inviteSubmit, review: inviteReview },
    multiLevel: multi,
    universalInviteExpiryDays: expiryDays,
  };
}