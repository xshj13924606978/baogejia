/**
 * 统一规则服务
 * 
 * 提供积分/Token规则的核心业务逻辑:
 * - 规则查询与分组
 * - 规则执行（奖励/消耗/Token扣费）
 * - 折扣计算
 * - 每日上限检查
 * - 交易记录写入
 * 
 * 核心原则: 只增不减，与现有 PointsService 并行使用
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  PointsRule,
  RuleType,
  RuleContext,
  TransactionResult,
  TransactionType,
  AmountType,
  RuleGroup,
  DiscountConfig,
  ConsumeRuleConfig,
  TokenRuleConfig,
  RewardRuleConfig,
  PointsTransaction,
} from '@/types/points-rules';

// ============================================================
// 规则缓存（立即生效：不缓存，每次从数据库读取）
// ============================================================

// ============================================================
// RuleService
// ============================================================

class RuleServiceClass {
  // ---- 查询方法 ----

  /**
   * 获取所有规则（按类型分组）
   */
  async getAllRules(): Promise<RuleGroup> {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('points_rules')
      .select('*')
      .order('priority', { ascending: false });

    if (error) {
      console.error('[RuleService] 获取规则失败:', error);
      return { reward: [], consume: [], token: [] };
    }

    const rules: PointsRule[] = (data || []).map(this.mapRule);
    return this.groupRules(rules);
  }

  /**
   * 获取指定类型的规则
   */
  async getRulesByType(type: RuleType): Promise<PointsRule[]> {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('points_rules')
      .select('*')
      .eq('rule_type', type)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error(`[RuleService] 获取${type}规则失败:`, error);
      return [];
    }

    return (data || []).map(this.mapRule);
  }

  /**
   * 根据 rule_key 获取规则（用于业务代码调用）
   */
  async getRuleByKey(ruleKey: string): Promise<PointsRule | null> {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('points_rules')
      .select('*')
      .eq('rule_key', ruleKey)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return this.mapRule(data);
  }

  // ---- 执行方法 ----

  /**
   * 执行奖励规则
   */
  async executeReward(
    userId: string,
    rule: PointsRule,
    context?: RuleContext,
  ): Promise<TransactionResult> {
    const config = rule.rule_config as RewardRuleConfig;
    const points = config?.points || rule.base_points || 0;

    // 检查每日上限
    if (config?.daily_limit) {
      const withinLimit = await this.checkDailyLimit(userId, rule.id!, config.daily_limit);
      if (!withinLimit) {
        return {
          success: false,
          message: `已达到今日上限（${config.daily_limit}次）`,
        };
      }
    }

    // 检查总上限
    if (config?.total_limit) {
      const withinLimit = await this.checkTotalLimit(userId, rule.id!, config.total_limit);
      if (!withinLimit) {
        return {
          success: false,
          message: `已达到总上限（${config.total_limit}次）`,
        };
      }
    }

    // 增加积分
    return this.recordTransaction(userId, {
      ruleId: rule.id!,
      transactionType: 'reward',
      amount: points,
      amountType: 'points',
      referenceId: context?.quoteId || context?.fileId,
      metadata: context || {},
    });
  }

  /**
   * 执行消耗规则（扣除积分）
   */
  async executeConsume(
    userId: string,
    rule: PointsRule,
    context: RuleContext,
    userLevel: number = 1,
  ): Promise<TransactionResult> {
    const config = rule.rule_config as ConsumeRuleConfig;
    if (!config) {
      return { success: false, message: '规则配置无效' };
    }

    // 计算消耗量
    const unitCount = this.getUnitCount(context, config.unit_type);
    const baseCost = config.base_cost || 0;
    const unitCost = config.unit_cost || 0;
    let totalCost = baseCost + unitCost * unitCount;

    // 应用等级折扣
    const discount = this.calculateDiscount(rule.discount_config, userLevel);
    const finalCost = Math.ceil(totalCost * discount);

    // 检查最低余额
    if (config.min_balance !== undefined) {
      const balance = await this.getPointsBalance(userId);
      if (balance < config.min_balance + finalCost) {
        return {
          success: false,
          message: `积分不足，需要 ${finalCost} 积分，当前余额 ${balance}`,
        };
      }
    }

    // 扣除积分
    return this.recordTransaction(userId, {
      ruleId: rule.id!,
      transactionType: 'consume',
      amount: -finalCost,
      amountType: 'points',
      unitCount,
      discountApplied: discount,
      referenceId: context?.quoteId || context?.fileId,
      metadata: context || {},
    });
  }

  /**
   * 执行Token计费规则（扣除Token）
   */
  async executeToken(
    userId: string,
    rule: PointsRule,
    context: RuleContext,
    userLevel: number = 1,
  ): Promise<TransactionResult> {
    const config = rule.rule_config as TokenRuleConfig;
    if (!config) {
      return { success: false, message: '规则配置无效' };
    }

    // 计算Token消耗量
    const unitCount = this.getUnitCount(context, config.unit_type);
    const baseTokens = config.base_tokens || 0;
    const unitTokens = config.unit_tokens || 0;
    let totalTokens = baseTokens + unitTokens * unitCount;

    // 应用等级折扣
    const discount = this.calculateDiscount(rule.discount_config, userLevel);
    const finalTokens = Math.ceil(totalTokens * discount);

    // 检查最低余额
    if (config.min_balance !== undefined) {
      const balance = await this.getTokenBalance(userId);
      if (balance < config.min_balance + finalTokens) {
        return {
          success: false,
          message: `Token不足，需要 ${finalTokens} Token，当前余额 ${balance}`,
        };
      }
    }

    // 扣除Token
    return this.recordTransaction(userId, {
      ruleId: rule.id!,
      transactionType: 'token',
      amount: -finalTokens,
      amountType: 'tokens',
      unitCount,
      discountApplied: discount,
      referenceId: context?.quoteId || context?.fileId || context?.conversationId,
      metadata: context || {},
    });
  }

  /**
   * 统一执行入口（根据规则类型自动分发）
   */
  async execute(
    userId: string,
    ruleKey: string,
    context: RuleContext = {},
    userLevel: number = 1,
  ): Promise<TransactionResult> {
    const rule = await this.getRuleByKey(ruleKey);
    if (!rule) {
      return { success: false, message: `规则不存在或已禁用: ${ruleKey}` };
    }

    switch (rule.extended_rule_type || rule.rule_type) {
      case 'reward':
        return this.executeReward(userId, rule, context);
      case 'consume':
        return this.executeConsume(userId, rule, context, userLevel);
      case 'token':
        return this.executeToken(userId, rule, context, userLevel);
      default:
        // 兼容原有规则（默认视为奖励类）
        return this.executeReward(userId, rule, context);
    }
  }

  // ---- 计算方法 ----

  /**
   * 计算消耗量（带折扣）
   */
  async calculateConsumption(
    rule: PointsRule,
    context: RuleContext,
    userLevel: number = 1,
  ): Promise<{ cost: number; discount: number }> {
    const config = rule.rule_config as ConsumeRuleConfig | TokenRuleConfig;
    if (!config) return { cost: 0, discount: 1 };

    const unitCount = this.getUnitCount(context, config.unit_type);
    const base = 'base_cost' in config ? (config.base_cost || 0) : (config.base_tokens || 0);
    const unit = 'unit_cost' in config ? (config.unit_cost || 0) : (config.unit_tokens || 0);
    const total = base + unit * unitCount;

    const discount = this.calculateDiscount(rule.discount_config, userLevel);
    return { cost: Math.ceil(total * discount), discount };
  }

  /**
   * 检查每日上限
   */
  async checkDailyLimit(
    userId: string,
    ruleId: string,
    dailyLimit: number,
  ): Promise<boolean> {
    const db = getSupabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await db
      .from('points_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('rule_id', ruleId)
      .eq('transaction_type', 'reward')
      .gte('created_at', today.toISOString());

    if (error) {
      console.error('[RuleService] 检查每日上限失败:', error);
      return true; // 查询失败时不阻止
    }

    return (count || 0) < dailyLimit;
  }

  /**
   * 检查总上限
   */
  async checkTotalLimit(
    userId: string,
    ruleId: string,
    totalLimit: number,
  ): Promise<boolean> {
    const db = getSupabaseClient();

    const { count, error } = await db
      .from('points_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('rule_id', ruleId)
      .eq('transaction_type', 'reward');

    if (error) {
      console.error('[RuleService] 检查总上限失败:', error);
      return true;
    }

    return (count || 0) < totalLimit;
  }

  // ---- 交易记录 ----

  /**
   * 获取用户交易记录
   */
  async getTransactions(userId: string, options?: {
    type?: TransactionType;
    amountType?: AmountType;
    page?: number;
    limit?: number;
  }): Promise<{ data: PointsTransaction[]; total: number }> {
    const db = getSupabaseClient();
    const page = options?.page || 1;
    const limit = options?.limit || 20;

    let query = db
      .from('points_transactions')
      .select('*, points_rules!inner(rule_name)', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.type) {
      query = query.eq('transaction_type', options.type);
    }
    if (options?.amountType) {
      query = query.eq('amount_type', options.amountType);
    }

    const start = (page - 1) * limit;
    const { data, error, count } = await query.range(start, start + limit - 1);

    if (error) {
      console.error('[RuleService] 获取交易记录失败:', error);
      return { data: [], total: 0 };
    }

    const transactions: PointsTransaction[] = (data || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      rule_id: row.rule_id,
      transaction_type: row.transaction_type,
      amount: row.amount,
      amount_type: row.amount_type,
      balance_before: row.balance_before,
      balance_after: row.balance_after,
      unit_count: row.unit_count,
      discount_applied: row.discount_applied,
      reference_id: row.reference_id,
      metadata: row.metadata || {},
      created_at: row.created_at,
      rule_name: row.points_rules?.rule_name,
    }));

    return { data: transactions, total: count || 0 };
  }

  // ---- 内部方法 ----

  /**
   * 写入交易记录并更新余额
   */
  private async recordTransaction(
    userId: string,
    params: {
      ruleId: string;
      transactionType: TransactionType;
      amount: number;
      amountType: AmountType;
      unitCount?: number;
      discountApplied?: number;
      referenceId?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<TransactionResult> {
    const db = getSupabaseClient();
    const amount = params.amount;
    const amountType = params.amountType;

    // 获取当前余额
    const balanceBefore = amountType === 'tokens'
      ? await this.getTokenBalance(userId)
      : await this.getPointsBalance(userId);
    const balanceAfter = balanceBefore + amount;

    // 检查余额是否足够（仅扣费时检查）
    if (amount < 0 && balanceBefore + amount < 0) {
      return {
        success: false,
        message: amountType === 'tokens'
          ? `Token不足，当前余额 ${balanceBefore}`
          : `积分不足，当前余额 ${balanceBefore}`,
      };
    }

    // 写入交易记录
    const { data: transaction, error: txError } = await db
      .from('points_transactions')
      .insert({
        user_id: userId,
        rule_id: params.ruleId,
        transaction_type: params.transactionType,
        amount,
        amount_type: amountType,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        unit_count: params.unitCount || 1,
        discount_applied: params.discountApplied || 1.0,
        reference_id: params.referenceId || null,
        metadata: params.metadata || {},
      })
      .select()
      .single();

    if (txError) {
      console.error('[RuleService] 写入交易记录失败:', txError);
      return { success: false, message: '写入交易记录失败' };
    }

    // 更新用户余额
    const updateField = amountType === 'tokens' ? 'tokens' : 'points';
    const updateTotalField = amountType === 'tokens' ? 'tokens' : 'total_points';
    const { error: updateError } = await db
      .from('users')
      .update({
        [updateField]: balanceAfter,
        ...(amount > 0 && amountType === 'points' ? {} : {}),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[RuleService] 更新用户余额失败:', updateError);
      // 交易记录已写入，但余额更新失败（记录不一致，需要人工处理）
    }

    return {
      success: true,
      transactionId: transaction?.id,
      amount,
      amountType,
      balanceBefore,
      balanceAfter,
      discountApplied: params.discountApplied || 1.0,
    };
  }

  /**
   * 获取用户积分余额
   */
  private async getPointsBalance(userId: string): Promise<number> {
    const db = getSupabaseClient();
    const { data } = await db
      .from('users')
      .select('points')
      .eq('id', userId)
      .single();
    return data?.points || 0;
  }

  /**
   * 获取用户Token余额
   */
  private async getTokenBalance(userId: string): Promise<number> {
    const db = getSupabaseClient();
    const { data } = await db
      .from('users')
      .select('tokens')
      .eq('id', userId)
      .single();
    return data?.tokens || 0;
  }

  /**
   * 计算等级折扣
   */
  private calculateDiscount(
    discountConfig: DiscountConfig | undefined,
    userLevel: number,
  ): number {
    if (!discountConfig?.enabled || !discountConfig.levels?.length) {
      return 1.0;
    }

    const levelConfig = discountConfig.levels.find(l => l.level === userLevel);
    return levelConfig?.discount ?? 1.0;
  }

  /**
   * 根据单位类型获取计量数
   */
  private getUnitCount(context: RuleContext, unitType: string): number {
    switch (unitType) {
      case 'product_count':
        return context.productCount || 1;
      case 'char_count':
        return context.charCount || 0;
      case 'page_count':
        return context.pageCount || 0;
      case 'fixed':
      default:
        return 1;
    }
  }

  /**
   * 数据库行映射为 PointsRule
   */
  private mapRule(row: any): PointsRule {
    return {
      id: row.id,
      rule_name: row.rule_name,
      rule_description: row.rule_description,
      rule_type: row.rule_type || 'reward',
      operation_type: row.operation_type,
      base_points: row.base_points || 0,
      points_formula: row.points_formula || 'fixed',
      max_points_per_day: row.max_points_per_day,
      max_points_total: row.max_points_total,
      conditions: row.conditions || [],
      user_level_min: row.user_level_min ?? 1,
      user_level_max: row.user_level_max ?? 5,
      user_roles: row.user_roles || [],
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      schedule_cron: row.schedule_cron,
      is_active: row.is_active ?? true,
      is_system_rule: row.is_system_rule ?? false,
      priority: row.priority || 0,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // 新增字段
      rule_key: row.rule_key,
      extended_rule_type: row.rule_type as RuleType,
      rule_config: row.rule_config || {},
      discount_config: row.discount_config || {},
    };
  }

  /**
   * 按类型分组规则
   */
  private groupRules(rules: PointsRule[]): RuleGroup {
    const group: RuleGroup = { reward: [], consume: [], token: [] };
    for (const rule of rules) {
      const type = (rule.extended_rule_type || rule.rule_type || '') as string;
      if (type === 'reward' || type === 'consumption') {
        group.reward.push(rule);
      } else if (type === 'consume') {
        group.consume.push(rule);
      } else if (type === 'token') {
        group.token.push(rule);
      }
    }
    return group;
  }
}

// 单例导出
export const ruleService = new RuleServiceClass();

// 默认导出类
export { RuleServiceClass as RuleService };
