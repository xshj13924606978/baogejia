/**
 * 会员套餐 + 用户会员订阅 服务层
 *
 * 职责：
 * - 套餐 CRUD（管理端）
 * - 套餐列表/详情（用户端，仅 active）
 * - 购买下单（cash 微信 / **points 积分支付**）
 * - 支付回调激活（创建订阅 / 续费延长 end_date / 更新用户等级）
 * - 会员到期自动降级（读取时惰性判定 + 定时批量过期）
 * - **续费 / 升级 / 降级**（差价按剩余天数折算）
 *
 * 关联：
 * - membership_plans（套餐）
 * - user_memberships（订阅）
 * - membership_level_changes（续费/升降级差价流水，迁移 123）
 * - user_levels / level_definitions（用户等级）
 * - src/lib/wechat-payment.ts（统一下单）
 * - src/lib/points-service.ts（积分支付 / 退差额）
 *
 * 对话窗: [#202608292500-阶段二-会员与Token套餐]
 *         [#20260831-1600 P1-4 积分支付 / P1-5 续费升降级 / P1-6 CAS 幂等]
 */

import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { isUuidUserId } from '@/lib/withdraw-service';
import { generateOrderNo, unifiedOrder, getWechatPaymentConfig } from '@/lib/wechat-payment';
import { syncOrderFromBusiness } from '@/lib/order-service';
import { attachUserPhone } from '@/lib/user-phone-utils';
import { pointsService } from '@/lib/points-service';
import { getTradeConfigValue } from '@/lib/trade-config-service';
import { createNotification } from '@/lib/notification-service';

/** 会员套餐 level_code → 现有会员等级映射（L0-L4 + level_definitions 1-5） */
export const MEMBERSHIP_LEVEL_MAP: Record<
  string,
  { levelNum: number; levelCode: string; levelName: string }
> = {
  vip: { levelNum: 2, levelCode: 'L1', levelName: '会员' },
  premium: { levelNum: 4, levelCode: 'L3', levelName: '黄金' },
  enterprise: { levelNum: 5, levelCode: 'L4', levelName: '白金' },
};

export interface MembershipPlanInput {
  code: string;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  duration_days: number;
  level_code: string;
  benefits?: Record<string, any>;
  sort_order?: number;
  is_active?: boolean;
  is_popular?: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 校验 level_code 合法（仅允许映射表内值） */
export function isValidMembershipLevel(levelCode: string): boolean {
  return !!MEMBERSHIP_LEVEL_MAP[levelCode];
}

/** 会员等级排序权重（用于升级/降级方向判定：数值越大等级越高） */
export const LEVEL_WEIGHT: Record<string, number> = {
  vip: 1,
  premium: 2,
  enterprise: 3,
};

export type MembershipPayMethod = 'cash' | 'points';

export interface MembershipPayConfig {
  /** 积分支付通道是否开放（trade_config membership.points_enabled） */
  pointsEnabled: boolean;
  /** 积分汇率：多少积分 = 1 元（trade_config points.membership_rate） */
  pointsRate: number;
}

/**
 * 读取会员支付配置（#20260831-1600 P1-4）
 * 全部取自 trade_config，管理员在「交易配置」中心修改后实时生效，无硬编码。
 */
export async function getMembershipPayConfig(): Promise<MembershipPayConfig> {
  const [pointsEnabled, rate] = await Promise.all([
    getTradeConfigValue<{ enabled?: boolean }>('membership.points_enabled'),
    getTradeConfigValue<{ rate?: number }>('points.membership_rate'),
  ]);
  const rateNum = Number(rate?.rate);
  return {
    pointsEnabled: pointsEnabled?.enabled !== false, // 未配置默认开放
    pointsRate: Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 100,
  };
}

/** 现金价 → 所需积分（按 trade_config 汇率，向上取整） */
export function cashToPoints(cashYuan: number, rate: number): number {
  return Math.ceil(Number(cashYuan || 0) * (rate > 0 ? rate : 100));
}

/** 套餐列表 */
export async function getMembershipPlans(options: { includeInactive?: boolean } = {}) {
  const db = getSupabaseServiceClient();
  let query = db.from('membership_plans').select('*');
  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) {
    console.error('[Membership] 查询套餐失败:', error.message);
    return [];
  }
  return data || [];
}

/** 套餐详情 */
export async function getMembershipPlanById(id: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from('membership_plans').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[Membership] 查询套餐详情失败:', error.message);
    return null;
  }
  return data;
}

