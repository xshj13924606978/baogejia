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
  | 'parse_document' // 文档解析
  | 'generate_proposal' // 生成方案
  | 'enhance_proposal' // 方案增强
  | 'export_quote' // 导出报价单
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
  upload_file: { points: -2, description: '上传文件' },
  parse_document: { points: -5, description: '文档解析' },
  generate_proposal: { points: -10, description: '生成方案' },
  enhance_proposal: { points: -15, description: '方案增强' },
  export_quote: { points: -3, description: '导出报价单' },
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
   * 增加用户积分（使用数据库原子操作防止竞态条件）
   */
  async addPoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string
  ): Promise<boolean> {
    try {
      // 使用数据库 RPC 原子更新积分（避免 read-modify-write 竞态条件）
      const { data: updateResult, error: updateError } = await this.supabase.rpc('add_points_atomic', {
        p_user_id: userId,
        p_points: points,
      });

      if (updateError) {
        // 如果 RPC 不存在，降级为直接 SQL 更新（仍优于 read-modify-write）
        if (updateError.message?.includes('does not exist') || updateError.code === '42883') {
          console.warn('[PointsService] RPC add_points_atomic 不存在，降级为直接更新');
          return this.addPointsFallback(userId, points, type, description);
        }
        console.error('[PointsService] 原子更新积分失败:', updateError.message);
        return false;
      }

      const newPoints = updateResult?.new_points ?? 0;
      await this.logPointRecord(userId, points, type, description || POINTS_RULES[type]?.description || '积分变动', newPoints);

      return true;
    } catch (error) {
      console.error('[PointsService] 增加积分异常:', error);
      return false;
    }
  }

  /**
   * 积分增加降级方法（当数据库 RPC 不可用时使用）
   * 注意：此方法仍有竞态条件风险，仅作为临时降级方案
   */
  private async addPointsFallback(
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

      return true;
    } catch (error) {
      console.error('[PointsService] 增加积分异常:', error);
      return false;
    }
  }

  /**
   * 扣除用户积分（使用原子操作防止竞态条件）
   */
  async deductPoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // 尝试使用数据库原子扣除 RPC（余额校验 + 扣除在同一事务）
      const { data: rpcResult, error: rpcError } = await this.supabase.rpc('deduct_points_atomic', {
        p_user_id: userId,
        p_points: points,
      });

      if (!rpcError && rpcResult?.success) {
        // 原子扣除成功，记录流水
        await this.logPointRecord(userId, -points, type, description || POINTS_RULES[type]?.description || '积分变动', rpcResult.new_points || 0);
        return { success: true };
      }

      // RPC 失败：可能是函数不存在或余额不足
      if (rpcResult?.success === false) {
        return { success: false, reason: rpcResult.reason || '积分不足' };
      }

      // 函数不存在时降级为原有方式
      if (rpcError && (rpcError.message?.includes('does not exist') || rpcError.code === '42883')) {
        console.warn('[PointsService] RPC deduct_points_atomic 不存在，降级为两步操作');
        const userPoints = await this.getUserPoints(userId);
        if (!userPoints) {
          return { success: false, reason: '用户不存在' };
        }
        if (userPoints.points < points) {
          return { success: false, reason: '积分不足' };
        }
        const success = await this.addPoints(userId, -points, type, description);
        return { success };
      }

      console.error('[PointsService] 原子扣除积分失败:', rpcError);
      return { success: false, reason: '系统错误' };
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
        console.error('[PointsService] 记录 Token 消费日志失败:', error.message);
      }
    } catch (error) {
      console.error('[PointsService] 记录 Token 消费日志异常:', error);
    }
  }

  /**
   * 管理员设置用户积分（使用原子操作防止竞态条件）
   */
  async adminSetPoints(
    adminId: string,
    userId: string,
    points: number,
    reason: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // 尝试使用数据库原子设置 RPC
      const { data: rpcResult, error: rpcError } = await this.supabase.rpc('set_points_atomic', {
        p_user_id: userId,
        p_new_points: points,
      });

      if (!rpcError && rpcResult?.success) {
        const diff = rpcResult.diff || 0;
        const type = diff >= 0 ? 'admin_grant' : 'admin_deduct';
        await this.logPointRecord(userId, diff, type, `管理员操作: ${reason}`, points);
        return { success: true };
      }

      // RPC 失败时降级为原有方式
      if (rpcError && (rpcError.message?.includes('does not exist') || rpcError.code === '42883')) {
        console.warn('[PointsService] RPC set_points_atomic 不存在，降级为直接更新');
      }

      // 降级：获取当前用户数据
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
        // 使用 jsonb_set 原子更新充值统计，避免 read-modify-write 竞态
        try {
          await this.supabase.rpc('recharge_stats_atomic', {
            p_user_id: userId,
            p_amount: amount,
            p_points: points,
          });
        } catch (rpcError: any) {
          // RPC 不存在时降级到直接更新
          if (rpcError?.message?.includes('does not exist') || rpcError?.code === '42883') {
            console.warn('[PointsService] recharge_stats_atomic RPC 不存在，降级为直接更新');
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
          } else {
            throw rpcError;
          }
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

      // 使用聚合查询避免加载全部日志
      const { data: consumedData } = await this.supabase
        .from('point_logs')
        .select('points')
        .eq('user_id', userId)
        .lt('points', 0);

      const { data: rechargeData } = await this.supabase
        .from('point_logs')
        .select('points')
        .eq('user_id', userId)
        .eq('type', 'recharge')
        .gt('points', 0);

      const consumedPoints = (consumedData || []).reduce((sum, log) => sum + Math.abs(log.points), 0);
      const rechargedPoints = (rechargeData || []).reduce((sum, log) => sum + log.points, 0);

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
