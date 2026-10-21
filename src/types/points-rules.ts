/**
 * 统一积分规则系统类型定义
 * 
 * 包含: 奖励类(reward)、消耗类(consume)、Token计费类(token)
 * 核心原则: 只增不减，保留所有原有类型定义
 */

// ============================================================
// 枚举和联合类型
// ============================================================

/** 规则类型: 奖励类、消耗类、Token计费类（扩展后） */
export type RuleType = 'reward' | 'consume' | 'token';

/** 兼容原有 PointsRuleType（不修改） */
export type PointsRuleType = 'reward' | 'consumption' | 'penalty' | 'consume' | 'token';

/** 交易类型 */
export type TransactionType = 'reward' | 'consume' | 'token';

/** 数值类型 */
export type AmountType = 'points' | 'tokens';

/** 执行状态 */
export type ExecutionStatus = 'success' | 'failed' | 'skipped' | 'limited';

/** 条件类型 */
export type ConditionType =
  | 'user_level'
  | 'user_role'
  | 'time_range'
  | 'frequency'
  | 'day_of_week'
  | 'time_of_day'
  | 'custom_field'
  | 'previous_actions'
  | 'points_balance'
  | 'user_age_days';

/** 条件操作符（兼容简写和全称） */
export type ConditionOperator =
  | 'equals' | 'eq'
  | 'not_equals' | 'ne' | '!='
  | 'greater_than' | 'gt' | '>'
  | 'less_than' | 'lt' | '<'
  | 'greater_than_or_equal' | 'gte' | '>='
  | 'less_than_or_equal' | 'lte' | '<='
  | 'in'
  | 'not_in'
  | 'contains'
  | 'between'
  | 'not_between'
  | 'regex';

/** 逻辑操作符 */
export type LogicalOperator = 'and' | 'or' | 'AND' | 'OR';

/** 积分操作类型（保留原有） */
export type PointOperationType =
  | 'register'
  | 'daily_login'
  | 'chat'
  | 'upload_file'
  | 'parse_document'
  | 'generate_proposal'
  | 'enhance_proposal'
  | 'export_quote'
  | 'recharge'
  | 'admin_grant'
  | 'admin_deduct'
  | 'exchange'
  | 'refund'
  | 'invite_reward'
  | 'task_reward';

/** 单位类型 */
export type UnitType = 'product_count' | 'char_count' | 'page_count' | 'fixed';

// ============================================================
// 规则配置类型（按 rule_type 区分）
// ============================================================

/** 奖励类规则配置 */
export interface RewardRuleConfig {
  points: number;
  trigger_condition: string;
  daily_limit: number | null;
  total_limit: number | null;
}

/** 消耗类规则配置 */
export interface ConsumeRuleConfig {
  base_cost: number;
  unit_cost: number;
  unit_type: UnitType;
  min_balance: number;
}

/** Token计费类规则配置 */
export interface TokenRuleConfig {
  base_tokens: number;
  unit_tokens: number;
  unit_type: UnitType;
  min_balance: number;
}

/** 等级折扣配置 */
export interface DiscountLevel {
  level: number;
  discount: number;
}

export interface DiscountConfig {
  enabled: boolean;
  levels: DiscountLevel[];
}

// ============================================================
// 积分规则实体（完整字段，包含原有字段 + 新增字段）
// ============================================================

export interface PointsRule {
  id: string;
  
  // -- 原有字段（不修改） --
  rule_name: string;
  rule_description: string;
  rule_type: PointsRuleType; // 原有
  operation_type: PointOperationType;
  base_points: number;
  points_formula: string;
  max_points_per_day: number | null;
  max_points_total: number | null;
  conditions: any;
  user_level_min: number;
  user_level_max: number;
  user_roles: string[];
  effective_from: string | null;
  effective_to: string | null;
  schedule_cron: string | null;
  is_active: boolean;
  is_system_rule: boolean;
  priority: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;

  // -- 新增字段（只增不减） --
  rule_key?: string;
  extended_rule_type?: RuleType; // 'reward' | 'consume' | 'token'
  rule_config?: RewardRuleConfig | ConsumeRuleConfig | TokenRuleConfig;
  discount_config?: DiscountConfig;

