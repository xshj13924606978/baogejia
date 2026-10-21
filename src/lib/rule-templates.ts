/**
 * 积分规则预设模板
 * 
 * 提供常用的规则配置模板，管理员可一键创建
 * 新增规则时从模板初始化配置，减少手动输入
 */

import { RuleTemplate, RuleType, DiscountConfig } from '@/types/points-rules';

/** 默认等级折扣配置 */
export const DEFAULT_DISCOUNT_CONFIG: DiscountConfig = {
  enabled: true,
  levels: [
    { level: 5, discount: 0.5 },
    { level: 4, discount: 0.6 },
    { level: 3, discount: 0.7 },
    { level: 2, discount: 0.8 },
    { level: 1, discount: 1.0 },
  ],
};

// ============================================================
// 奖励类模板
// ============================================================

const rewardTemplates: RuleTemplate[] = [
  {
    ruleKey: 'daily_login',
    ruleName: '每日登录',
    ruleDescription: '用户每日首次登录奖励积分',
    ruleType: 'reward',
    operationType: 'daily_login',
    ruleConfig: {
      points: 2,
      trigger_condition: 'daily_login',
      daily_limit: 1,
      total_limit: null,
    },
    isSystemRule: true,
    priority: 100,
  },
  {
    ruleKey: 'upload_file',
    ruleName: '上传文件',
    ruleDescription: '用户上传文件获得积分奖励',
    ruleType: 'reward',
    operationType: 'upload_file',
    ruleConfig: {
      points: 10,
      trigger_condition: 'upload_file',
      daily_limit: 5,
      total_limit: null,
    },
    isSystemRule: true,
    priority: 90,
  },
  {
    ruleKey: 'share_knowledge',
    ruleName: '分享知识',
    ruleDescription: '用户分享知识库内容获得积分',
    ruleType: 'reward',
    operationType: 'task_reward',
    ruleConfig: {
      points: 20,
      trigger_condition: 'share_knowledge',
      daily_limit: 5,
      total_limit: null,
    },
    isSystemRule: true,
    priority: 80,
  },
  {
    ruleKey: 'invite_friend',
    ruleName: '邀请好友',
    ruleDescription: '成功邀请好友注册获得积分',
    ruleType: 'reward',
    operationType: 'invite_reward',
    ruleConfig: {
      points: 50,
      trigger_condition: 'invite_friend',
      daily_limit: null,
      total_limit: 500,
    },
    isSystemRule: true,
    priority: 70,
  },
  {
    ruleKey: 'register',
    ruleName: '新用户注册',
    ruleDescription: '新用户注册奖励积分',
    ruleType: 'reward',
    operationType: 'register',
    ruleConfig: {
      points: 100,
      trigger_condition: 'register',
      daily_limit: 1,
      total_limit: 1,
    },
    isSystemRule: true,
    priority: 95,
  },
  {
    ruleKey: 'complete_profile',
    ruleName: '完善资料',
    ruleDescription: '用户完善个人资料获得积分',
    ruleType: 'reward',
    operationType: 'task_reward',
    ruleConfig: {
      points: 30,
      trigger_condition: 'complete_profile',
      daily_limit: 1,
      total_limit: 1,
    },
    isSystemRule: false,
    priority: 60,
  },
  {
    ruleKey: 'first_quote',
    ruleName: '首次生成报价',
    ruleDescription: '用户首次生成报价单获得积分',
    ruleType: 'reward',
    operationType: 'task_reward',
    ruleConfig: {
      points: 20,
      trigger_condition: 'first_quote',
      daily_limit: null,
      total_limit: 1,
    },
    isSystemRule: false,
    priority: 55,
  },
];

// ============================================================
// 消耗类模板
// ============================================================

