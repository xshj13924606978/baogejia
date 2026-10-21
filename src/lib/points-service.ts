/**
 * 统一积分服务
 * 管理用户积分的获取、消费、查询
 * 创建时间: 2026-03-17
 */

import { getSupabaseClient, getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { createNotification, createPointsNotification } from '@/lib/notification-service';
import { getSiteConfig, getSiteConfigValues } from '@/lib/site-config';
import { userLevelService } from '@/lib/user-level-service';
import { tokenBillingService } from '@/lib/token-billing-service';
import { getTradeConfigValue } from '@/lib/trade-config-service';

// 积分操作类型
export type PointOperationType =
  | 'register' // 注册奖励
  | 'daily_login' // 每日登录
  | 'chat' // 对话消费
  | 'upload_file' // 上传文件
  | 'parse_document' // 文档解析
  | 'generate_proposal' // 生成方案
  | 'generate_quote' // 生成报价单
  | 'enhance_proposal' // 方案增强
  | 'export_quote' // 导出报价单
  | 'recharge' // 充值
  | 'admin_grant' // 管理员发放
  | 'admin_deduct' // 管理员扣除
  | 'exchange' // 兑换消费
  | 'refund' // 退款
  | 'invite_reward' // 邀请奖励
  | 'task_reward' // 任务奖励
  | 'knowledge_share' // 资料被下载/查看的分成收益
  | 'withdraw' // 提现扣减（打款成功，扣减已冻结积分）
  | 'withdraw_freeze' // 提现冻结（申请时：可用余额 → 冻结余额）
  | 'withdraw_refund' // 提现退回（拒绝/打款失败：冻结余额 → 可用余额）
  | 'membership_purchase' // 会员购买/续费/升级（积分支付）
  | 'membership_refund' // 会员降级退差额
  | 'mall_exchange'; // 商城兑换消费

// 积分规则配置（数值与 site_config 默认值保持一致，site_config 为唯一权威配置源）
// 注意：消耗类规则以负数表示，site_config 中对应配置为正数，读取时按符号转换
export const POINTS_RULES: Record<string, { points: number; description: string }> = {
  register: { points: 100, description: '新用户注册奖励' },
  daily_login: { points: 10, description: '每日登录奖励' },
  chat: { points: -1, description: '对话消费' }, // 动态计算
  upload_file: { points: -5, description: '上传文件' },
  parse_document: { points: -20, description: '文档解析' },
  generate_proposal: { points: -30, description: '生成方案' },
  generate_quote: { points: -5, description: '生成报价单' },
  enhance_proposal: { points: -15, description: '方案增强' },
  export_quote: { points: -5, description: '导出报价单' },
  invite_reward: { points: 50, description: '邀请好友奖励' },
  task_reward: { points: 100, description: '完成任务奖励' },
};

// site_config 中积分规则配置的 key 映射（与 /api/migrate/site-config 及 066 迁移默认值一致）
const POINTS_CONFIG_KEY_MAP: Record<string, string> = {
  register: 'register_points',
  daily_login: 'daily_login_points',
  upload_file: 'upload_file_points',
  parse_document: 'parse_document_points',
  generate_proposal: 'generate_proposal_points',
  generate_quote: 'generate_quote_points',
  enhance_proposal: 'enhance_proposal_points',
  export_quote: 'export_quote_points',
  invite_reward: 'invite_reward_points',
  task_reward: 'task_reward_points',
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
        .select('id, points, total_points, metadata')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('[PointsService] 获取用户失败:', error?.message);
        return null;
      }

      const metadata = data.metadata || {};
      // 兼容历史数据：points 列与 metadata.points 并存，取两者较大值
      const points = Math.max(typeof data.points === 'number' ? data.points : 0, metadata.points || 0);
      const totalPoints = Math.max(typeof data.total_points === 'number' ? data.total_points : 0, metadata.total_points || 0);
      return {
        userId: data.id,
        points,
        totalPoints,
        level: metadata.level || 1,
      };
    } catch (error) {
      console.error('[PointsService] 获取用户积分异常:', error);
      return null;
    }
  }

  /**
   * 幂等预查：reference_id 是否已处理（已在 point_records 写入流水）
   */
  private async isReferenceIdProcessed(userId: string, referenceId?: string): Promise<boolean> {
    if (!referenceId) return false;
    try {
      const { data } = await this.supabase
        .from('point_records')
        .select('id')
        .eq('user_id', userId)
        .eq('reference_id', referenceId)
        .maybeSingle();
      return !!data;
    } catch (error) {
      console.error('[PointsService] 幂等预查异常:', error);
      return false;
    }
  }

  /**
   * 增加用户积分（使用数据库原子操作防止竞态条件）
   */
  async addPoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string,
    referenceId?: string
  ): Promise<boolean> {
    try {
      // 服务层幂等预查：referenceId 已处理则直接返回成功（防止重复发放）
      if (await this.isReferenceIdProcessed(userId, referenceId)) {
        console.log('[PointsService] addPoints 幂等重放，跳过:', referenceId);
        return true;
      }

      // 使用数据库 RPC 原子更新积分（避免 read-modify-write 竞态条件）
      const { data: updateResult, error: updateError } = await this.supabase.rpc('add_points_atomic', {
        p_user_id: userId,
        p_points: points,
        p_type: type,
        p_description: description || POINTS_RULES[type]?.description || '积分变动',
        p_reference_id: referenceId || null,
      });

      if (updateError) {
        // 如果 RPC 不存在，降级为直接 SQL 更新（仍优于 read-modify-write）
        if (updateError.message?.includes('does not exist') || updateError.code === '42883') {
          console.warn('[PointsService] RPC add_points_atomic 不存在，降级为直接更新');
          return this.addPointsFallback(userId, points, type, description, referenceId);
        }
        console.error('[PointsService] 原子更新积分失败:', updateError.message);
        return false;
      }

      // 注：RPC 内部已原子写入 point_logs + point_records 并同步 user_levels，无需重复记录流水
      // 写入真实通知（失败不影响积分主流程）
      await createPointsNotification({
        userId,
        points,
        type,
        description: description || POINTS_RULES[type]?.description || '积分变动',
        referenceId,
      });

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
    description?: string,
    referenceId?: string
  ): Promise<boolean> {
    try {
      // 幂等保护：若 referenceId 已存在，直接返回成功
      if (referenceId) {
        const { data: existing } = await this.supabase
          .from('point_records')
          .select('id')
          .eq('user_id', userId)
          .eq('reference_id', referenceId)
          .maybeSingle();
        if (existing) {
          console.log('[PointsService] Fallback 幂等重放，跳过:', referenceId);
          return true;
        }
      }
      // 获取当前用户数据
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('points, total_points, metadata')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        console.error('[PointsService] 获取用户失败:', userError?.message);
        return false;
      }

      const metadata = user.metadata || {};
      // 兼容历史数据：points 列与 metadata.points 并存，取两者较大值
      const currentPoints = Math.max(typeof user.points === 'number' ? user.points : 0, metadata.points || 0);
      const totalPoints = Math.max(typeof user.total_points === 'number' ? user.total_points : 0, metadata.total_points || 0);
      const newPoints = currentPoints + points;
      const newTotalPoints = points > 0 ? totalPoints + points : totalPoints;

      // 更新用户积分
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          points: newPoints,
          total_points: newTotalPoints,
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

      // #202608302400 阶段4 P1-2：降级路径同样需要同步三处存储
      // 正常路径由 add_points_atomic（迁移 118）在数据库事务内完成
      await this.syncPointsToThreeStores(userId, newPoints);

      // 记录积分流水
      await this.logPointRecord(userId, points, type, description || POINTS_RULES[type]?.description || '积分变动', newPoints, referenceId);

      // 写入真实通知（失败不影响积分主流程）
      await createPointsNotification({
        userId,
        points,
        type,
        description: description || POINTS_RULES[type]?.description || '积分变动',
        referenceId,
      });

      return true;
    } catch (error) {
      console.error('[PointsService] 增加积分异常:', error);
      return false;
    }
  }

  /**
   * 同步积分到另外两处存储（user_levels / user_token_balance）
   *
   * #202608302400 阶段4 P1-2：积分三处存储统一
   * - 正常路径：由 add_points_atomic / deduct_points_atomic / set_points_atomic
   *   （迁移 118）在数据库事务内原子完成，本方法不会被调用。
   * - 降级路径：RPC 不可用时（addPointsFallback）由本方法补同步，
   *   保证「users.points / user_token_balance.points_balance / user_levels.current_points」不脱节。
   *
   * 任一步失败仅告警不阻断：积分主余额（users.points）已写入成功，
   * 不一致可由 sync_user_points() / sync_all_users_points() 对账修复。
   *
   * @param userId 用户ID
   * @param newPoints 最新积分余额
   */
  private async syncPointsToThreeStores(userId: string, newPoints: number): Promise<void> {
    // 1. user_levels：按阈值重算等级 + 同步积分
    try {
      const { data: reached } = await this.supabase
        .from('level_definitions')
        .select('level')
        .lte('required_points', newPoints)
        .order('level', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: next } = await this.supabase
        .from('level_definitions')
        .select('required_points')
        .gt('required_points', newPoints)
        .order('required_points', { ascending: true })
        .limit(1)
        .maybeSingle();

      await this.supabase
        .from('user_levels')
        .upsert(
          {
            user_id: userId,
            level: reached?.level ?? 1,
            current_points: newPoints,
            next_level_points: (next as any)?.required_points ?? newPoints,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
    } catch (error) {
      console.warn('[PointsService] 同步 user_levels 失败:', error);
    }

    // 2. user_token_balance：同步积分余额（不动 token_balance）
    try {
      await this.supabase
        .from('user_token_balance')
        .upsert(
          {
            user_id: userId,
            points_balance: newPoints,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
    } catch (error) {
      console.warn('[PointsService] 同步 user_token_balance 失败:', error);
    }
  }

  /**
   * 扣除用户积分（使用原子操作防止竞态条件）
   */
  async deductPoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string,
    referenceId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // 服务层幂等预查：referenceId 已处理则直接返回成功（防止重复扣减）
      if (await this.isReferenceIdProcessed(userId, referenceId)) {
        console.log('[PointsService] deductPoints 幂等重放，跳过:', referenceId);
        return { success: true };
      }

      // 尝试使用数据库原子扣除 RPC（余额校验 + 扣除在同一事务）
      const { data: rpcResult, error: rpcError } = await this.supabase.rpc('deduct_points_atomic', {
        p_user_id: userId,
        p_points: points,
        p_type: type,
        p_description: description || POINTS_RULES[type]?.description || '积分变动',
        p_reference_id: referenceId || null,
      });

      if (!rpcError && rpcResult?.success) {
        // 原子扣除成功（RPC 内部已写 point_logs + point_records 并同步 user_levels）
        // 写入真实通知（失败不影响积分主流程）
        await createPointsNotification({
          userId,
          points: -points,
          type,
          description: description || POINTS_RULES[type]?.description || '积分变动',
          referenceId,
        });
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
        const success = await this.addPoints(userId, -points, type, description, referenceId);
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
   * 退还积分（通过 add_points_atomic 并标记为 refund，referenceId 幂等）
   */
  async refundPoints(
    userId: string,
    points: number,
    referenceId: string,
    description?: string
  ): Promise<boolean> {
    try {
      const success = await this.addPoints(
        userId,
        points,
        'refund',
        description || `积分退款`,
        referenceId
      );
      return success;
    } catch (error) {
      console.error('[PointsService] 退还积分异常:', error);
      return false;
    }
  }

  // ============================================================
  // 积分冻结 / 解冻 / 扣减（#20260831-1600 P1-10）
  //
  // 语义：
  //   users.points         = 可用积分（冻结时已扣除）
  //   users.frozen_points  = 冻结中积分
  // 三个动作全部走数据库 SECURITY DEFINER 原子函数（迁移 123），
  // 内部同步 users / user_token_balance / point_logs / point_records，
  // 并以 reference_id 保证幂等。
  // ============================================================

  /**
   * 冻结积分：可用余额 → 冻结余额
   * 用于提现申请（审核期间积分不可再消费，但未真正扣除）
   */
  async freezePoints(
    userId: string,
    points: number,
    description?: string,
    referenceId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      if (!Number.isInteger(points) || points <= 0) {
        return { success: false, reason: '冻结积分必须为正整数' };
      }
      if (await this.isReferenceIdProcessed(userId, referenceId)) {
        return { success: true };
      }

      const { data, error } = await this.supabase.rpc('freeze_points_atomic', {
        p_user_id: userId,
        p_points: points,
        p_type: 'withdraw_freeze',
        p_description: description || '积分冻结',
        p_reference_id: referenceId || null,
      });

      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42883') {
          console.error('[PointsService] freeze_points_atomic 不存在，请先应用迁移 123');
          return { success: false, reason: '冻结功能未就绪（缺少数据库函数）' };
        }
        console.error('[PointsService] 冻结积分失败:', error.message);
        return { success: false, reason: error.message };
      }
      if (data?.success === false) {
        return { success: false, reason: data.reason || '冻结失败' };
      }

      await createPointsNotification({
        userId,
        points: -points,
        type: 'withdraw_freeze',
        description: description || '积分冻结',
        referenceId,
      });
      return { success: true };
    } catch (error) {
      console.error('[PointsService] 冻结积分异常:', error);
      return { success: false, reason: '冻结积分异常' };
    }
  }

  /**
   * 解冻积分：冻结余额 → 可用余额
   * 用于提现被拒绝 / 打款失败
   * 注意：referenceId 必须与冻结时不同（约定使用 withdraw_unfreeze_{id}），
   *       否则会被幂等预查误判为已处理。
   */
  async unfreezePoints(
    userId: string,
    points: number,
    description?: string,
    referenceId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      if (!Number.isInteger(points) || points <= 0) {
        return { success: false, reason: '解冻积分必须为正整数' };
      }
      if (await this.isReferenceIdProcessed(userId, referenceId)) {
        return { success: true };
      }

      const { data, error } = await this.supabase.rpc('unfreeze_points_atomic', {
        p_user_id: userId,
        p_points: points,
        p_type: 'withdraw_refund',
        p_description: description || '积分解冻退回',
        p_reference_id: referenceId || null,
      });

      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42883') {
          console.error('[PointsService] unfreeze_points_atomic 不存在，请先应用迁移 123');
          return { success: false, reason: '解冻功能未就绪（缺少数据库函数）' };
        }
        console.error('[PointsService] 解冻积分失败:', error.message);
        return { success: false, reason: error.message };
      }
      if (data?.success === false) {
        return { success: false, reason: data.reason || '解冻失败' };
      }

      await createPointsNotification({
        userId,
        points,
        type: 'withdraw_refund',
        description: description || '积分解冻退回',
        referenceId,
      });
      return { success: true };
    } catch (error) {
      console.error('[PointsService] 解冻积分异常:', error);
      return { success: false, reason: '解冻积分异常' };
    }
  }

  /**
   * 扣减已冻结积分（真正扣除，不再退回可用余额）
   * 用于提现打款成功
   */
  async consumeFrozenPoints(
    userId: string,
    points: number,
    description?: string,
    referenceId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      if (!Number.isInteger(points) || points <= 0) {
        return { success: false, reason: '扣减积分必须为正整数' };
      }
      if (await this.isReferenceIdProcessed(userId, referenceId)) {
        return { success: true };
      }

      const { data, error } = await this.supabase.rpc('consume_frozen_points_atomic', {
        p_user_id: userId,
        p_points: points,
        p_type: 'withdraw',
        p_description: description || '提现扣减',
        p_reference_id: referenceId || null,
      });

      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42883') {
          console.error('[PointsService] consume_frozen_points_atomic 不存在，请先应用迁移 123');
          return { success: false, reason: '扣减功能未就绪（缺少数据库函数）' };
        }
        console.error('[PointsService] 扣减冻结积分失败:', error.message);
        return { success: false, reason: error.message };
      }
      if (data?.success === false) {
        return { success: false, reason: data.reason || '扣减失败' };
      }

      await createPointsNotification({
        userId,
        points: -points,
        type: 'withdraw',
        description: description || '提现扣减',
        referenceId,
      });
      return { success: true };
    } catch (error) {
      console.error('[PointsService] 扣减冻结积分异常:', error);
      return { success: false, reason: '扣减冻结积分异常' };
    }
  }

  /** 读取用户可用积分与冻结积分 */
  async getUserFrozenPoints(userId: string): Promise<{ available: number; frozen: number }> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('points, frozen_points')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return { available: 0, frozen: 0 };
      return {
        available: Number(data.points) || 0,
        frozen: Number((data as any).frozen_points) || 0,
      };
    } catch (error) {
      console.error('[PointsService] 查询冻结积分异常:', error);
      return { available: 0, frozen: 0 };
    }
  }

  /**
   * 获取计费配置（优先从 site_config 读取，失败则使用默认配置）
   */
  async getBillingConfig(): Promise<BillingConfig> {
    try {
      // #202608302200 配置数据动态同步：基础兑换比例以统一数据源 trade_config 为准
      // （与「交易配置」中心 / 积分兑换规则页面实时联动），site_config 仅作历史回退。
      const [tcRecharge, tcToken] = await Promise.all([
        getTradeConfigValue<{ rate?: number }>('points.recharge_rate'),
        getTradeConfigValue<{ rate?: number }>('points.token_rate'),
      ]);
      const tcY2P = Number(tcRecharge?.rate);
      const tcP2T = Number(tcToken?.rate);

      const config = await getSiteConfig<Partial<BillingConfig> | BillingConfig | null>(
        'points_exchange_config',
        null
      );
      const merged: BillingConfig = {
        yuanToTokens: config?.yuanToTokens ?? DEFAULT_BILLING_CONFIG.yuanToTokens,
        yuanToPoints: config?.yuanToPoints ?? DEFAULT_BILLING_CONFIG.yuanToPoints,
        pointsToTokens: config?.pointsToTokens ?? DEFAULT_BILLING_CONFIG.pointsToTokens,
        level1Rate: config?.level1Rate ?? DEFAULT_BILLING_CONFIG.level1Rate,
        level2Rate: config?.level2Rate ?? DEFAULT_BILLING_CONFIG.level2Rate,
        level3Rate: config?.level3Rate ?? DEFAULT_BILLING_CONFIG.level3Rate,
        level4Rate: config?.level4Rate ?? DEFAULT_BILLING_CONFIG.level4Rate,
        level5Rate: config?.level5Rate ?? DEFAULT_BILLING_CONFIG.level5Rate,
      };
      if (Number.isFinite(tcY2P) && tcY2P > 0) merged.yuanToPoints = tcY2P;
      if (Number.isFinite(tcP2T) && tcP2T > 0) merged.pointsToTokens = tcP2T;
      merged.yuanToTokens = merged.yuanToPoints * merged.pointsToTokens;
      return merged;
    } catch (error) {
      console.error('[PointsService] 读取计费配置失败:', error);
    }
    return DEFAULT_BILLING_CONFIG;
  }

  /**
   * 获取积分规则配置（优先从 site_config 读取，失败则使用默认规则）
   * site_config 中消耗类规则存为正数（如 upload_file_points=5），
   * 返回值与 POINTS_RULES 保持一致：消耗类为负数。
   */
  async getPointRule(
    type: PointOperationType
  ): Promise<{ points: number; description: string }> {
    try {
      const configKey = POINTS_CONFIG_KEY_MAP[type];
      if (configKey) {
        const values = await getSiteConfigValues([configKey]);
        const raw = values[configKey];
        if (raw !== null && raw !== undefined && raw !== '') {
          const points = parseFloat(raw);
          if (!Number.isNaN(points)) {
            const defaultRule = POINTS_RULES[type];
            // 消耗类规则在 POINTS_RULES 中为负数，site_config 中为正数，按符号转换
            const sign = defaultRule && defaultRule.points < 0 ? -1 : 1;
            return {
              points: points * sign,
              description: defaultRule?.description ?? '积分变动',
            };
          }
        }
      }
    } catch (error) {
      console.error(`[PointsService] 读取 site_config 规则 ${type} 失败:`, error);
    }
    return POINTS_RULES[type] ?? { points: 0, description: '积分变动' };
  }

  /**
   * 获取方案增强按档定价积分
   */
  async getEnhanceProposalPoints(level: string | number): Promise<number> {
    const levelKey = String(level).toLowerCase();
    try {
      const points = await getSiteConfig<number | null>(`points_rule_enhance_${levelKey}`, null);
      if (typeof points === 'number') {
        return points;
      }
    } catch (error) {
      console.error(`[PointsService] 读取方案增强档位 ${levelKey} 配置失败:`, error);
    }

    // 默认档位定价
    const defaultMap: Record<string, number> = {
      basic: -10,
      standard: -15,
      professional: -25,
      premium: -40,
    };
    return defaultMap[levelKey] ?? POINTS_RULES.enhance_proposal?.points ?? -15;
  }

  /**
   * 计算 Token 消费积分
   */
  async calculatePointsForTokens(userId: string, tokens: number): Promise<number> {
    const config = await this.getBillingConfig();
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
    messageId?: string,
    referenceId?: string
  ): Promise<{
    success: boolean;
    pointsConsumed: number;
    reason?: string;
    requiredPoints?: number;
    balance?: number;
    insufficientBalance?: boolean;
    shortfall?: number;
  }> {
    try {
      // 计算本次应扣积分（按实际 Token 与用户等级动态计算）
      const pointsToDeduct = await this.calculatePointsForTokens(userId, tokens);

      // 读取真实余额（与扣减同源，避免"预检通过、结算失败"的口径不一致）
      const userPoints = await this.getUserPoints(userId);
      if (!userPoints) {
        return { success: false, pointsConsumed: 0, reason: '用户不存在', requiredPoints: pointsToDeduct };
      }

      const balance = userPoints.points;
      if (balance <= 0) {
        return {
          success: false,
          pointsConsumed: 0,
          reason: '积分不足',
          requiredPoints: pointsToDeduct,
          balance: 0,
          insufficientBalance: true,
          shortfall: pointsToDeduct,
        };
      }

      // 余额不足以支付全额时按剩余余额扣减（扣至 0）并回报差额，
      // 避免「AI 已完整输出但零扣费」的漏计费（#20260830-2001）
      const actualDeduct = Math.min(balance, pointsToDeduct);
      const shortfall = pointsToDeduct - actualDeduct;
      const insufficientBalance = shortfall > 0;

      // 扣除积分（带 referenceId 幂等）
      const description = insufficientBalance
        ? `对话消费 ${tokens} tokens（余额不足，实扣 ${actualDeduct}/${pointsToDeduct} 积分）`
        : `对话消费 ${tokens} tokens`;
      const result = await this.deductPoints(
        userId,
        actualDeduct,
        'chat',
        description,
        referenceId || `chat_${conversationId || 'unknown'}_${messageId || Date.now()}`
      );

      if (result.success) {
        // 记录 Token 消费日志
        await this.logTokenConsumption(userId, tokens, actualDeduct, conversationId, messageId);
        return {
          success: true,
          pointsConsumed: actualDeduct,
          requiredPoints: pointsToDeduct,
          balance: Math.max(0, balance - actualDeduct),
          insufficientBalance,
          shortfall,
        };
      }

      return {
        success: false,
        pointsConsumed: 0,
        reason: result.reason,
        requiredPoints: pointsToDeduct,
        balance,
        insufficientBalance: true,
        shortfall: pointsToDeduct,
      };
    } catch (error) {
      console.error('[PointsService] Token消费异常:', error);
      return { success: false, pointsConsumed: 0, reason: '系统错误' };
    }
  }

  /**
   * 统一积分扣减入口（reference_id 幂等）
   * 等价于 deductPoints，作为旧 consumePoints 调用的兼容入口
   */
  async consumePoints(
    userId: string,
    points: number,
    type: PointOperationType,
    description?: string,
    referenceId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    return this.deductPoints(userId, points, type, description, referenceId);
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
    balanceAfter: number,
    referenceId?: string
  ): Promise<void> {
    try {
      const record: any = {
        user_id: userId,
        points,
        type,
        description,
        balance_after: balanceAfter,
        created_at: new Date(),
      };
      if (referenceId) {
        record.reference_id = referenceId;
      }

      // 同时写入 point_logs 和 point_records，确保两套表都有数据
      const [logsResult, recordsResult] = await Promise.all([
        this.supabase.from('point_logs').insert(record),
        this.supabase.from('point_records').insert(record),
      ]);

      if (logsResult.error) {
        console.error('[PointsService] 记录 point_logs 失败:', logsResult.error.message);
      }
      if (recordsResult.error) {
        console.error('[PointsService] 记录 point_records 失败:', recordsResult.error.message);
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
      // token_consumption_log 启用了 RLS 且无匿名写入策略，服务端写入需使用服务角色客户端
      let writer = this.supabase;
      try {
        writer = getSupabaseServiceClient();
      } catch (e) {
        console.error('[PointsService] 服务角色客户端不可用，回退匿名客户端写入消费日志:', e);
      }

      // token_consumption_log 存在两套历史结构：
      //   014 版：conversation_id/message_id/total_tokens/points_consumed
      //   039 版：session_id/tokens_used/points_cost/description
      // 按列可用性回退写入，避免结构差异导致消费流水静默丢失（#20260830-2001）
      const { error } = await writer.from('token_consumption_log').insert({
        user_id: userId,
        conversation_id: conversationId,
        message_id: messageId,
        total_tokens: tokens,
        points_consumed: pointsConsumed,
        created_at: new Date(),
      });

      if (!error) {
        return;
      }

      const { error: legacyError } = await writer.from('token_consumption_log').insert({
        user_id: userId,
        session_id: conversationId || messageId || null,
        tokens_used: tokens,
        points_cost: pointsConsumed,
        description: `对话消费 ${tokens} tokens`,
        created_at: new Date(),
      });

      if (legacyError) {
        console.error('[PointsService] 记录 Token 消费日志失败:', legacyError.message);
      } else {
        console.warn('[PointsService] Token 消费日志已按兼容结构写入（039 版列）');
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
    reason: string,
    referenceId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // 服务层幂等预查：referenceId 已处理则直接返回成功（防止重复调整）
      if (await this.isReferenceIdProcessed(userId, referenceId)) {
        console.log('[PointsService] adminSetPoints 幂等重放，跳过:', referenceId);
        return { success: true };
      }

      // 尝试使用数据库原子设置 RPC（reference_id 幂等）
      const { data: rpcResult, error: rpcError } = await this.supabase.rpc('set_points_atomic', {
        p_user_id: userId,
        p_new_points: points,
        p_description: `管理员操作: ${reason}`,
        p_reference_id: referenceId || `admin_set_${adminId}_${userId}_${Date.now()}`,
      });

      if (!rpcError && rpcResult?.success) {
        // RPC 内部已按 diff 自动判型并写入 point_logs + point_records + user_levels

        // 同步 user_token_balance，保持三套余额视图一致
        try {
          const newPoints = rpcResult.new_points ?? points;
          const { error: syncError } = await this.supabase
            .from('user_token_balance')
            .upsert(
              {
                user_id: userId,
                points_balance: newPoints,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            );
          if (syncError) {
            console.error('[PointsService] 同步 user_token_balance 失败:', syncError);
          }
        } catch (syncErr) {
          console.error('[PointsService] 同步 user_token_balance 异常:', syncErr);
        }

        // 管理员调整通知（失败不影响主流程）
        await createNotification({
          userId,
          type: 'points',
          title: '积分调整',
          content: `管理员已调整您的积分：${points} 分（${reason}）`,
          data: { op_type: 'admin_set', points },
        });
        return { success: true };
      }

      // RPC 失败时降级为原有方式
      if (rpcError && (rpcError.message?.includes('does not exist') || rpcError.code === '42883')) {
        console.warn('[PointsService] RPC set_points_atomic 不存在，降级为直接更新');
      }

      // 降级：获取当前用户数据
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('points, total_points, metadata')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return { success: false, reason: '用户不存在' };
      }

      const metadata = user.metadata || {};
      // 兼容历史数据：points 列与 metadata.points 并存，取两者较大值
      const oldPoints = Math.max(typeof user.points === 'number' ? user.points : 0, metadata.points || 0);
      const diff = points - oldPoints;
      const oldTotalPoints = Math.max(typeof user.total_points === 'number' ? user.total_points : 0, metadata.total_points || 0);
      const newTotalPoints = diff > 0 ? oldTotalPoints + diff : oldTotalPoints;

      // 更新用户积分（同步 points 列与 metadata）
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          points,
          total_points: newTotalPoints,
          metadata: {
            ...metadata,
            points,
            total_points: newTotalPoints,
            last_points_update: new Date().toISOString(),
          },
        })
        .eq('id', userId);

      if (updateError) {
        return { success: false, reason: '更新失败' };
      }

      // 记录积分流水（降级路径同样带 reference_id 幂等）
      const type = diff >= 0 ? 'admin_grant' : 'admin_deduct';
      await this.logPointRecord(
        userId,
        diff,
        type,
        `管理员操作: ${reason}`,
        points,
        referenceId || `admin_set_${adminId}_${userId}_${Date.now()}`
      );

      // 管理员调整通知（失败不影响主流程）
      await createNotification({
        userId,
        type: 'points',
        title: '积分调整',
        content: `管理员已${diff >= 0 ? '增加' : '扣除'} ${Math.abs(diff)} 积分（${reason}）`,
        data: { op_type: type, diff },
      });

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
      // 使用 paymentId 作为 referenceId，确保支付回调重复触发时积分不会重复发放
      const success = await this.addPoints(
        userId,
        points,
        'recharge',
        `充值 ${points} 积分 (支付ID: ${paymentId})`,
        paymentId
      );

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
