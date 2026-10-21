import { getSupabaseClient } from '@/storage/database/supabase-client';
import { userLevelService } from './user-level-service';
// #202608302400 阶段1：等级名称统一来源，消除本文件内旧别名硬编码
// #202608302400 阶段4：会员套餐等级映射（level_code → level）
import { getLevelName, getMembershipLevel } from './level-constants';

/**
 * Token计费服务
 * 实现积分付费双轨制计费系统
 */

// 计费配置接口
export interface TokenPricingConfig {
  id: number;
  configName: string;
  yuanToTokens: number; // 1元 = ? Tokens
  yuanToPoints: number; // 1元 = ? 积分
  pointsToTokens: number; // 1积分 = ? Tokens
  inputTokenRate: number; // 输入Token倍率
  outputTokenRate: number; // 输出Token倍率
  level1InputRate: number;
  level1OutputRate: number;
  level2InputRate: number;
  level2OutputRate: number;
  level3InputRate: number;
  level3OutputRate: number;
  level4InputRate: number;
  level4OutputRate: number;
  level5InputRate: number;
  level5OutputRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 用户Token余额接口
export interface UserTokenBalance {
  id: number;
  /** #202608302800 P0-1：user_token_balance.user_id 为 UUID，主键一律按字符串传递 */
  userId: string;
  pointsBalance: number;
  tokenBalance: number;
  totalConsumedTokens: number;
  totalConsumedPoints: number;
  totalRechargedPoints: number;
  totalRechargedAmount: number;
  lastUpdated: Date;
  createdAt: Date;
}

// Token消耗记录接口
export interface TokenConsumptionLog {
  id: number;
  userId: string;
  conversationId?: string;
  messageId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pointsConsumed: number;
  tokenRate: number;
  userLevel: number;
  serviceType?: string;
  createdAt: Date;
}

// Token消耗结果接口
export interface TokenConsumption {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pointsConsumed: number;
  tokenRate: number;
}

// 套餐接口
export interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  amount: number; // 金额（元）
  points: number; // 赠送积分
  level: number; // 等级
  days: number; // 有效期（天）
  features: string[]; // 功能列表
}

/**
 * 由 membership_plans.benefits（JSONB）生成套餐权益文案数组
 *
 * #202608302400 阶段4 P1-1：套餐权益改为读取数据库 benefits 字段，
 *   不再依赖硬编码文案。
 */
function buildPlanFeatures(
  benefits: unknown,
  points: number,
  days: number,
  level: number
): string[] {
  const features: string[] = [`${points}积分`, `${days}天有效`, `${getLevelName(level)}权限`];

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = typeof benefits === 'string' ? JSON.parse(benefits) : (benefits as Record<string, unknown>);
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === 'object') {
    const discount = Number(parsed.discount_rate);
    if (Number.isFinite(discount) && discount > 0 && discount < 1) {
      features.push(`Token ${(discount * 10).toFixed(1)}折`);
    }
    if (parsed.exclusive_content) features.push('专属资料');
    if (parsed.priority_support) features.push('优先支持');
    if (parsed.expert_consulting) features.push('专家咨询');
  }

  return features;
}

export class TokenBillingService {
  private supabase = getSupabaseClient();