  // -- 前端兼容别名（snake_case -> camelCase） --
  ruleName?: string;
  ruleDescription?: string;
  ruleKey?: string;
  ruleType?: string;
  basePoints?: number;
  isActive?: boolean;
  isSystemRule?: boolean;
  operationType?: string;
  userLevelMin?: number;
  userLevelMax?: number;
  maxPointsPerDay?: number | null;
  maxPointsTotal?: number | null;
  pointsFormula?: string;
  userRoles?: string[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  scheduleCron?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

// ============================================================
// 交易记录实体
// ============================================================

export interface PointsTransaction {
  id: string;
  user_id: string;
  rule_id: string | null;
  transaction_type: TransactionType;
  amount: number;
  amount_type: AmountType;
  balance_before: number;
  balance_after: number;
  unit_count: number;
  discount_applied: number;
  reference_id: string | null;
  metadata: Record<string, any>;
  created_at: string;

  // 可选的关联数据
  rule_name?: string;
  user_name?: string;
}

// ============================================================
// 规则统计
// ============================================================

export interface PointsRuleStats {
  ruleId: string;
  ruleKey?: string;
  ruleName: string;
  ruleType: string;
  operationType: string;
  basePoints: number;
  isActive: boolean;
  totalExecutions: number;
  totalPointsAwarded: number;
  totalTokensConsumed: number;
  uniqueUsers: number;
  firstExecution: string | null;
  lastExecution: string | null;
}

// ============================================================
// 规则历史记录
// ============================================================

export interface PointsRuleHistory {
  id: string;
  ruleId: string;
  userId: string;
  pointsAwarded: number;
  pointsExpected: number;
  operationType: string;
  contextData: Record<string, any>;
  conditionsMatched: number;
  conditionsEvaluated: number;
  conditionsPassed: number;
  executionStatus: ExecutionStatus;
  failureReason: string | null;
  executedAt: string;
}

// ============================================================
// 条件相关类型
// ============================================================

export interface RuleCondition {
  id: string;
  field: ConditionType;
  operator: ConditionOperator;
  value: any;
  logicalOperator: LogicalOperator;
}

// ============================================================
// 服务层类型
// ============================================================

/** 规则执行上下文 */
export interface RuleContext {
  productCount?: number;
  pageCount?: number;
  charCount?: number;
  quoteId?: string;
  fileId?: string;
  fileSize?: number;
  conversationId?: string;
  messageId?: string;
  [key: string]: any;
}

/** 规则执行结果 */
export interface TransactionResult {
  success: boolean;
  message?: string;
  transactionId?: string;
  amount?: number;
  amountType?: AmountType;
  balanceBefore?: number;
  balanceAfter?: number;
  discountApplied?: number;
}

/** 规则分组 */
export interface RuleGroup {
  reward: PointsRule[];
  consume: PointsRule[];
  token: PointsRule[];
}

/** 预设规则模板 */
export interface RuleTemplate {
  ruleKey: string;
  ruleName: string;
  ruleDescription: string;
  ruleType: RuleType;
  operationType: PointOperationType;
  ruleConfig: RewardRuleConfig | ConsumeRuleConfig | TokenRuleConfig;
  discountConfig?: DiscountConfig;
  isSystemRule: boolean;
  priority: number;
}

// ============================================================
// API 请求/响应类型
// ============================================================

export interface CreateRuleRequest {
  rule_key?: string;
  rule_name: string;
  rule_description: string;
  rule_type?: PointsRuleType; // 原有
  operation_type: PointOperationType;
  base_points?: number;
  points_formula?: string;
  max_points_per_day?: number | null;
  max_points_total?: number | null;
  conditions?: any;
  user_level_min?: number;
  user_level_max?: number;
  user_roles?: string[];
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  priority?: number;

  // 新增字段
  extended_rule_type?: RuleType;
  rule_config?: RewardRuleConfig | ConsumeRuleConfig | TokenRuleConfig;
  discount_config?: DiscountConfig;
}

export interface UpdateRuleRequest extends Partial<CreateRuleRequest> {}

export interface RulesListResponse {
  success: boolean;
  data: PointsRule[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
}

export interface RuleStatsResponse {
  success: boolean;
  data: {
    stats: PointsRuleStats[];
    overall: {
      totalRules: number;
      totalExecutions: number;
      totalPointsAwarded: number;
      totalTokensConsumed: number;
      totalUniqueUsers: number;
      activeRules: number;
      avgPointsPerExecution: number;
    };
  };
}
