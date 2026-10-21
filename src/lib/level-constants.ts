/**
 * 等级体系统一常量（唯一权威命名来源）
 * 对话窗: [#202608302400-权限体系全面修复] 阶段1
 *
 * 背景：修复前系统存在多套等级命名并存的混乱：
 *   - member_levels / level_definitions：用户 / 会员 / 白银 / 黄金 / 白金（真实，DB 权威）
 *   - 等级兑换接口展示：普通会员 / VIP会员 / 企业会员 / 超级会员（硬编码，已废弃）
 *   - level-config-store 兜底：免费用户 / 普通会员 / VIP会员 / 企业会员 / 超级会员（硬编码，已对齐）
 *
 * 规范：全系统统一使用「用户、会员、白银、黄金、白金」，
 *       level 1-5（level_definitions）↔ L0-L4（member_levels）。
 *
 * 注意：本文件的数值仅作为 DB 不可用时的兜底默认值，
 *       运行时优先读取 member_levels / level_definitions。
 */

/** 单个等级的元数据 */
export interface LevelMeta {
  /** level_definitions.level（1-5），业务层使用 */
  level: number;
  /** member_levels.level_code（L0-L4），配置层使用 */
  levelCode: string;
  /** 统一等级名称 */
  name: string;
  /** 升级所需积分阈值 */
  requiredPoints: number;
  /** level_definitions.role */
  role: string;
  /** 每日查询配额 */
  dailyQuota: number;
  /** 最大文件数 */
  maxFiles: number;
  /** 最大聊天消息数 */
  maxChatMessages: number;
}

/** 五级等级定义（顺序 = 等级由低到高） */
export const LEVEL_METAS: readonly LevelMeta[] = [
  {
    level: 1,
    levelCode: 'L0',
    name: '用户',
    requiredPoints: 0,
    role: 'free',
    dailyQuota: 0,
    maxFiles: 0,
    maxChatMessages: 0,
  },
  {
    level: 2,
    levelCode: 'L1',
    name: '会员',
    requiredPoints: 100,
    role: 'basic',
    dailyQuota: 10,
    maxFiles: 5,
    maxChatMessages: 10,
  },
  {
    level: 3,
    levelCode: 'L2',
    name: '白银',
    requiredPoints: 500,
    role: 'standard',
    dailyQuota: 20,
    maxFiles: 10,
    maxChatMessages: 20,
  },
  {
    level: 4,
    levelCode: 'L3',
    name: '黄金',
    requiredPoints: 2000,
    role: 'premium',
    dailyQuota: 50,
    maxFiles: 20,
    maxChatMessages: 50,
  },
  {
    level: 5,
    levelCode: 'L4',
    name: '白金',
    requiredPoints: 10000,
    role: 'vip',
    dailyQuota: 100,
    maxFiles: 50,
    maxChatMessages: 100,
  },
] as const;

/** level(1-5) → levelCode(L0-L4) */
export const LEVEL_NUM_TO_CODE: Record<number, string> = LEVEL_METAS.reduce(
  (acc, m) => {
    acc[m.level] = m.levelCode;
    return acc;
  },
  {} as Record<number, string>
);

/** levelCode(L0-L4) → level(1-5) */
export const LEVEL_CODE_TO_NUM_MAP: Record<string, number> = LEVEL_METAS.reduce(
  (acc, m) => {
    acc[m.levelCode] = m.level;
    return acc;
  },
  {} as Record<string, number>
);

/** 最低等级（注册默认） */
export const MIN_LEVEL = 1;
/** 最高等级 */
export const MAX_LEVEL = 5;

/**
 * 获取等级统一名称（DB 无数据时兜底）
 * @param level level_definitions.level（1-5）
 */
export function getLevelName(level: number): string {
  return LEVEL_METAS.find((m) => m.level === level)?.name ?? `等级${level}`;
}

/**
 * 等级徽章配色（唯一来源）
 * 对话窗: [#202608302600-用户管理等级列显示]
 *
 * member-permission-defs.LEVEL_BADGE_CLASSES（L0-L4）由本表派生，
 * 避免同一套配色在两处维护导致不一致。
 * 颜色规范：1 用户 灰色 / 2 会员 蓝色 / 3 白银 银色 / 4 黄金 金色 / 5 白金 紫色
 */
export const LEVEL_BADGE_CLASS: Record<number, string> = {
  1: 'bg-gray-500',
  2: 'bg-blue-500',
  3: 'bg-slate-500',
  4: 'bg-amber-500',
  5: 'bg-purple-600',
};

/** 获取等级徽章配色类名（未知等级回退灰色） */
export function getLevelBadgeClass(level: number): string {
  return LEVEL_BADGE_CLASS[level] ?? LEVEL_BADGE_CLASS[MIN_LEVEL];
}

/**
 * 根据积分计算应得等级（不含临时等级，仅按积分阈值）
 * @param points 当前积分
 */
export function getLevelByPoints(points: number): number {
  let result = MIN_LEVEL;
  for (const meta of LEVEL_METAS) {
    if (points >= meta.requiredPoints) result = meta.level;
  }
  return result;
}

/**
 * 等级名称规范化：把历史遗留的别名映射为统一名称
 * 用于兼容接口/展示层传入的旧文案
 */
const LEGACY_NAME_ALIASES: Record<string, string> = {
  免费用户: '用户',
  普通用户: '用户',
  '等级1': '用户',
  普通会员: '会员',
  '等级2': '会员',
  VIP会员: '白银',
  'VIP 会员': '白银',
  VIP: '白银',
  '等级3': '白银',
  企业会员: '黄金',
  企业用户: '黄金',
  '等级4': '黄金',
  超级会员: '白金',
  超级管理员: '白金',
  '等级5': '白金',
  黄金会员: '黄金',
  白金会员: '白金',
};