  /**
   * 更新计费配置
   */
  async updateBillingConfig(config: Partial<TokenPricingConfig>): Promise<boolean> {
    try {
      const updateData: any = {};

      if (config.configName !== undefined) updateData.config_name = config.configName;
      if (config.yuanToTokens !== undefined) updateData.yuan_to_tokens = config.yuanToTokens;
      if (config.yuanToPoints !== undefined) updateData.yuan_to_points = config.yuanToPoints;
      if (config.pointsToTokens !== undefined) updateData.points_to_tokens = config.pointsToTokens;
      if (config.inputTokenRate !== undefined) updateData.input_token_rate = config.inputTokenRate;
      if (config.outputTokenRate !== undefined)
        updateData.output_token_rate = config.outputTokenRate;
      if (config.level1InputRate !== undefined)
        updateData.level_1_input_rate = config.level1InputRate;
      if (config.level1OutputRate !== undefined)
        updateData.level_1_output_rate = config.level1OutputRate;
      if (config.level2InputRate !== undefined)
        updateData.level_2_input_rate = config.level2InputRate;
      if (config.level2OutputRate !== undefined)
        updateData.level_2_output_rate = config.level2OutputRate;
      if (config.level3InputRate !== undefined)
        updateData.level_3_input_rate = config.level3InputRate;
      if (config.level3OutputRate !== undefined)
        updateData.level_3_output_rate = config.level3OutputRate;
      if (config.level4InputRate !== undefined)
        updateData.level_4_input_rate = config.level4InputRate;
      if (config.level4OutputRate !== undefined)
        updateData.level_4_output_rate = config.level4OutputRate;
      if (config.level5InputRate !== undefined)
        updateData.level_5_input_rate = config.level5InputRate;
      if (config.level5OutputRate !== undefined)
        updateData.level_5_output_rate = config.level5OutputRate;
      if (config.isActive !== undefined) updateData.is_active = config.isActive;

      updateData.updated_at = new Date().toISOString();

      const { error } = await this.supabase
        .from('token_pricing_config')
        .update(updateData)
        .eq('is_active', true);

      if (error) {
        console.error('[TokenBillingService] 更新计费配置失败:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[TokenBillingService] 更新计费配置异常:', error);
      return false;
    }
  }

  /**
   * 获取当前计费配置
   */
  async getBillingConfig(): Promise<TokenPricingConfig | null> {
    try {
      const { data, error } = await this.supabase
        .from('token_pricing_config')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.error('[TokenBillingService] 获取计费配置失败:', error);
        return null;
      }

      return {
        id: data.id,
        configName: data.config_name,
        yuanToTokens: data.yuan_to_tokens,
        yuanToPoints: data.yuan_to_points,
        pointsToTokens: data.points_to_tokens,
        inputTokenRate: data.input_token_rate,
        outputTokenRate: data.output_token_rate,
        level1InputRate: data.level_1_input_rate,
        level1OutputRate: data.level_1_output_rate,
        level2InputRate: data.level_2_input_rate,
        level2OutputRate: data.level_2_output_rate,
        level3InputRate: data.level_3_input_rate,
        level3OutputRate: data.level_3_output_rate,
        level4InputRate: data.level_4_input_rate,
        level4OutputRate: data.level_4_output_rate,
        level5InputRate: data.level_5_input_rate,
        level5OutputRate: data.level_5_output_rate,
        isActive: data.is_active,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      console.error('[TokenBillingService] 获取计费配置异常:', error);
      return null;
    }
  }

  /**
   * 估算文本的Token数量
   * 中文字符：约1字符=0.6 token
   * 英文单词：约1单词=0.75 token
   */
  countTokens(text: string): number {
    if (!text) return 0;

    // 统计中文字符
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const chineseCount = chineseChars.length;

    // 统计英文单词
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    const englishCount = englishWords.length;

    // 统计数字和符号
    const numbersAndSymbols = text.match(/[0-9\p{P}\p{S}]/gu) || [];
    const numberCount = numbersAndSymbols.length;

    // 估算Token数
    const chineseTokens = chineseCount * 0.6;
    const englishTokens = englishCount * 0.75;
    const numberTokens = numberCount * 0.3;

    return Math.ceil(chineseTokens + englishTokens + numberTokens);
  }

  /**
   * 计算一次交互消耗的Token
   */
  async calculateTokenConsumption(
    inputText: string,
    outputText: string,
    userId: number
  ): Promise<TokenConsumption> {
    // 获取用户等级
    let userLevel = 1;
    try {
      const levelData = await userLevelService.getUserLevel(userId.toString());
      if (levelData) {
        userLevel = levelData.level;
      }
    } catch (error) {
      console.error('[TokenBillingService] 获取用户等级失败:', error);
    }

    // 获取计费配置
    const config = await this.getBillingConfig();
    if (!config) {
      throw new Error('计费配置不存在');
    }

    // 计算输入和输出的Token数
    const inputTokens = this.countTokens(inputText);
    const outputTokens = this.countTokens(outputText);
    const totalTokens = inputTokens + outputTokens;

    // 根据用户等级获取倍率
    let inputRate = config.inputTokenRate;
    let outputRate = config.outputTokenRate;

    switch (userLevel) {
      case 1:
        inputRate = config.level1InputRate;
        outputRate = config.level1OutputRate;
        break;
      case 2:
        inputRate = config.level2InputRate;
        outputRate = config.level2OutputRate;
        break;
      case 3:
        inputRate = config.level3InputRate;
        outputRate = config.level3OutputRate;
        break;
      case 4:
        inputRate = config.level4InputRate;
        outputRate = config.level4OutputRate;
        break;
      case 5:
        inputRate = config.level5InputRate;
        outputRate = config.level5OutputRate;
        break;
    }

    // 计算实际消耗的Token（考虑倍率）
    const adjustedInputTokens = Math.ceil(inputTokens * inputRate);
    const adjustedOutputTokens = Math.ceil(outputTokens * outputRate);
    const adjustedTotalTokens = adjustedInputTokens + adjustedOutputTokens;

    // 计算消耗的积分（1积分 = pointsToTokens Tokens）
    const pointsConsumed = Math.ceil(adjustedTotalTokens / config.pointsToTokens);

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      pointsConsumed,
      tokenRate: (inputRate + outputRate) / 2,
    };
  }

