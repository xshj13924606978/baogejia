/**
 * 统一积分服务
 * 管理用户积分的获取、消费、查询
 * 创建时间: 2026-03-17
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 积分操作类型
export type PointOperationType =
  | 'register' // 注册奖励
  | 'daily_login' // 每日登录
  | 'chat' // 对话消费
  | 'upload_file' // 上传文件
  | 'recharge' // 充值
  | 'admin_grant' // 管理员发放
  | 'admin_deduct' // 管理员扣除
  | 'exchange' // 兑换消费
  | 'refund' // 退款
  | 'invite_reward' // 邀请奖励
  | 'task_reward'; // 任务奖励

// 积分规则配置
export const POINTS_RULES: Record<string, { points: number; description: string }> = {
  register: { points: 100, description: '新用户注册奖励' },
  daily_login: { points: 10, description: '每日登录奖励' },
  chat: { points: -1, description: '对话消费' }, // 动态计算
  upload_file: { points: 5, description: '上传文件奖励' },
  invite_reward: { points: 50, description: '邀请好友奖励' },
  task_reward: { points: 20, description: '完成任务奖励' },
};

// 用户积分信息接口
export interface UserPointsInfo {
  userId: string;
  points: number;
  totalPoints: number;
  level: number;
}

// 积分记录接口
export interface PointRecord {
  id: string;
  userId: string;
  points: number;
  type: string;
  description: string;
  balanceAfter: number;
  createdAt: Date;
}

// 计费配置
export interface BillingConfig {
  yuanToTokens: number;
  yuanToPoints: number;
  pointsToTokens: number;
  level1Rate: number;
  level2Rate: number;
  level3Rate: number;
  level4Rate: number;
  level5Rate: number;
}

// 默认计费配置
const DEFAULT_BILLING_CONFIG: BillingConfig = {
  yuanToTokens: 1000,
  yuanToPoints: 100,
  pointsToTokens: 10,
  level1Rate: 1.0,
  level2Rate: 0.9,
  level3Rate: 0.8,
  level4Rate: 0.7,
  level5Rate: 0.6,
};

/**
 * 积分服务类
 */
export class PointsService {
  private static instance: PointsService;
  private supabase = getSupabaseClient();

  private constructor() {}

  static getInstance(): PointsService {
    if (!PointsService.instance) {
      PointsService.instance = new PointsService();
    }
    return PointsService.instance;
  }

