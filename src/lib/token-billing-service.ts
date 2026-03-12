import { getSupabaseClient } from '@/storage/database/supabase-client';
import { userLevelService } from './user-level-service';

/**
 * Token计费服务
 * 实现积分付费双轨制计费系统
 */

// 计费配置接口
export interface TokenPricingConfig {
  id: number;
  configName: string;
  yuanToTokens: number;      // 1元 = ? Tokens
  yuanToPoints: number;      // 1元 = ? 积分
  pointsToTokens: number;    // 1积分 = ? Tokens
  inputTokenRate: number;    // 输入Token倍率
  outputTokenRate: number;   // 输出Token倍率
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
  userId: number;
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
  userId: number;
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
  amount: number;        // 金额（元）
  points: number;        // 赠送积分
  level: number;         // 等级
  days: number;          // 有效期（天）
  features: string[];    // 功能列表
}

export class TokenBillingService {
  private supabase = getSupabaseClient();

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
        updatedAt: new Date(data.updated_at)
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
      tokenRate: (inputRate + outputRate) / 2
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
      case 1: rate = (config.level1InputRate + config.level1OutputRate) / 2; break;
      case 2: rate = (config.level2InputRate + config.level2OutputRate) / 2; break;
      case 3: rate = (config.level3InputRate + config.level3OutputRate) / 2; break;
      case 4: rate = (config.level4InputRate + config.level4OutputRate) / 2; break;
      case 5: rate = (config.level5InputRate + config.level5OutputRate) / 2; break;
    }

    const adjustedTokens = Math.ceil(totalTokens * rate);
    return Math.ceil(adjustedTokens / config.pointsToTokens);
  }

  /**
   * 获取用户余额
   */
  async getUserBalance(userId: number): Promise<UserTokenBalance | null> {
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
        createdAt: new Date(data.created_at)
      };
    } catch (error) {
      console.error('[TokenBillingService] 获取用户余额异常:', error);
      return null;
    }
  }

  /**
   * 创建用户余额记录
   */
  private async createUserBalance(userId: number): Promise<UserTokenBalance | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_token_balance')
        .insert({
          user_id: userId,
          points_balance: 0,
          token_balance: 0
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
        createdAt: new Date(data.created_at)
      };
    } catch (error) {
      console.error('[TokenBillingService] 创建用户余额异常:', error);
      return null;
    }
  }

  /**
   * 检查用户积分是否充足
   */
  async checkPointsBalance(userId: number, requiredPoints: number): Promise<boolean> {
    const balance = await this.getUserBalance(userId);
    if (!balance) {
      return false;
    }
    return balance.pointsBalance >= requiredPoints;
  }

  /**
   * 扣除用户积分
   */
  async deductPoints(
    userId: number,
    points: number,
    conversationId?: string,
    messageId?: string,
    serviceType?: string
  ): Promise<boolean> {
    try {
      const balance = await this.getUserBalance(userId);
      if (!balance) {
        console.error('[TokenBillingService] 用户余额不存在');
        return false;
      }

      if (balance.pointsBalance < points) {
        console.error('[TokenBillingService] 积分不足');
        return false;
      }

      // 更新余额
      const { error: updateError } = await this.supabase
        .from('user_token_balance')
        .update({
          points_balance: balance.pointsBalance - points,
          total_consumed_points: balance.totalConsumedPoints + points,
          last_updated: new Date()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[TokenBillingService] 更新用户余额失败:', updateError);
        return false;
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
    userId: number,
    consumption: TokenConsumption,
    conversationId?: string,
    messageId?: string,
    serviceType?: string
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('token_consumption_log')
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          message_id: messageId,
          input_tokens: consumption.inputTokens,
          output_tokens: consumption.outputTokens,
          total_tokens: consumption.totalTokens,
          points_consumed: consumption.pointsConsumed,
          token_rate: consumption.tokenRate,
          user_level: await this.getUserLevel(userId),
          service_type: serviceType
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
  private async getUserLevel(userId: number): Promise<number> {
    try {
      const levelData = await userLevelService.getUserLevel(userId.toString());
      return levelData?.level || 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * 充值积分（支付成功后调用）
   */
  async addPoints(
    userId: number,
    points: number,
    paymentId: string,
    amount?: number
  ): Promise<boolean> {
    try {
      const balance = await this.getUserBalance(userId);
      if (!balance) {
        console.error('[TokenBillingService] 用户余额不存在');
        return false;
      }

      // 更新余额
      const { error: updateError } = await this.supabase
        .from('user_token_balance')
        .update({
          points_balance: balance.pointsBalance + points,
          total_recharged_points: balance.totalRechargedPoints + points,
          total_recharged_amount: balance.totalRechargedAmount + (amount || 0),
          last_updated: new Date()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[TokenBillingService] 更新用户余额失败:', updateError);
        return false;
      }

      console.log(`[TokenBillingService] 用户 ${userId} 充值成功: +${points} 积分`);
      return true;
    } catch (error) {
      console.error('[TokenBillingService] 充值积分异常:', error);
      return false;
    }
  }

  /**
   * 获取可用套餐列表
   */
  getPaymentPlans(): PaymentPlan[] {
    return [
      {
        id: 'starter',
        name: '体验套餐',
        description: '适合初次体验用户',
        amount: 9.9,
        points: 100,
        level: 1,
        days: 7,
        features: ['100积分', '7天有效', '基础功能']
      },
      {
        id: 'basic',
        name: '基础套餐',
        description: '适合个人用户',
        amount: 29.9,
        points: 300,
        level: 2,
        days: 30,
        features: ['300积分', '30天有效', '基础功能', '等级2权限']
      },
      {
        id: 'vip_monthly',
        name: 'VIP月卡',
        description: '适合高频使用用户',
        amount: 99,
        points: 1000,
        level: 3,
        days: 30,
        features: ['1000积分', '30天VIP', 'VIP权限', '优先支持']
      },
      {
        id: 'vip_yearly',
        name: 'VIP年卡',
        description: '超值优惠',
        amount: 999,
        points: 12000,
        level: 3,
        days: 365,
        features: ['12000积分', '365天VIP', 'VIP权限', '优先支持', '省200元']
      },
      {
        id: 'enterprise',
        name: '企业套餐',
        description: '适合企业用户',
        amount: 2999,
        points: 50000,
        level: 4,
        days: 365,
        features: ['50000积分', '365天企业会员', '企业权限', '专属客服', 'API访问']
      }
    ];
  }

  /**
   * 购买等级权限（直接付费开通）
   */
  async purchaseLevel(
    userId: number,
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
      // 设置用户等级
      const success = await userLevelService.setUserLevel(userId.toString(), level);
      
      if (!success) {
        return { success: false, message: '设置等级失败' };
      }

      // 如果有有效期，设置过期时间
      let expiryDate: Date | undefined;
      if (days && days > 0) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        // TODO: 需要在user_levels表中添加expiry_date字段
      }

      return {
        success: true,
        newLevel: level,
        expiryDate,
        message: '购买成功'
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
    userId: number,
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
      const pointsRequired = Math.ceil(level * 100 * days / 30);

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

      // 设置用户等级
      const setSuccess = await userLevelService.setUserLevel(userId.toString(), level);
      if (!setSuccess) {
        // 回滚积分
        await this.addPoints(userId, pointsRequired, 'refund_' + Date.now());
        return { success: false, message: '设置等级失败' };
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      return {
        success: true,
        pointsConsumed: pointsRequired,
        expiryDate,
        message: '兑换成功'
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
    userId: number,
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

      return data.map(log => ({
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
        createdAt: new Date(log.created_at)
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
      pointsToTokens: config.pointsToTokens
    };
  }
}

// 导出单例
export const tokenBillingService = new TokenBillingService();