  /**
   * 计算消耗的积分
   */
  async calculatePointsConsumption(userId: number, totalTokens: number): Promise<number> {
    const config = await this.getBillingConfig();
    if (!config) {
      throw new Error('计费配置不存在');
    }

    // 获取用户等级倍率
    let userLevel = 1;
    try {
      const levelData = await userLevelService.getUserLevel(userId.toString());
      if (levelData) {
        userLevel = levelData.level;
      }
    } catch (error) {
      console.error('[TokenBillingService] 获取用户等级失败:', error);
    }

    let rate = 1.0;
    switch (userLevel) {
      case 1:
        rate = (config.level1InputRate + config.level1OutputRate) / 2;
        break;
      case 2:
        rate = (config.level2InputRate + config.level2OutputRate) / 2;
        break;
      case 3:
        rate = (config.level3InputRate + config.level3OutputRate) / 2;
        break;
      case 4:
        rate = (config.level4InputRate + config.level4OutputRate) / 2;
        break;
      case 5:
        rate = (config.level5InputRate + config.level5OutputRate) / 2;
        break;
    }

    const adjustedTokens = Math.ceil(totalTokens * rate);
    return Math.ceil(adjustedTokens / config.pointsToTokens);
  }

  /**
   * 获取用户余额
   */
  async getUserBalance(userId: string): Promise<UserTokenBalance | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_token_balance')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // 如果记录不存在，创建新记录
        if (error.code === 'PGRST116') {
          return await this.createUserBalance(userId);
        }
        console.error('[TokenBillingService] 获取用户余额失败:', error);
        return null;
      }

      return {
        id: data.id,
        userId: data.user_id,
        pointsBalance: data.points_balance,
        tokenBalance: data.token_balance,
        totalConsumedTokens: data.total_consumed_tokens,
        totalConsumedPoints: data.total_consumed_points,
        totalRechargedPoints: data.total_recharged_points,
        totalRechargedAmount: data.total_recharged_amount,
        lastUpdated: new Date(data.last_updated),
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error('[TokenBillingService] 获取用户余额异常:', error);
      return null;
    }
  }

  /**
   * 创建用户余额记录
   */
  private async createUserBalance(userId: string): Promise<UserTokenBalance | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_token_balance')
        .insert({
          user_id: userId,
          points_balance: 0,
          token_balance: 0,
        })
        .select()
        .single();

      if (error || !data) {
        console.error('[TokenBillingService] 创建用户余额失败:', error);
        return null;
      }

      return {
        id: data.id,
        userId: data.user_id,
        pointsBalance: data.points_balance,
        tokenBalance: data.token_balance,
        totalConsumedTokens: data.total_consumed_tokens,
        totalConsumedPoints: data.total_consumed_points,
        totalRechargedPoints: data.total_recharged_points,
        totalRechargedAmount: data.total_recharged_amount,
        lastUpdated: new Date(data.last_updated),
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error('[TokenBillingService] 创建用户余额异常:', error);
      return null;
    }
  }

  /**
   * 检查用户积分是否充足
   */
  async checkPointsBalance(userId: string, requiredPoints: number): Promise<boolean> {
    const balance = await this.getUserBalance(userId);
    if (!balance) {
      return false;
    }
    return balance.pointsBalance >= requiredPoints;
  }

  /**
   * 扣除用户积分（原子操作，避免竞态条件；余额不足返回 false）
   */
  async deductPoints(
    userId: string,
    points: number,
    conversationId?: string,
    messageId?: string,
    serviceType?: string
  ): Promise<boolean> {
    try {
      if (points <= 0) {
        return false;
      }

      // 1. 读取当前余额
      const { data: balance, error: balanceError } = await this.supabase
        .from('user_token_balance')
        .select('points_balance')
        .eq('user_id', userId)
        .single();

      if (balanceError || !balance) {
        console.error('[TokenBillingService] 查询余额失败:', balanceError?.message);
        return false;
      }

      if (Number(balance.points_balance) < points) {
        // 余额不足
        return false;
      }

      const newBalance = Number(balance.points_balance) - points;

      // 2. 原子扣减：条件 UPDATE 在语句执行时再次校验余额并返回受影响行数，
      //    并发场景下即使读取到旧值，写入时余额不足也会返回 0 行，避免竞态
      const { data: updatedRows, error: updateError } = await this.supabase
        .from('user_token_balance')
        .update({
          points_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .gte('points_balance', points)
        .select('user_id');

      if (updateError) {
        console.error('[TokenBillingService] 扣减积分失败:', updateError);
        return false;
      }

      if (!updatedRows || updatedRows.length === 0) {
        // 并发扣减导致余额不足
        return false;
      }

      // #202608302900：同步权威积分源 users.points（+ metadata.points）。
      // 迁移 118 规定 users.points 为唯一权威值，三处存储须一致，
      // 否则兑换后 check_points_consistency() 会报「users.points ≠ user_token_balance」。
      // 失败仅告警不回滚：余额已按条件 UPDATE 扣减，可用 sync_user_points() 对账修复。
      try {
        const { data: userRow } = await this.supabase
          .from('users')
          .select('metadata')
          .eq('id', userId)
          .maybeSingle();

        const { error: syncError } = await this.supabase
          .from('users')
          .update({
            points: newBalance,
            metadata: { ...((userRow as any)?.metadata ?? {}), points: newBalance },
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (syncError) {
          console.error('[TokenBillingService] 同步 users.points 失败:', syncError);
        }
      } catch (syncError) {
        console.error('[TokenBillingService] 同步 users.points 异常:', syncError);
      }

      // 记录积分流水
      try {
        const { error: logError } = await this.supabase.from('point_logs').insert({
          user_id: userId,
          points: -points, // 扣除积分为负数
          type: serviceType || 'deduct',
          description: `扣除 ${points} 积分${conversationId ? ` (对话: ${conversationId})` : ''}${messageId ? ` (消息: ${messageId})` : ''}`,
          created_at: new Date(),
        });

        if (logError) {
          console.error('[TokenBillingService] 记录积分流水失败:', logError);
          // 不影响主流程，只记录日志
        }
      } catch (logError) {
        console.error('[TokenBillingService] 记录积分流水异常:', logError);
        // 不影响主流程，只记录日志
      }

      return true;
    } catch (error) {
      console.error('[TokenBillingService] 扣除积分异常:', error);
      return false;
    }
  }

  /**
   * 记录Token消耗日志
   */
  private async logTokenConsumption(
    userId: string,
    consumption: TokenConsumption,
    conversationId?: string,
    messageId?: string,
    serviceType?: string
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from('token_consumption_log').insert({
        user_id: userId,
        conversation_id: conversationId,
        message_id: messageId,
        input_tokens: consumption.inputTokens,
        output_tokens: consumption.outputTokens,
        total_tokens: consumption.totalTokens,
        points_consumed: consumption.pointsConsumed,
        token_rate: consumption.tokenRate,
        user_level: await this.getUserLevel(userId),
        service_type: serviceType,
      });

      if (error) {
        console.error('[TokenBillingService] 记录Token消耗日志失败:', error);
      }
    } catch (error) {
      console.error('[TokenBillingService] 记录Token消耗日志异常:', error);
    }
  }

  /**
   * 获取用户等级
   */
  private async getUserLevel(userId: string): Promise<number> {
    try {
      const levelData = await userLevelService.getUserLevel(userId);
      return levelData?.level || 1;
    } catch (_error) {
      return 1;
    }
  }

  /**
   * 充值积分（支付成功后调用）
   */
  async addPoints(
    userId: string,
    points: number,
    paymentId: string,
    _amount?: number
  ): Promise<boolean> {
    try {
      // 读取当前余额并原子充值（仅更新存在的列）
      const { data: balance } = await this.supabase
        .from('user_token_balance')
        .select('points_balance')
        .eq('user_id', userId)
        .single();

      const current = Number(balance?.points_balance ?? 0);
      const newBalance = current + points;

      const { error: updateError } = await this.supabase
        .from('user_token_balance')
        .update({
          points_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[TokenBillingService] 充值积分失败:', updateError);
        return false;
      }

      // #202608302900：同步权威积分源 users.points（+ metadata.points），与 deductPoints 对称。
      // 保证兑换失败回滚后三处存储仍一致（users.points / user_token_balance / user_levels）。
      try {
        const { data: userRow } = await this.supabase
          .from('users')
          .select('metadata')
          .eq('id', userId)
          .maybeSingle();

        const { error: syncError } = await this.supabase
          .from('users')
          .update({
            points: newBalance,
            metadata: { ...((userRow as any)?.metadata ?? {}), points: newBalance },
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (syncError) {
          console.error('[TokenBillingService] 同步 users.points 失败:', syncError);
        }
      } catch (syncError) {
        console.error('[TokenBillingService] 同步 users.points 异常:', syncError);
      }

      // 记录积分流水
      try {
        const { error: logError } = await this.supabase.from('point_logs').insert({
          user_id: userId,
          points,
          type: 'recharge',
          description: `充值 ${points} 积分 (支付单: ${paymentId})`,
          created_at: new Date(),
        });

        if (logError) {
          console.error('[TokenBillingService] 记录积分流水失败:', logError);
        }
      } catch (logError) {
        console.error('[TokenBillingService] 记录积分流水异常:', logError);
      }

      return true;
    } catch (error) {
      console.error('[TokenBillingService] 充值积分异常:', error);
      return false;
    }
  }

  /**
   * 设置用户积分（管理员功能）
   */
  async setUserPoints(userId: string, points: number): Promise<boolean> {
    try {
      const balance = await this.getUserBalance(userId);
      
      if (!balance) {
        console.error('[TokenBillingService] 用户余额不存在，尝试创建');
        // 尝试创建新记录
        const newBalance = await this.createUserBalance(userId);
        if (!newBalance) {
          return false;
        }
      }

      // 更新余额
      const { error: updateError } = await this.supabase
        .from('user_token_balance')
        .update({
          points_balance: points,
          last_updated: new Date(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[TokenBillingService] 设置用户积分失败:', updateError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[TokenBillingService] 设置用户积分异常:', error);
      return false;
    }
  }

  /**
   * 可用套餐兜底列表（仅在 membership_plans 表无数据时使用）
   *
   * #202608302400 阶段4 P1-1：套餐数据改为数据库驱动（membership_plans 表），
   *   此处仅作为"兜底默认值"，不再作为主要数据源。
   */
  private getFallbackPaymentPlans(): PaymentPlan[] {
    return [
      {
        id: 'starter',
        name: '体验套餐',
        description: '适合初次体验用户',
        amount: 9.9,
        points: 100,
        level: 1,
        days: 7,
        features: ['100积分', '7天有效', '基础功能'],
      },
      {
        id: 'basic',
        name: '基础套餐',
        description: '适合个人用户',
        amount: 29.9,
        points: 300,
        level: 2,
        days: 30,
        features: ['300积分', '30天有效', '基础功能', `${getLevelName(2)}权限`],
      },
      {
        id: 'vip_monthly',
        name: '白银月卡',
        description: '适合高频使用用户',
        amount: 99,
        points: 1000,
        level: 3,
        days: 30,
        features: ['1000积分', `30天${getLevelName(3)}`, `${getLevelName(3)}权限`, '优先支持'],
      },
      {
        id: 'vip_yearly',
        name: '白银年卡',
        description: '超值优惠',
        amount: 999,
        points: 12000,
        level: 3,
        days: 365,
        features: ['12000积分', `365天${getLevelName(3)}`, `${getLevelName(3)}权限`, '优先支持', '省200元'],
      },
      {
        id: 'enterprise',
        name: '黄金套餐',
        description: '适合企业用户',
        amount: 2999,
        points: 50000,
        level: 4,
        days: 365,
        features: ['50000积分', `365天${getLevelName(4)}`, `${getLevelName(4)}权限`, '专属客服', 'API访问'],
      },
    ];
  }

  /**
   * 获取可用套餐列表（数据库驱动）
   *
   * #202608302400 阶段4 P1-1：数据源为 membership_plans 表（迁移 099），
   *   等级由 level_code 经 MEMBERSHIP_CODE_TO_LEVEL 推导，
   *   赠送积分 = 价格 × yuanToPoints（取自 token_pricing_config）。
   *   数据库异常或无在售套餐时回退兜底列表，保证前端不空白。
   */
  async getPaymentPlans(): Promise<PaymentPlan[]> {
    try {
      const { data, error } = await this.supabase
        .from('membership_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data && data.length > 0) {
        const config = await this.getBillingConfig();
        const yuanToPoints = config?.yuanToPoints && config.yuanToPoints > 0 ? config.yuanToPoints : 100;

        return data.map((p: any): PaymentPlan => {
          const amount = Number(p.price) || 0;
          const level = getMembershipLevel(p.level_code);
          const points = Math.round(amount * yuanToPoints);
          return {
            id: p.code || String(p.id),
            name: p.name,
            description: p.description || '',
            amount,
            points,
            level,
            days: Number(p.duration_days) || 30,
            features: buildPlanFeatures(p.benefits, points, Number(p.duration_days) || 30, level),
          };
        });
      }
    } catch (error) {
      console.warn('[TokenBillingService] 读取套餐失败，回退兜底套餐:', error);
    }

    return this.getFallbackPaymentPlans();
  }

  /**
   * 购买等级权限（直接付费开通）
   */
  async purchaseLevel(
    userId: string,
    level: number,
    amount: number,
    paymentMethod: string,
    days?: number
  ): Promise<{
    success: boolean;
    newLevel?: number;
    expiryDate?: Date;
    message: string;
  }> {
    try {
      // 先计算到期时间，再连同等级一起写入（#202608302400 P0-3）
      // 迁移 117 已为 user_levels 增加 expiry_date / level_source 列
      let expiryDate: Date | undefined;
      if (days && days > 0) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
      }

      const success = await userLevelService.setUserLevel(userId, level, {
        expiryDate: expiryDate ?? null,
        source: 'purchase',
      });

      if (!success) {
        return { success: false, message: '设置等级失败' };
      }

      return {
        success: true,
        newLevel: level,
        expiryDate,
        message: '购买成功',
      };
    } catch (error) {
      console.error('[TokenBillingService] 购买等级异常:', error);
      return { success: false, message: '购买失败' };
    }
  }

  /**
   * 用积分兑换临时等级权限
   */
  async exchangePointsForLevel(
    userId: string,
    level: number,
    days: number
  ): Promise<{
    success: boolean;
    pointsConsumed?: number;
    expiryDate?: Date;
    message: string;
  }> {
    try {
      // 计算需要消耗的积分
      const config = await this.getBillingConfig();
      if (!config) {
        return { success: false, message: '计费配置不存在' };
      }

      // 等级兑换积分规则：等级 * 100 * 天数 / 30
      const pointsRequired = Math.ceil((level * 100 * days) / 30);

      // 检查积分是否充足
      const hasEnough = await this.checkPointsBalance(userId, pointsRequired);
      if (!hasEnough) {
        return { success: false, message: '积分不足' };
      }

      // 扣除积分
      const deductSuccess = await this.deductPoints(userId, pointsRequired);
      if (!deductSuccess) {
        return { success: false, message: '扣除积分失败' };
      }

      // 设置用户等级（写入有效期，#202608302400 P0-3）
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      // #202608302900：把扣减后的真实余额显式传给 setUserLevel，
      // 保证 user_levels.current_points 反映实际积分，而不是目标等级的 required_points。
      const latestBalance = await this.getUserBalance(userId);
      const rawPoints = latestBalance?.pointsBalance;
      const pointsAfterDeduct =
        rawPoints === null || rawPoints === undefined ? null : Number(rawPoints);

      const setSuccess = await userLevelService.setUserLevel(userId, level, {
        expiryDate,
        source: 'exchange',
        currentPoints:
          pointsAfterDeduct !== null && Number.isFinite(pointsAfterDeduct)
            ? pointsAfterDeduct
            : null,
      });
      if (!setSuccess) {
        // 回滚积分
        await this.addPoints(userId, pointsRequired, 'refund_' + Date.now());
        return { success: false, message: '设置等级失败' };
      }

      return {
        success: true,
        pointsConsumed: pointsRequired,
        expiryDate,
        message: '兑换成功',
      };
    } catch (error) {
      console.error('[TokenBillingService] 兑换等级异常:', error);
      return { success: false, message: '兑换失败' };
    }
  }

  /**
   * 获取用户消费记录
   */
  async getUserConsumptionLogs(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TokenConsumptionLog[]> {
    try {
      const { data, error } = await this.supabase
        .from('token_consumption_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error || !data) {
        console.error('[TokenBillingService] 获取消费记录失败:', error);
        return [];
      }

      return data.map((log) => ({
        id: log.id,
        userId: log.user_id,
        conversationId: log.conversation_id,
        messageId: log.message_id,
        inputTokens: log.input_tokens,
        outputTokens: log.output_tokens,
        totalTokens: log.total_tokens,
        pointsConsumed: log.points_consumed,
        tokenRate: log.token_rate,
        userLevel: log.user_level,
        serviceType: log.service_type,
        createdAt: new Date(log.created_at),
      }));
    } catch (error) {
      console.error('[TokenBillingService] 获取消费记录异常:', error);
      return [];
    }
  }

  /**
   * 获取兑换比例
   */
  async getExchangeRates(): Promise<{
    yuanToTokens: number;
    yuanToPoints: number;
    pointsToTokens: number;
  } | null> {
    const config = await this.getBillingConfig();
    if (!config) {
      return null;
    }

    return {
      yuanToTokens: config.yuanToTokens,
      yuanToPoints: config.yuanToPoints,
      pointsToTokens: config.pointsToTokens,
    };
  }
}

// 导出单例
export const tokenBillingService = new TokenBillingService();