/** 创建套餐（管理端） */
export async function createMembershipPlan(input: MembershipPlanInput) {
  if (!isValidMembershipLevel(input.level_code)) {
    return { success: false, reason: `无效的会员等级: ${input.level_code}` };
  }
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('membership_plans')
    .insert({
      code: input.code,
      name: input.name,
      description: input.description || null,
      price: input.price,
      original_price: input.original_price ?? null,
      duration_days: input.duration_days,
      level_code: input.level_code,
      benefits: input.benefits || null,
      sort_order: input.sort_order || 0,
      is_active: input.is_active ?? true,
      is_popular: input.is_popular ?? false,
    })
    .select()
    .single();
  if (error) {
    console.error('[Membership] 创建套餐失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, plan: data };
}

/** 更新套餐（管理端） */
export async function updateMembershipPlan(id: string, input: Partial<MembershipPlanInput>) {
  const db = getSupabaseServiceClient();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.code !== undefined) patch.code = input.code;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.price !== undefined) patch.price = input.price;
  if (input.original_price !== undefined) patch.original_price = input.original_price;
  if (input.duration_days !== undefined) patch.duration_days = input.duration_days;
  if (input.level_code !== undefined) {
    if (!isValidMembershipLevel(input.level_code)) {
      return { success: false, reason: `无效的会员等级: ${input.level_code}` };
    }
    patch.level_code = input.level_code;
  }
  if (input.benefits !== undefined) patch.benefits = input.benefits;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_popular !== undefined) patch.is_popular = input.is_popular;

  const { data, error } = await db.from('membership_plans').update(patch).eq('id', id).select().single();
  if (error) {
    console.error('[Membership] 更新套餐失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, plan: data };
}

/** 删除套餐（管理端）：存在订阅记录时软下架，否则物理删除 */
export async function deleteMembershipPlan(id: string) {
  const db = getSupabaseServiceClient();
  const { count, error: countError } = await db
    .from('user_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', id);
  if (countError) {
    return { success: false, reason: countError.message };
  }
  if ((count || 0) > 0) {
    const { data, error } = await db
      .from('membership_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return { success: false, reason: error.message };
    return { success: true, plan: data, softDeleted: true };
  }
  const { error } = await db.from('membership_plans').delete().eq('id', id);
  if (error) {
    return { success: false, reason: error.message };
  }
  return { success: true };
}

/**
 * 获取用户当前有效会员（惰性判定过期 → 自动降级）
 * - active 且 end_date > now → 返回订阅
 * - active 但已过期 → 标记 expired 并降级用户等级（仅当等级等于会员等级时）
 */
export async function getCurrentMembership(userId: string) {
  const db = getSupabaseServiceClient();
  const { data: record, error } = await db
    .from('user_memberships')
    .select('*, plan:membership_plans(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('[Membership] 查询当前会员失败:', error.message);
    return null;
  }
  if (!record) return null;

  const now = Date.now();
  const endTs = new Date(record.end_date).getTime();
  if (endTs > now) {
    return { ...record, days_left: Math.max(0, Math.floor((endTs - now) / (24 * 60 * 60 * 1000))) };
  }

  // 已过期：标记 expired + 降级（懒执行）
  console.log(`[Membership] 会员已过期，自动降级: user=${userId}, end=${record.end_date}`);
  await db
    .from('user_memberships')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', record.id);

  const map = MEMBERSHIP_LEVEL_MAP[record.level_code];
  if (map) {
    const { data: ul } = await db
      .from('user_levels')
      .select('level')
      .eq('user_id', userId)
      .maybeSingle();
    // 仅当当前等级是会员带来的等级时才降回 1（避免覆盖积分升级的更高等级）
    if (ul && Number(ul.level) === map.levelNum) {
      await db.from('user_levels').update({ level: 1, updated_at: new Date().toISOString() }).eq('user_id', userId);
    }
  }

  return null;
}

/**
 * 购买会员（下单）
 *
 * #20260831-1600 P1-4：新增积分支付通道
 * - cash  ：原流程，创建 pending 订单 → 微信统一下单 → 回调激活
 * - points：校验配置 → 按 trade_config 汇率折算积分 → 原子扣减 → 立即激活订阅
 *
 * @param payMethod 支付方式，默认 cash；积分支付需 membership.points_enabled 为 true
 */
export async function purchaseMembership(
  userId: string,
  planId: string,
  options: { payMethod?: MembershipPayMethod } = {}
) {
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持购买，请先注册并登录' };
  }
  const plan = await getMembershipPlanById(planId);
  if (!plan) {
    return { success: false, reason: '会员套餐不存在' };
  }
  if (!plan.is_active) {
    return { success: false, reason: '该套餐已下架' };
  }

  const payMethod: MembershipPayMethod = options.payMethod === 'points' ? 'points' : 'cash';
  const payConfig = await getMembershipPayConfig();

  const db = getSupabaseServiceClient();
  const orderNo = `MB${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + Number(plan.duration_days) * 24 * 60 * 60 * 1000);

  const { data, error } = await db
    .from('user_memberships')
    .insert({
      user_id: userId,
      plan_id: planId,
      order_no: orderNo,
      level_code: plan.level_code,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[Membership] 创建会员订单失败:', error?.message);
    return { success: false, reason: error?.message || '下单失败' };
  }

  // ---------- 积分支付：扣减积分后立即激活（无需等待回调） ----------
  if (payMethod === 'points') {
    if (!payConfig.pointsEnabled) {
      await db
        .from('user_memberships')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', data.id);
      return { success: false, reason: '积分支付通道已关闭，请使用微信支付' };
    }

    const requiredPoints = cashToPoints(Number(plan.price), payConfig.pointsRate);
    if (requiredPoints <= 0) {
      await db
        .from('user_memberships')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', data.id);
      return { success: false, reason: '套餐价格异常，无法使用积分支付' };
    }

    // 同步到统一订单表（积分支付同样留痕，payment_method 由 sync 按业务写入）
    await syncOrderFromBusiness(orderNo);

    const deduct = await pointsService.deductPoints(
      userId,
      requiredPoints,
      'membership_purchase',
      `积分购买会员：${plan.name}`,
      `membership_${orderNo}`
    );
    if (!deduct.success) {
      await db
        .from('user_memberships')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', data.id);
      return { success: false, reason: deduct.reason || '积分不足' };
    }

    const activated = await activateMembership(userId, orderNo, `POINTS_${orderNo}`);
    if (!activated.success) {
      // 激活失败 → 退还积分，避免「扣了积分没开会员」
      await pointsService.refundPoints(
        userId,
        requiredPoints,
        `membership_refund_${orderNo}`,
        '会员激活失败，积分退回'
      );
      return { success: false, reason: activated.reason || '会员激活失败，积分已退回' };
    }

    // 记录差价流水（新购视为从无到有的升级）
    await recordLevelChange({
      userId,
      changeType: 'upgrade',
      fromLevelCode: null,
      toLevelCode: plan.level_code,
      fromPlanId: null,
      toPlanId: plan.id,
      remainingDays: 0,
      priceDiff: Number(plan.price),
      pointsUsed: requiredPoints,
      payMethod: 'points',
      orderNo,
      remark: `积分购买 ${plan.name}`,
    });

    await createNotification({
      userId,
      type: 'points',
      title: '会员开通成功',
      content: `已使用 ${requiredPoints} 积分开通「${plan.name}」，有效期至 ${endDate.toLocaleDateString('zh-CN')}`,
      data: { reference_id: `membership_${orderNo}`, order_no: orderNo },
    });

    return {
      success: true,
      order: activated.order,
      orderNo,
      payMethod: 'points' as const,
      pointsUsed: requiredPoints,
    };
  }

  // ---------- 现金支付：微信统一下单 ----------
  // 同步到统一订单表（pending）
  await syncOrderFromBusiness(orderNo);

  // 调用微信 Native 统一下单（amount 单位：分）
  try {
    const wxConfig = await getWechatPaymentConfig();
    const payResult = await unifiedOrder({
      description: `会员套餐：${plan.name}`,
      outTradeNo: orderNo,
      amount: Math.round(Number(plan.price) * 100),
      notifyUrl: wxConfig?.notifyUrl || '',
    });
    return { success: true, order: data, orderNo, payMethod: 'cash' as const, codeUrl: payResult.code_url };
  } catch (payError: any) {
    await db
      .from('user_memberships')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', data.id);
    // #20260831-1600：同步清理统一订单表的 pending 残留（旧实现只取消 user_memberships）
    await cancelUnifiedOrder(orderNo).catch(() => {});
    console.error('[Membership] 微信统一下单失败:', payError?.message || payError);
    return { success: false, reason: payError?.message || '支付下单失败，请稍后重试' };
  }
}

/** 取消统一订单（微信下单失败时清理 pending 残留） */
async function cancelUnifiedOrder(orderNo: string): Promise<void> {
  const db = getSupabaseServiceClient();
  await db
    .from('unified_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('order_no', orderNo)
    .eq('status', 'pending');
}

/** 写入会员续费/升降级差价流水（migrations 123 membership_level_changes） */
async function recordLevelChange(input: {
  userId: string;
  changeType: 'renew' | 'upgrade' | 'downgrade';
  fromLevelCode: string | null;
  toLevelCode: string;
  fromPlanId: string | null;
  toPlanId: string | null;
  remainingDays: number;
  priceDiff: number;
  pointsUsed: number;
  payMethod: MembershipPayMethod;
  orderNo?: string;
  remark?: string;
}): Promise<void> {
  try {
    const db = getSupabaseServiceClient();
    const { error } = await db.from('membership_level_changes').insert({
      user_id: input.userId,
      change_type: input.changeType,
      from_level_code: input.fromLevelCode,
      to_level_code: input.toLevelCode,
      from_plan_id: input.fromPlanId,
      to_plan_id: input.toPlanId,
      remaining_days: input.remainingDays,
      price_diff: input.priceDiff,
      points_used: input.pointsUsed,
      pay_method: input.payMethod,
      order_no: input.orderNo || null,
      remark: input.remark || null,
    });
    if (error) {
      console.error('[Membership] 写入等级变更流水失败:', error.message);
    }
  } catch (e) {
    console.error('[Membership] 写入等级变更流水异常:', e);
  }
}

/**
 * 支付回调激活会员（幂等）
 * 流程：校验订单 pending → 金额校验（调用方完成）→
 *   - 已有 active 订阅 → 续费延长 end_date（按套餐时长）
 *   - 无 active 订阅 → 将本 pending 记录置为 active（沿用下单时的起止时间）
 *   → 更新用户等级
 */
export async function activateMembership(userId: string, orderNo: string, transactionId?: string) {
  const db = getSupabaseServiceClient();

  // 1. 查订单
  const { data: order, error: orderError } = await db
    .from('user_memberships')
    .select('*')
    .eq('order_no', orderNo)
    .eq('user_id', userId)
    .maybeSingle();
  if (orderError) {
    console.error('[Membership] 查询会员订单失败:', orderError.message);
    return { success: false, reason: orderError.message };
  }
  if (!order) {
    return { success: false, reason: '会员订单不存在' };
  }
  // 幂等：已激活直接成功
  if (order.status === 'active') {
    return { success: true, extended: false, order };
  }
  if (order.status === 'cancelled') {
    return { success: false, reason: '订单已取消' };
  }

  // 2. 查询套餐（取时长；套餐可能被删，用订单里的快照字段兜底）
  let durationDays = 30;
  if (UUID_REGEX.test(order.plan_id)) {
    const { data: plan } = await db
      .from('membership_plans')
      .select('duration_days, level_code')
      .eq('id', order.plan_id)
      .maybeSingle();
    if (plan) {
      durationDays = Number(plan.duration_days) || 30;
      // 以当前套餐等级为准（防止下单后套餐等级被改）
      if (plan.level_code && MEMBERSHIP_LEVEL_MAP[plan.level_code]) {
        await db
          .from('user_memberships')
          .update({ level_code: plan.level_code })
          .eq('id', order.id);
        order.level_code = plan.level_code;
      }
    }
  }

  const now = new Date();
  let activatedOrder = order;

  // 3. 续费 or 激活
  const { data: activeRecord } = await db
    .from('user_memberships')
    .select('id, end_date, level_code')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (activeRecord) {
    // 续费：从原有效期末尾开始叠加（未过期则延长；已过期则从今天起算）
    //
    // #20260831-1600 P1-6：乐观锁（CAS）防并发重复延长。
    // 支付回调重试 + 前端轮询并发时，旧实现两次 update 都会成功，导致 end_date
    // 被延长两次。这里以读取到的 end_date 作为更新条件：若期间已被其他请求改动，
    // update 影响行数为 0，则重新读取基线并重试（最多 3 次）。
    const CAS_MAX_RETRY = 3;
    let updatedData: any = null;
    let updateError: any = null;

    for (let attempt = 0; attempt < CAS_MAX_RETRY; attempt++) {
      const baseRecord =
        attempt === 0 ? activeRecord : await readActiveMembership(userId);
      if (!baseRecord) {
        // 并发下记录被置为 expired/cancelled，走新开通分支
        updatedData = null;
        break;
      }
      const base =
        new Date(baseRecord.end_date).getTime() > now.getTime()
          ? new Date(baseRecord.end_date)
          : now;
      const newEnd = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const { data, error } = await db
        .from('user_memberships')
        .update({
          end_date: newEnd.toISOString(),
          level_code: baseRecord.level_code,
          updated_at: new Date().toISOString(),
        })
        .eq('id', baseRecord.id)
        .eq('end_date', baseRecord.end_date) // CAS：仅在 end_date 未被改动时写入
        .select()
        .maybeSingle();

      if (!error && data) {
        updatedData = data;
        updateError = null;
        break;
      }
      if (error) {
        updateError = error;
        break;
      }
      // data 为空 → end_date 已被并发改动，短暂退避后重试
      updateError = null;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }

    if (updateError) {
      return { success: false, reason: updateError.message };
    }

    if (updatedData) {
      const data = updatedData;
      // 将当前 pending 订单置为 cancelled（避免留下悬空 pending）
      await db
        .from('user_memberships')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      activatedOrder = { ...data, extended: true };

      // 4. 更新用户等级（会员等级映射）
      const renewMap = MEMBERSHIP_LEVEL_MAP[activatedOrder.level_code] || MEMBERSHIP_LEVEL_MAP.vip;
      await updateUserLevelForMembership(userId, renewMap.levelNum);

      await createNotification({
        userId,
        type: 'points',
        title: '会员续费成功',
        content: `会员有效期已延长 ${durationDays} 天，最新到期时间 ${new Date(
          data.end_date
        ).toLocaleDateString('zh-CN')}`,
        data: { reference_id: `membership_renew_${orderNo}`, order_no: orderNo },
      });

      return { success: true, extended: true, order: activatedOrder, transactionId };
    }
    // CAS 重试仍失败 → 记录已被并发改动，视为幂等重放直接成功，避免重复延长
    console.warn(`[Membership] 续费 CAS 冲突，按幂等处理: order=${orderNo}`);
    await db
      .from('user_memberships')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', order.id);
    return { success: true, extended: false, order: activatedOrder, transactionId };
  } else {
    // 新开通：激活本订单
    const { data, error } = await db
      .from('user_memberships')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .select()
      .single();
    if (error) {
      return { success: false, reason: error.message };
    }
    activatedOrder = data;
  }

  // 4. 更新用户等级（会员等级映射）
  const map = MEMBERSHIP_LEVEL_MAP[activatedOrder.level_code] || MEMBERSHIP_LEVEL_MAP.vip;
  await updateUserLevelForMembership(userId, map.levelNum);

  return { success: true, extended: !!activeRecord, order: activatedOrder, transactionId };
}

/** 读取当前 active 订阅（CAS 重试时重新取基线） */
async function readActiveMembership(
  userId: string
): Promise<{ id: string; end_date: string; level_code: string } | null> {
  const db = getSupabaseServiceClient();
  const { data } = await db
    .from('user_memberships')
    .select('id, end_date, level_code')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return data || null;
}

// ============================================================
// #20260831-1600 P1-5：续费 / 升级 / 降级
//
// 差价计算规则（全部基于真实套餐价格与剩余天数，无硬编码）：
//   remainingDays   = max(0, ceil((end_date - now) / 1天))
//   oldDailyPrice   = oldPlan.price / oldPlan.duration_days
//   remainingValue  = oldDailyPrice * remainingDays        // 旧套餐剩余价值
//   priceDiff       = newPlan.price - remainingValue
//     升级（priceDiff > 0）→ 需补差价
//     降级（priceDiff < 0）→ 退差额 = -priceDiff（以积分退回）
//   新 end_date = now + newPlan.duration_days
// 所有变更写入 membership_level_changes 流水表，可查询可审计。
// ============================================================

export interface MembershipChangePreview {
  changeType: 'renew' | 'upgrade' | 'downgrade';
  currentPlanId: string | null;
  currentLevelCode: string | null;
  targetPlanId: string;
  targetLevelCode: string;
  remainingDays: number;
  remainingValue: number;
  targetPrice: number;
  /** >0 需补差价（元）；<0 应退差额（元） */
  priceDiff: number;
  /** 补差价所需积分（升级，points 支付时） */
  pointsRequired: number;
  /** 退差额折合积分（降级） */
  pointsRefund: number;
  newEndDate: string;
}

/** 计算续费/升降级差价预览（不写库，供前端展示与后端复用） */
export async function previewMembershipChange(
  userId: string,
  targetPlanId: string
): Promise<{ success: true; preview: MembershipChangePreview } | { success: false; reason: string }> {
  const db = getSupabaseServiceClient();

  const current = await readActiveMembership(userId);
  const targetPlan = await getMembershipPlanById(targetPlanId);
  if (!targetPlan) return { success: false, reason: '目标套餐不存在' };
  if (!targetPlan.is_active) return { success: false, reason: '目标套餐已下架' };

  const payConfig = await getMembershipPayConfig();
  const now = Date.now();

  // 无当前订阅 → 视为新购（按升级处理，差价 = 全价）
  if (!current) {
    const newEnd = new Date(now + Number(targetPlan.duration_days) * 86400000);
    return {
      success: true,
      preview: {
        changeType: 'upgrade',
        currentPlanId: null,
        currentLevelCode: null,
        targetPlanId,
        targetLevelCode: targetPlan.level_code,
        remainingDays: 0,
        remainingValue: 0,
        targetPrice: Number(targetPlan.price),
        priceDiff: Number(targetPlan.price),
        pointsRequired: cashToPoints(Number(targetPlan.price), payConfig.pointsRate),
        pointsRefund: 0,
        newEndDate: newEnd.toISOString(),
      },
    };
  }

  const { data: currentFull } = await db
    .from('user_memberships')
    .select('id, plan_id, level_code, end_date')
    .eq('id', current.id)
    .maybeSingle();
  if (!currentFull) return { success: false, reason: '当前订阅不存在' };

  const remainingMs = new Date(currentFull.end_date).getTime() - now;
  const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));

  const oldPlan = currentFull.plan_id ? await getMembershipPlanById(currentFull.plan_id) : null;
  const oldPrice = Number(oldPlan?.price ?? 0);
  const oldDuration = Number(oldPlan?.duration_days ?? 0);
  const oldDailyPrice = oldDuration > 0 ? oldPrice / oldDuration : 0;
  const remainingValue = Number((oldDailyPrice * remainingDays).toFixed(2));

  const targetPrice = Number(targetPlan.price);
  const priceDiff = Number((targetPrice - remainingValue).toFixed(2));

  const curWeight = LEVEL_WEIGHT[currentFull.level_code] ?? 0;
  const tgtWeight = LEVEL_WEIGHT[targetPlan.level_code] ?? 0;
  const changeType: 'renew' | 'upgrade' | 'downgrade' =
    currentFull.plan_id === targetPlanId
      ? 'renew'
      : tgtWeight > curWeight
        ? 'upgrade'
        : 'downgrade';

  const newEnd = new Date(now + Number(targetPlan.duration_days) * 86400000);

  return {
    success: true,
    preview: {
      changeType,
      currentPlanId: currentFull.plan_id,
      currentLevelCode: currentFull.level_code,
      targetPlanId,
      targetLevelCode: targetPlan.level_code,
      remainingDays,
      remainingValue,
      targetPrice,
      priceDiff,
      pointsRequired: priceDiff > 0 ? cashToPoints(priceDiff, payConfig.pointsRate) : 0,
      pointsRefund: priceDiff < 0 ? cashToPoints(-priceDiff, payConfig.pointsRate) : 0,
      newEndDate: newEnd.toISOString(),
    },
  };
}

/**
 * 续费：延长当前套餐有效期
 * 等价于「以当前套餐为目标套餐的变更」，差价 = 全价 - 剩余价值
 */
export async function renewMembership(
  userId: string,
  options: { payMethod?: MembershipPayMethod } = {}
) {
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持续费' };
  }
  const current = await readActiveMembership(userId);
  if (!current) {
    return { success: false, reason: '当前没有生效中的会员订阅，请先购买' };
  }
  const db = getSupabaseServiceClient();
  const { data: cur } = await db
    .from('user_memberships')
    .select('plan_id')
    .eq('id', current.id)
    .maybeSingle();
  if (!cur?.plan_id) {
    return { success: false, reason: '当前订阅缺少套餐信息，无法续费' };
  }
  return changeMembershipPlan(userId, cur.plan_id, options);
}

/**
 * 升级 / 降级套餐（自动按等级权重判定方向）
 *
 * - 升级：补差价（priceDiff > 0）。cash 走微信回调；points 直接扣积分并立即生效。
 * - 降级：退差额（priceDiff < 0）。差额以积分退回（membership_refund），立即生效。
 * - 同套餐：按续费处理（延长有效期）。
 *
 * 所有变更写入 membership_level_changes 流水。
 */
export async function changeMembershipPlan(
  userId: string,
  targetPlanId: string,
  options: { payMethod?: MembershipPayMethod } = {}
) {
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持变更套餐' };
  }

  const previewResult = await previewMembershipChange(userId, targetPlanId);
  if (!previewResult.success) return { success: false, reason: previewResult.reason };
  const preview = previewResult.preview;

  const payMethod: MembershipPayMethod = options.payMethod === 'points' ? 'points' : 'cash';
  const payConfig = await getMembershipPayConfig();
  if (payMethod === 'points' && !payConfig.pointsEnabled) {
    return { success: false, reason: '积分支付通道已关闭，请使用微信支付' };
  }

  const db = getSupabaseServiceClient();
  const orderNo = `MB${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = Date.now();

  // 取目标套餐时长，精确计算新到期时间
  const targetPlan = await getMembershipPlanById(targetPlanId);
  if (!targetPlan) return { success: false, reason: '目标套餐不存在' };
  const endDate = new Date(now + Number(targetPlan.duration_days) * 86400000);

  // ---------- 降级：退差额（立即生效，无需支付） ----------
  if (preview.changeType === 'downgrade' && preview.priceDiff < 0) {
    const current = await readActiveMembership(userId);
    if (!current) return { success: false, reason: '当前订阅不存在' };

    // CAS 更新：套餐 + 到期时间 + 等级
    const { data: updated, error: updError } = await db
      .from('user_memberships')
      .update({
        plan_id: targetPlanId,
        level_code: targetPlan.level_code,
        start_date: new Date(now).toISOString(),
        end_date: endDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .eq('end_date', current.end_date)
      .select()
      .maybeSingle();

    if (updError) return { success: false, reason: updError.message };
    if (!updated) return { success: false, reason: '订阅数据在操作期间已变更，请重试' };

    // 退差额以积分退回
    let refundedPoints = 0;
    if (preview.pointsRefund > 0) {
      const ok = await pointsService.addPoints(
        userId,
        preview.pointsRefund,
        'membership_refund',
        `会员降级退差额：${preview.priceDiff} 元`,
        `membership_refund_${orderNo}`
      );
      refundedPoints = ok ? preview.pointsRefund : 0;
      if (!ok) {
        console.error(`[Membership] 降级退差额失败: user=${userId}, order=${orderNo}`);
      }
    }

    const levelMap = MEMBERSHIP_LEVEL_MAP[targetPlan.level_code] || MEMBERSHIP_LEVEL_MAP.vip;
    await updateUserLevelForMembership(userId, levelMap.levelNum);

    await recordLevelChange({
      userId,
      changeType: 'downgrade',
      fromLevelCode: preview.currentLevelCode,
      toLevelCode: targetPlan.level_code,
      fromPlanId: preview.currentPlanId,
      toPlanId: targetPlanId,
      remainingDays: preview.remainingDays,
      priceDiff: preview.priceDiff,
      pointsUsed: -refundedPoints,
      payMethod: 'points',
      orderNo,
      remark: `降级退差额 ${Math.abs(preview.priceDiff)} 元（折 ${preview.pointsRefund} 积分）`,
    });

    await createNotification({
      userId,
      type: 'points',
      title: '会员降级成功',
      content: `已降级为「${targetPlan.name}」，退差额 ${Math.abs(preview.priceDiff)} 元（${refundedPoints} 积分已退回）`,
      data: { reference_id: `membership_downgrade_${orderNo}`, order_no: orderNo },
    });

    return { success: true, order: updated, orderNo, changeType: 'downgrade', refundedPoints };
  }

  // ---------- 升级 / 续费：需要支付 ----------
  // 补差价金额：升级 = priceDiff（>0）；续费 = 目标套餐全价
  const payableYuan =
    preview.changeType === 'upgrade' && preview.priceDiff > 0
      ? preview.priceDiff
      : preview.targetPrice;

  // points：直接扣积分并立即生效
  if (payMethod === 'points') {
    const requiredPoints = cashToPoints(payableYuan, payConfig.pointsRate);
    if (requiredPoints <= 0) return { success: false, reason: '应付金额异常' };

    const current = await readActiveMembership(userId);
    if (!current) return { success: false, reason: '当前订阅不存在' };

    await syncOrderFromBusiness(orderNo).catch(() => {});

    const deduct = await pointsService.deductPoints(
      userId,
      requiredPoints,
      'membership_purchase',
      preview.changeType === 'upgrade' ? `会员升级补差价：${targetPlan.name}` : `会员续费：${targetPlan.name}`,
      `membership_${orderNo}`
    );
    if (!deduct.success) return { success: false, reason: deduct.reason || '积分不足' };

    // CAS：从原有效期末尾叠加（续费）或按新套餐重置（升级）
    const base =
      preview.changeType === 'upgrade'
        ? new Date(now)
        : new Date(Math.max(new Date(current.end_date).getTime(), now));
    const finalEnd =
      preview.changeType === 'upgrade'
        ? endDate
        : new Date(base.getTime() + Number(targetPlan.duration_days) * 86400000);

    const { data: updated, error: updError } = await db
      .from('user_memberships')
      .update({
        plan_id: targetPlanId,
        level_code: targetPlan.level_code,
        end_date: finalEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .eq('end_date', current.end_date)
      .select()
      .maybeSingle();

    if (updError || !updated) {
      await pointsService.refundPoints(
        userId,
        requiredPoints,
        `membership_refund_${orderNo}`,
        '会员变更失败，积分退回'
      );
      return { success: false, reason: updError?.message || '订阅数据已变更，请重试（积分已退回）' };
    }

    const levelMap = MEMBERSHIP_LEVEL_MAP[targetPlan.level_code] || MEMBERSHIP_LEVEL_MAP.vip;
    await updateUserLevelForMembership(userId, levelMap.levelNum);

    await recordLevelChange({
      userId,
      changeType: preview.changeType,
      fromLevelCode: preview.currentLevelCode,
      toLevelCode: targetPlan.level_code,
      fromPlanId: preview.currentPlanId,
      toPlanId: targetPlanId,
      remainingDays: preview.remainingDays,
      priceDiff: payableYuan,
      pointsUsed: requiredPoints,
      payMethod: 'points',
      orderNo,
      remark: `${preview.changeType === 'upgrade' ? '升级补差价' : '续费'} ${payableYuan} 元`,
    });

    await createNotification({
      userId,
      type: 'points',
      title: preview.changeType === 'upgrade' ? '会员升级成功' : '会员续费成功',
      content: `已${preview.changeType === 'upgrade' ? '升级' : '续费'}为「${targetPlan.name}」，消耗 ${requiredPoints} 积分，有效期至 ${finalEnd.toLocaleDateString('zh-CN')}`,
      data: { reference_id: `membership_${orderNo}`, order_no: orderNo },
    });

    return {
      success: true,
      order: updated,
      orderNo,
      changeType: preview.changeType,
      pointsUsed: requiredPoints,
    };
  }

  // cash：创建 pending 订单 → 微信统一下单 → 回调激活（沿用购买链路）
  const { data: newOrder, error: orderErr } = await db
    .from('user_memberships')
    .insert({
      user_id: userId,
      plan_id: targetPlanId,
      order_no: orderNo,
      level_code: targetPlan.level_code,
      start_date: new Date(now).toISOString(),
      end_date: endDate.toISOString(),
      status: 'pending',
    })
    .select()
    .single();

  if (orderErr || !newOrder) {
    return { success: false, reason: orderErr?.message || '下单失败' };
  }

  await syncOrderFromBusiness(orderNo);

  try {
    const wxConfig = await getWechatPaymentConfig();
    const payResult = await unifiedOrder({
      description:
        preview.changeType === 'upgrade'
          ? `会员升级补差价：${targetPlan.name}`
          : `会员续费：${targetPlan.name}`,
      outTradeNo: orderNo,
      amount: Math.round(payableYuan * 100),
      notifyUrl: wxConfig?.notifyUrl || '',
    });

    await recordLevelChange({
      userId,
      changeType: preview.changeType,
      fromLevelCode: preview.currentLevelCode,
      toLevelCode: targetPlan.level_code,
      fromPlanId: preview.currentPlanId,
      toPlanId: targetPlanId,
      remainingDays: preview.remainingDays,
      priceDiff: payableYuan,
      pointsUsed: 0,
      payMethod: 'cash',
      orderNo,
      remark: `${preview.changeType === 'upgrade' ? '升级补差价' : '续费'} ${payableYuan} 元（现金待支付）`,
    });

    return {
      success: true,
      order: newOrder,
      orderNo,
      changeType: preview.changeType,
      codeUrl: payResult.code_url,
    };
  } catch (payError: any) {
    await db
      .from('user_memberships')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', newOrder.id);
    await cancelUnifiedOrder(orderNo).catch(() => {});
    console.error('[Membership] 变更套餐微信下单失败:', payError?.message || payError);
    return { success: false, reason: payError?.message || '支付下单失败，请稍后重试' };
  }
}

/**
 * #20260831-1600 P1-7：发放会员天数（供积分商城虚拟商品「会员卡」类商品调用）
 *
 * 规则：
 * - 存在 active 订阅 → 在其 end_date 基础上顺延 days 天（已过期则从今天起算）
 * - 不存在 → 新建一条 active 订阅（level_code 默认 vip）
 * - 使用 CAS（.eq('end_date', 读取值)）防并发重复延长
 * - 写入 membership_level_changes 流水，可查询可审计
 *
 * @param source 来源说明（写入流水 remark，如「积分商城兑换：高级会员月卡」）
 */
export async function grantMembershipDays(
  userId: string,
  days: number,
  levelCode: string = 'vip',
  source: string = '积分商城兑换'
): Promise<{ success: boolean; reason?: string; end_date?: string }> {
  if (!Number.isFinite(days) || days <= 0) {
    return { success: false, reason: '发放天数必须为正数' };
  }
  if (!isValidMembershipLevel(levelCode)) {
    return { success: false, reason: `无效的会员等级: ${levelCode}` };
  }
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，无法发放会员权益' };
  }

  const db = getSupabaseServiceClient();
  const now = new Date();
  const addMs = days * 86400000;
  const orderNo = `MB${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const CAS_MAX_RETRY = 3;
  for (let attempt = 0; attempt < CAS_MAX_RETRY; attempt++) {
    const active = await readActiveMembership(userId);

    if (active) {
      const base =
        new Date(active.end_date).getTime() > now.getTime() ? new Date(active.end_date) : now;
      const newEnd = new Date(base.getTime() + addMs);

      const { data, error } = await db
        .from('user_memberships')
        .update({ end_date: newEnd.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', active.id)
        .eq('end_date', active.end_date) // CAS
        .select('end_date')
        .maybeSingle();

      if (error) return { success: false, reason: error.message };
      if (data) {
        const levelMap = MEMBERSHIP_LEVEL_MAP[active.level_code] || MEMBERSHIP_LEVEL_MAP.vip;
        await updateUserLevelForMembership(userId, levelMap.levelNum);
        await recordLevelChange({
          userId,
          changeType: 'renew',
          fromLevelCode: active.level_code,
          toLevelCode: active.level_code,
          fromPlanId: null,
          toPlanId: null,
          remainingDays: Math.max(0, Math.ceil((base.getTime() - now.getTime()) / 86400000)),
          priceDiff: 0,
          pointsUsed: 0,
          payMethod: 'points',
          orderNo,
          remark: `${source}：发放 ${days} 天会员`,
        });
        return { success: true, end_date: data.end_date };
      }
      // CAS 冲突 → 退避重试
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      continue;
    }

    // 无 active 订阅 → 新建
    const { data: inserted, error: insError } = await db
      .from('user_memberships')
      .insert({
        user_id: userId,
        plan_id: null,
        order_no: orderNo,
        level_code: levelCode,
        start_date: now.toISOString(),
        end_date: new Date(now.getTime() + addMs).toISOString(),
        status: 'active',
      })
      .select('end_date')
      .single();

    if (insError) {
      // 并发下已由其他请求创建 → 下一轮走更新分支
      if (attempt < CAS_MAX_RETRY - 1) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      return { success: false, reason: insError.message };
    }

    const levelMap = MEMBERSHIP_LEVEL_MAP[levelCode] || MEMBERSHIP_LEVEL_MAP.vip;
    await updateUserLevelForMembership(userId, levelMap.levelNum);
    await recordLevelChange({
      userId,
      changeType: 'upgrade',
      fromLevelCode: null,
      toLevelCode: levelCode,
      fromPlanId: null,
      toPlanId: null,
      remainingDays: 0,
      priceDiff: 0,
      pointsUsed: 0,
      payMethod: 'points',
      orderNo,
      remark: `${source}：开通 ${days} 天会员`,
    });
    return { success: true, end_date: inserted.end_date };
  }

  return { success: false, reason: '会员权益发放冲突，请稍后重试' };
}

/** 更新用户等级（user_levels upsert，level_definitions 联动） */
async function updateUserLevelForMembership(userId: string, levelNum: number) {
  const db = getSupabaseServiceClient();
  const { data: levelDef } = await db
    .from('level_definitions')
    .select('level, required_points')
    .eq('level', levelNum)
    .maybeSingle();
  const { data: nextDef } = await db
    .from('level_definitions')
    .select('required_points')
    .eq('level', levelNum + 1)
    .maybeSingle();

  const { error } = await db.from('user_levels').upsert(
    {
      user_id: userId,
      level: levelNum,
      current_points: levelDef?.required_points ?? 0,
      next_level_points: nextDef?.required_points ?? levelDef?.required_points ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    console.error('[Membership] 更新用户等级失败:', error.message);
  }
}

/** 用户会员购买历史 */
export async function getMembershipHistory(userId: string, limit = 50) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('user_memberships')
    .select('*, plan:membership_plans(id, name, price, duration_days)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[Membership] 查询会员历史失败:', error.message);
    return [];
  }
  return data || [];
}

/** 管理端会员用户列表 */
export async function getMembershipUsers(params: { page?: number; pageSize?: number } = {}) {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  const { data, error, count } = await db
    .from('user_memberships')
    .select('*, user:users(id, username, email, metadata), plan:membership_plans(id, name, price, duration_days)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[Membership] 查询会员用户失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
  return { records: attachUserPhone(data || []), total: count || 0 };
}

/** 生成套餐变更单号（管理端手动开通预留） */
export function generateMembershipOrderNo(): string {
  return generateOrderNo('MB');
}
