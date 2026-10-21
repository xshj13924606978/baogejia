/**
 * 通知服务
 * 负责向 notifications 表写入真实通知数据（禁止任何硬编码/模拟数据）
 * 创建时间: 2026-08-16
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * #20260831-1600 P0-2 / P1-11：新增 expire（到期提醒）与 brand（品牌审核）两类通知
 * - expire：会员订阅到期、品牌置顶权益到期前的提前提醒（按天幂等）
 * - brand ：品牌入驻审核结果（通过/拒绝/暂停）通知
 */
export type NotificationType =
  | 'system'
  | 'points'
  | 'audit'
  | 'invite'
  | 'exchange'
  | 'expire'
  | 'brand'
  | 'withdraw';

// 积分操作类型 → 中文标题（与 points-service.ts 的 PointOperationType 保持一致）
const POINTS_NOTIFICATION_TITLES: Record<string, string> = {
  register: '注册奖励',
  daily_login: '每日登录奖励',
  chat: '对话消费',
  upload_file: '上传文件',
  parse_document: '文档解析',
  generate_proposal: '生成方案',
  enhance_proposal: '方案增强',
  export_quote: '导出报价单',
  recharge: '充值到账',
  admin_grant: '积分调整',
  admin_deduct: '积分调整',
  exchange: '兑换成功',
  refund: '积分退款',
  invite_reward: '邀请奖励',
  invite_friend: '邀请奖励',
  task_reward: '任务奖励',
  withdraw_freeze: '提现冻结',
  withdraw_refund: '提现退回',
  membership_purchase: '会员购买',
  membership_refund: '会员退差',
};

/**
 * 创建通知并写入 notifications 表
 * 使用 service client 绕过 RLS；任何失败均静默处理，绝不影响主业务流程
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getSupabaseServiceClient();
    const { error } = await db.from('notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      content: params.content,
      data: params.data || {},
      is_read: false,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[NotificationService] 写入通知失败:', error);
    }
  } catch (error) {
    console.error('[NotificationService] 写入通知异常:', error);
  }
}

/**
 * 创建积分变动通知
 * - referenceId 幂等：同一业务事件只会生成一条通知（与积分流水共用 reference_id）
 * - points 为负表示扣分
 */
export async function createPointsNotification(params: {
  userId: string;
  points: number;
  type: string;
  description?: string;
  referenceId?: string;
}): Promise<void> {
  try {
    const { userId, points, type, description, referenceId } = params;

    if (referenceId) {
      // 幂等检查：该业务 reference 已存在通知则跳过
      const db = getSupabaseServiceClient();
      const { data: existing } = await db
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('data->>reference_id', referenceId)
        .maybeSingle();
      if (existing) return;
    }

    const title = POINTS_NOTIFICATION_TITLES[type] || (points >= 0 ? '积分变动' : '积分消费');
    const content = `${description || title}，${points >= 0 ? '+' : ''}${points} 积分`;

    await createNotification({
      userId,
      type: 'points',
      title,
      content,
      data: {
        points,
        op_type: type,
        ...(referenceId ? { reference_id: referenceId } : {}),
      },
    });
  } catch (error) {
    console.error('[NotificationService] 创建积分通知异常:', error);
  }
}

/**
 * 创建到期提醒通知（幂等）
 *
 * #20260831-1600 P0-2：定时任务每日执行，必须避免同一天重复提醒。
 * 幂等键写入 notifications.data.reference_id，格式由调用方传入
 * （如 `membership_expire_{subscriptionId}_d7`），同键只写入一次。
 *
 * @returns true=本次已写入新通知；false=已提醒过（跳过）
 */
export async function createExpireNotification(params: {
  userId: string;
  referenceId: string;
  title: string;
  content: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const { userId, referenceId, title, content, data } = params;
    const db = getSupabaseServiceClient();

    const { data: existing } = await db
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('data->>reference_id', referenceId)
      .maybeSingle();
    if (existing) return false;

    await createNotification({
      userId,
      type: 'expire',
      title,
      content,
      data: { ...(data || {}), reference_id: referenceId },
    });
    return true;
  } catch (error) {
    console.error('[NotificationService] 创建到期通知异常:', error);
    return false;
  }
}