/** 规范化任意等级名称/别名为统一名称 */
export function normalizeLevelName(name: string | null | undefined): string {
  if (!name) return getLevelName(MIN_LEVEL);
  const trimmed = name.trim();
  if (LEVEL_METAS.some((m) => m.name === trimmed)) return trimmed;
  return LEGACY_NAME_ALIASES[trimmed] ?? trimmed;
}

/**
 * 等级来源（区分永久等级与临时等级）
 * - points：积分自动升级（永久，随积分变化）
 * - exchange：积分兑换的临时等级（有有效期）
 * - purchase：付费购买的会员（有有效期）
 * - admin：管理员手动设置（永久）
 */
export type LevelSource = 'points' | 'exchange' | 'purchase' | 'admin';

/**
 * 积分兑换等级积分公式：等级 × 100 × 天数 / 30
 * 与 token-billing-service.exchangePointsForLevel 保持一致
 */
export function calcExchangePoints(level: number, days: number): number {
  return Math.ceil((level * 100 * days) / 30);
}

/** 常用兑换天数档位 */
export const EXCHANGE_DAY_OPTIONS = [30, 90, 180, 365] as const;

/**
 * 字段权限默认矩阵（DB 无配置时的回退）
 * 与迁移 073 member_field_permissions 种子完全一致
 * 结构：{ [level(1-5)]: { [field_key]: boolean } }
 *
 * #202608302400 阶段3 P0-5：供 product-visibility（运行时脱敏）与
 *   level-config-store（兜底配置）共用，消除三处重复硬编码。
 */
export const FIELD_DEFAULT_PERMISSIONS: Record<
  number,
  {
    can_view_cost_price: boolean;
    can_view_min_price: boolean;
    can_view_manufacturer: boolean;
    can_view_contact: boolean;
    can_view_phone: boolean;
  }
> = {
  // L0 用户：全部不可见
  1: {
    can_view_cost_price: false,
    can_view_min_price: false,
    can_view_manufacturer: false,
    can_view_contact: false,
    can_view_phone: false,
  },
  // L1 会员：仅最低售价
  2: {
    can_view_cost_price: false,
    can_view_min_price: true,
    can_view_manufacturer: false,
    can_view_contact: false,
    can_view_phone: false,
  },
  // L2 白银：最低售价 + 厂家 + 联系人
  3: {
    can_view_cost_price: false,
    can_view_min_price: true,
    can_view_manufacturer: true,
    can_view_contact: true,
    can_view_phone: false,
  },
  // L3 黄金：除电话外全部
  4: {
    can_view_cost_price: true,
    can_view_min_price: true,
    can_view_manufacturer: true,
    can_view_contact: true,
    can_view_phone: false,
  },
  // L4 白金：全部可见
  5: {
    can_view_cost_price: true,
    can_view_min_price: true,
    can_view_manufacturer: true,
    can_view_contact: true,
    can_view_phone: true,
  },
};

/**
 * 产品表敏感字段 → member_field_permissions.field_key 映射
 * #202608302400 阶段3 P0-5：让产品脱敏按等级逐字段生效
 */
export const PRODUCT_FIELD_PERMISSION_MAP: Record<string, string> = {
  cost_price: 'can_view_cost_price',
  min_price: 'can_view_min_price',
  supplier: 'can_view_manufacturer',
  contact_person: 'can_view_contact',
  contact_phone: 'can_view_phone',
};

/** 获取某等级的字段权限（DB 无配置时回退默认矩阵） */
export function getDefaultFieldPermissions(level: number): Record<string, boolean> {
  return { ...(FIELD_DEFAULT_PERMISSIONS[level] ?? FIELD_DEFAULT_PERMISSIONS[MIN_LEVEL]) };
}

/**
 * membership_plans.level_code → 统一等级名称
 *
 * 迁移 099 定义的套餐等级码映射：
 *   vip → L1(level 2 会员) / premium → L3(level 4 黄金) / enterprise → L4(level 5 白金)
 *
 * 用于会员中心、套餐管理、会员用户列表的等级展示，替代各处重复的硬编码
 * （旧文案「VIP 会员 / 黄金会员 / 白金会员」已统一）。
 */
export const MEMBERSHIP_CODE_LABEL: Record<string, string> = {
  vip: '会员',
  premium: '黄金',
  enterprise: '白金',
};

/**
 * 获取会员套餐等级码对应的统一名称
 * @param code membership_plans.level_code（vip / premium / enterprise）
 */
export function getMembershipLevelLabel(code: string | null | undefined): string {
  if (!code) return getLevelName(MIN_LEVEL);
  return MEMBERSHIP_CODE_LABEL[code] ?? normalizeLevelName(code);
}

/**
 * membership_plans.level_code → level_definitions.level（1-5）
 * 依据迁移 099 的映射关系：vip → L1(level 2) / premium → L3(level 4) / enterprise → L4(level 5)
 *
 * #202608302400 阶段4 P1-1：供 token-billing-service 从数据库套餐表推导等级，
 *   消除 getPaymentPlans 中的硬编码等级数值。
 */
export const MEMBERSHIP_CODE_TO_LEVEL: Record<string, number> = {
  vip: 2,
  premium: 4,
  enterprise: 5,
};

/** 获取会员套餐等级码对应的 level（1-5），未知返回 L1(level 2) */
export function getMembershipLevel(code: string | null | undefined): number {
  if (!code) return 2;
  return MEMBERSHIP_CODE_TO_LEVEL[code] ?? 2;
}