const consumeTemplates: RuleTemplate[] = [
  {
    ruleKey: 'quote_generate_consume',
    ruleName: '生成报价消耗积分',
    ruleDescription: '用户生成报价单消耗积分，按产品数量计费',
    ruleType: 'consume',
    operationType: 'generate_proposal',
    ruleConfig: {
      base_cost: 10,
      unit_cost: 2,
      unit_type: 'product_count',
      min_balance: 0,
    },
    discountConfig: DEFAULT_DISCOUNT_CONFIG,
    isSystemRule: true,
    priority: 90,
  },
  {
    ruleKey: 'export_report',
    ruleName: '导出报告消耗积分',
    ruleDescription: '用户导出报告消耗积分',
    ruleType: 'consume',
    operationType: 'export_quote',
    ruleConfig: {
      base_cost: 5,
      unit_cost: 0,
      unit_type: 'fixed',
      min_balance: 0,
    },
    discountConfig: DEFAULT_DISCOUNT_CONFIG,
    isSystemRule: true,
    priority: 80,
  },
  {
    ruleKey: 'enhance_proposal',
    ruleName: '方案增强消耗积分',
    ruleDescription: '用户增强方案消耗积分',
    ruleType: 'consume',
    operationType: 'enhance_proposal',
    ruleConfig: {
      base_cost: 15,
      unit_cost: 0,
      unit_type: 'fixed',
      min_balance: 0,
    },
    discountConfig: DEFAULT_DISCOUNT_CONFIG,
    isSystemRule: true,
    priority: 85,
  },
];

// ============================================================
// Token计费类模板
// ============================================================

const tokenTemplates: RuleTemplate[] = [
  {
    ruleKey: 'quote_generate_token',
    ruleName: '生成报价Token计费',
    ruleDescription: '生成报价按产品数量消耗Token',
    ruleType: 'token',
    operationType: 'generate_proposal',
    ruleConfig: {
      base_tokens: 10,
      unit_tokens: 2,
      unit_type: 'product_count',
      min_balance: 0,
    },
    discountConfig: DEFAULT_DISCOUNT_CONFIG,
    isSystemRule: true,
    priority: 95,
  },
  {
    ruleKey: 'ai_chat_token',
    ruleName: 'AI对话Token计费',
    ruleDescription: '每次AI对话消耗Token',
    ruleType: 'token',
    operationType: 'chat',
    ruleConfig: {
      base_tokens: 5,
      unit_tokens: 0,
      unit_type: 'fixed',
      min_balance: 0,
    },
    discountConfig: DEFAULT_DISCOUNT_CONFIG,
    isSystemRule: true,
    priority: 90,
  },
  {
    ruleKey: 'pdf_parse_token',
    ruleName: 'PDF解析Token计费',
    ruleDescription: 'PDF文件解析按页数消耗Token',
    ruleType: 'token',
    operationType: 'parse_document',
    ruleConfig: {
      base_tokens: 3,
      unit_tokens: 1,
      unit_type: 'page_count',
      min_balance: 0,
    },
    discountConfig: DEFAULT_DISCOUNT_CONFIG,
    isSystemRule: true,
    priority: 85,
  },
];

// ============================================================
// 导出
// ============================================================

/** 所有模板（按类型分组） */
export const ruleTemplates: Record<RuleType, RuleTemplate[]> = {
  reward: rewardTemplates,
  consume: consumeTemplates,
  token: tokenTemplates,
};

/** 所有模板（扁平数组） */
export const allRuleTemplates: RuleTemplate[] = [
  ...rewardTemplates,
  ...consumeTemplates,
  ...tokenTemplates,
];

/** 根据 ruleKey 查找模板 */
export function getTemplateByKey(ruleKey: string): RuleTemplate | undefined {
  return allRuleTemplates.find(t => t.ruleKey === ruleKey);
}

/** 根据类型获取模板 */
export function getTemplatesByType(type: RuleType): RuleTemplate[] {
  return ruleTemplates[type] || [];
}

/** 模板显示配置 */
export const RULE_TYPE_LABELS: Record<RuleType, { label: string; color: string; description: string }> = {
  reward: {
    label: '奖励类',
    color: 'green',
    description: '用户完成任务获得积分',
  },
  consume: {
    label: '消耗类',
    color: 'orange',
    description: '用户使用功能消耗积分',
  },
  token: {
    label: 'Token计费类',
    color: 'blue',
    description: '按使用量消耗Token',
  },
};

/** 单位类型标签 */
export const UNIT_TYPE_LABELS: Record<string, string> = {
  product_count: '产品数量',
  char_count: '字符数量',
  page_count: '页数',
  fixed: '固定值',
};