  /**
   * 获取用户积分信息
   */
  async getUserPoints(userId: string): Promise<UserPointsInfo | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, metadata')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('[PointsService] 获取用户失败:', error?.message);
        return null;
      }

      const metadata = data.metadata || {};
      return {
        userId: data.id,
        points: metadata.points || 0,
        totalPoints: metadata.total_points || 0,
        level: metadata.level || 1,
      };
    } catch (error) {
      console.error('[PointsService] 获取用户积分异常:', error);
      return null;
    }
  }

  /**
   * 增加用户积分
   */
  async addPoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string
  ): Promise<boolean> {
    try {
      // 获取当前用户数据
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('metadata')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        console.error('[PointsService] 获取用户失败:', userError?.message);
        return false;
      }

      const metadata = user.metadata || {};
      const currentPoints = metadata.points || 0;
      const totalPoints = metadata.total_points || 0;
      const newPoints = currentPoints + points;
      const newTotalPoints = points > 0 ? totalPoints + points : totalPoints;

      // 更新用户积分
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          metadata: {
            ...metadata,
            points: newPoints,
            total_points: newTotalPoints,
            last_points_update: new Date().toISOString(),
          },
        })
        .eq('id', userId);

      if (updateError) {
        console.error('[PointsService] 更新积分失败:', updateError.message);
        return false;
      }

      // 记录积分流水
      await this.logPointRecord(userId, points, type, description || POINTS_RULES[type]?.description || '积分变动', newPoints);

      console.log(`[PointsService] 用户 ${userId} ${points > 0 ? '增加' : '扣除'} ${Math.abs(points)} 积分, 当前: ${newPoints}`);
      return true;
    } catch (error) {
      console.error('[PointsService] 增加积分异常:', error);
      return false;
    }
  }

  /**
   * 扣除用户积分
   */
  async deductPoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      const userPoints = await this.getUserPoints(userId);
      if (!userPoints) {
        return { success: false, reason: '用户不存在' };
      }

      if (userPoints.points < points) {
        return { success: false, reason: '积分不足' };
      }

      const success = await this.addPoints(userId, -points, type, description);
      return { success };
    } catch (error) {
      console.error('[PointsService] 扣除积分异常:', error);
      return { success: false, reason: '系统错误' };
    }
  }

  /**
   * 检查用户积分是否充足
   */
  async checkPointsBalance(userId: string, requiredPoints: number): Promise<boolean> {
    const userPoints = await this.getUserPoints(userId);
    if (!userPoints) return false;
    return userPoints.points >= requiredPoints;
  }

  /**
   * 获取计费配置
   */
  getBillingConfig(): BillingConfig {
    return DEFAULT_BILLING_CONFIG;
  }

  /**
   * 计算 Token 消费积分
   */
  async calculatePointsForTokens(userId: string, tokens: number): Promise<number> {
    const config = this.getBillingConfig();
    const userPoints = await this.getUserPoints(userId);
    const level = userPoints?.level || 1;

    // 根据等级获取倍率
    let rate = config.level1Rate;
    switch (level) {
      case 2: rate = config.level2Rate; break;
      case 3: rate = config.level3Rate; break;
      case 4: rate = config.level4Rate; break;
      case 5: rate = config.level5Rate; break;
    }

    // 计算积分: (tokens * rate) / pointsToTokens
    const points = Math.ceil((tokens * rate) / config.pointsToTokens);
    return Math.max(1, points); // 最少消费 1 积分
  }

  /**
   * Token 消费并扣除积分
   */
  async consumeTokens(
    userId: string,
    tokens: number,
    conversationId?: string,
    messageId?: string
  ): Promise<{ success: boolean; pointsConsumed: number; reason?: string }> {
    try {
      // 计算需要扣除的积分
      const pointsToDeduct = await this.calculatePointsForTokens(userId, tokens);

      // 检查余额
      const hasEnough = await this.checkPointsBalance(userId, pointsToDeduct);
      if (!hasEnough) {
        return { success: false, pointsConsumed: 0, reason: '积分不足' };
      }

      // 扣除积分
      const description = `对话消费 ${tokens} tokens`;
      const result = await this.deductPoints(userId, pointsToDeduct, 'chat', description);

      if (result.success) {
        // 记录 Token 消费日志
        await this.logTokenConsumption(userId, tokens, pointsToDeduct, conversationId, messageId);
        return { success: true, pointsConsumed: pointsToDeduct };
      }

      return { success: false, pointsConsumed: 0, reason: result.reason };
    } catch (error) {
      console.error('[PointsService] Token消费异常:', error);
      return { success: false, pointsConsumed: 0, reason: '系统错误' };
    }
  }

  /**
   * 估算文本的 Token 数量
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

    // 估算 Token 数
    const chineseTokens = chineseCount * 0.6;
    const englishTokens = englishCount * 0.75;
    const numberTokens = numberCount * 0.3;

    return Math.ceil(chineseTokens + englishTokens + numberTokens);
  }

  /**
   * 获取用户积分流水
   */
  async getPointRecords(
    userId: string,
    options?: { limit?: number; offset?: number; type?: string }
  ): Promise<PointRecord[]> {
    try {
      let query = this.supabase
        .from('point_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options?.type) {
        query = query.eq('type', options.type);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[PointsService] 获取积分流水失败:', error.message);
        return [];
      }

      return (data || []).map((item) => ({
        id: item.id,
        userId: item.user_id,
        points: item.points,
        type: item.type,
        description: item.description,
        balanceAfter: item.balance_after || 0,
        createdAt: new Date(item.created_at),
      }));
    } catch (error) {
      console.error('[PointsService] 获取积分流水异常:', error);
      return [];
    }
  }

  /**
   * 记录积分流水
   */
  private async logPointRecord(
    userId: string,
    points: number,
    type: string,
    description: string,
    balanceAfter: number
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from('point_logs').insert({
        user_id: userId,
        points,
        type,
        description,
        balance_after: balanceAfter,
        created_at: new Date(),
      });

      if (error) {
        console.error('[PointsService] 记录积分流水失败:', error.message);
      }
    } catch (error) {
      console.error('[PointsService] 记录积分流水异常:', error);
    }
  }

  /**
   * 记录 Token 消费日志
   */
  private async logTokenConsumption(
    userId: string,
    tokens: number,
    pointsConsumed: number,
    conversationId?: string,
    messageId?: string
  ): Promise<void> {
    try {
      // 尝试记录到 token_consumption_log 表
      const { error } = await this.supabase.from('token_consumption_log').insert({
        user_id: userId,
        conversation_id: conversationId,
        message_id: messageId,
        total_tokens: tokens,
        points_consumed: pointsConsumed,
        created_at: new Date(),
      });

      if (error) {
        // 表可能不存在，只记录日志
        console.log(`[PointsService] Token消费: 用户=${userId}, tokens=${tokens}, 积分=${pointsConsumed}`);
      }
    } catch (error) {
      console.log(`[PointsService] Token消费: 用户=${userId}, tokens=${tokens}, 积分=${pointsConsumed}`);
    }
  }

  /**
   * 管理员设置用户积分
   */
  async adminSetPoints(
    adminId: string,
    userId: string,
    points: number,
    reason: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // 获取当前用户数据
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('metadata')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return { success: false, reason: '用户不存在' };
      }

      const metadata = user.metadata || {};
      const oldPoints = metadata.points || 0;
      const diff = points - oldPoints;

      // 更新用户积分
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          metadata: {
            ...metadata,
            points,
            total_points: diff > 0 ? (metadata.total_points || 0) + diff : metadata.total_points,
            last_points_update: new Date().toISOString(),
          },
        })
        .eq('id', userId);

      if (updateError) {
        return { success: false, reason: '更新失败' };
      }

      // 记录积分流水
      const type = diff >= 0 ? 'admin_grant' : 'admin_deduct';
      await this.logPointRecord(userId, diff, type, `管理员操作: ${reason}`, points);

      console.log(`[PointsService] 管理员 ${adminId} 设置用户 ${userId} 积分为 ${points}`);
      return { success: true };
    } catch (error) {
      console.error('[PointsService] 管理员设置积分异常:', error);
      return { success: false, reason: '系统错误' };
    }
  }

  /**
   * 充值积分
   */
  async rechargePoints(
    userId: string,
    points: number,
    amount: number,
    paymentId: string
  ): Promise<boolean> {
    try {
      const success = await this.addPoints(userId, points, 'recharge', `充值 ${points} 积分 (支付ID: ${paymentId})`);

      if (success) {
        // 更新充值统计
        const { data: user } = await this.supabase
          .from('users')
          .select('metadata')
          .eq('id', userId)
          .single();

        if (user) {
          const metadata = user.metadata || {};
          await this.supabase
            .from('users')
            .update({
              metadata: {
                ...metadata,
                total_recharged: (metadata.total_recharged || 0) + amount,
                total_recharged_points: (metadata.total_recharged_points || 0) + points,
              },
            })
            .eq('id', userId);
        }
      }

      return success;
    } catch (error) {
      console.error('[PointsService] 充值积分异常:', error);
      return false;
    }
  }

  /**
   * 获取用户积分统计
   */
  async getUserPointsStats(userId: string): Promise<{
    points: number;
    totalPoints: number;
    consumedPoints: number;
    rechargedPoints: number;
  }> {
    try {
      const userPoints = await this.getUserPoints(userId);
      if (!userPoints) {
        return { points: 0, totalPoints: 0, consumedPoints: 0, rechargedPoints: 0 };
      }

      // 获取消费统计
      const { data: logs } = await this.supabase
        .from('point_logs')
        .select('points')
        .eq('user_id', userId);

      let consumedPoints = 0;
      let rechargedPoints = 0;

      (logs || []).forEach((log) => {
        if (log.points < 0) {
          consumedPoints += Math.abs(log.points);
        } else if (log.type === 'recharge') {
          rechargedPoints += log.points;
        }
      });

      return {
        points: userPoints.points,
        totalPoints: userPoints.totalPoints,
        consumedPoints,
        rechargedPoints,
      };
    } catch (error) {
      console.error('[PointsService] 获取积分统计异常:', error);
      return { points: 0, totalPoints: 0, consumedPoints: 0, rechargedPoints: 0 };
    }
  }
}

// 导出单例实例
export const pointsService = PointsService.getInstance();
