/**
 * 积分充值服务
 *
 * 职责：
 * - rechargePoints：支付回调确认后为用户增加积分（走 add_points_atomic 5 参数版，
 *   reference_id 幂等，防止重复回调重复发积分）
 * - 充值套餐解析：优先 RECHARGE_PLANS 环境变量（格式：积分:价格_积分:价格），
 *   未配置时回退到 site_config 兑换比例动态生成（与 /api/recharge/plans 同源，不硬编码）
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export interface RechargePlan {
  id: string;
  name: string;
  desc: string;
  points: number;
  price: number; // 元
}

export interface RechargePointsParams {
  userId: string;
  points: number;
  orderNo: string;
  /** 幂等参考号，如 recharge_{orderNo} */
  referenceId: string;
}

// 与 /api/recharge/plans 的默认兑换比例保持一致（trade_config 无配置时兜底）
const DEFAULT_YUAN_TO_POINTS = 100;
const FALLBACK_AMOUNT_TIERS = [10, 50, 100, 200, 500];
const CONFIG_RECORD_ID = '00000000-0000-4000-8000-000000000001';

/**
 * 默认兑换比例（仅在 trade_config / knowledge_entries 均无配置时兜底）
 * #202608302400 阶段4 P1-1
 */
export const DEFAULT_EXCHANGE_RATES = {
  yuanToTokens: 1000, // 1元 = ? Tokens
  yuanToPoints: 100, // 1元 = ? 积分
  pointsToTokens: 10, // 1积分 = ? Tokens
};

export interface ExchangeRates {
  yuanToTokens: number;
  yuanToPoints: number;
  pointsToTokens: number;
}

/**
 * 读取兑换比例（统一数据源 trade_config，兼容回退 knowledge_entries）
 *
 * #202608302400 阶段4 P1-1：供服务端与 /api/recharge/plans 共用，
 *   消除两处重复的换算逻辑与硬编码默认值分散问题。
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const rates: ExchangeRates = { ...DEFAULT_EXCHANGE_RATES };

  try {
    const db = getSupabaseServiceClient();

    // 1) 兼容回退：knowledge_entries（billing_config，迁移过渡期）
    const { data, error } = await db
      .from('knowledge_entries')
      .select('description')
      .eq('id', CONFIG_RECORD_ID)
      .maybeSingle();

    if (!error && data?.description) {
      try {
        const saved = JSON.parse(data.description);
        if (typeof saved.yuanToTokens === 'number') rates.yuanToTokens = saved.yuanToTokens;
        if (typeof saved.yuanToPoints === 'number') rates.yuanToPoints = saved.yuanToPoints;
        if (typeof saved.pointsToTokens === 'number') rates.pointsToTokens = saved.pointsToTokens;
      } catch (e) {
        console.error('[RechargePoints] 解析计费配置失败:', e);
      }
    }

    // 2) 统一数据源 trade_config 优先覆盖
    const { data: tcRecharge } = await db
      .from('trade_config')
      .select('config_value')
      .eq('config_key', 'points.recharge_rate')
      .maybeSingle();
    const { data: tcToken } = await db
      .from('trade_config')
      .select('config_value')
      .eq('config_key', 'points.token_rate')
      .maybeSingle();

    const tcY2P = Number(tcRecharge?.config_value?.rate);
    const tcP2T = Number(tcToken?.config_value?.rate);
    if (Number.isFinite(tcY2P) && tcY2P > 0) rates.yuanToPoints = tcY2P;
    if (Number.isFinite(tcP2T) && tcP2T > 0) rates.pointsToTokens = tcP2T;

    rates.yuanToTokens = rates.yuanToPoints * rates.pointsToTokens;
  } catch (e) {
    console.error('[RechargePoints] 读取兑换比例失败，使用默认值:', e);
  }

  return rates;
}

/**
 * 解析 RECHARGE_PLANS 环境变量：格式 "积分:价格_积分:价格"，如 "1000:10_5000:50"。
 * 非法项自动跳过；全部非法或未配置时返回空数组。
 */
function parseRechargePlansEnv(): RechargePlan[] | null {
  const raw = process.env.RECHARGE_PLANS;
  if (!raw || !raw.trim()) return null;

  const plans: RechargePlan[] = [];
  for (const item of raw.split('_')) {
    const [pointsStr, priceStr] = item.split(':').map((s) => s.trim());
    const points = Number(pointsStr);
    const price = Number(priceStr);
    if (!Number.isInteger(points) || points <= 0 || !Number.isFinite(price) || price <= 0) {
      continue;
    }
    plans.push({
      id: `recharge_${price}`,
      name: `充值 ${points} 积分`,
      desc: `¥${price} 兑换 ${points} 积分`,
      points,
      price,
    });
  }
  return plans.length > 0 ? plans : null;
}

/**
 * 从统一数据源 trade_config（points.recharge_rate）读取兑换比例并动态生成套餐，
 * 兼容回退 knowledge_entries（billing_config，迁移过渡期）。
 * 与 /api/recharge/plans 逻辑同源。
 */
async function getFallbackPlans(): Promise<RechargePlan[]> {
  let yuanToPoints = DEFAULT_YUAN_TO_POINTS;
  let tiers: number[] = [...FALLBACK_AMOUNT_TIERS];

  try {
    // 兑换比例：统一走 getExchangeRates（trade_config 优先，knowledge_entries 回退）
    const rates = await getExchangeRates();
    if (rates.yuanToPoints > 0) {
      yuanToPoints = rates.yuanToPoints;
    }

    // #202608302400 阶段4 P1-1：充值金额档位也改为可配置（trade_config.points.recharge_tiers）
    //   未配置时回退默认档位，保证前端不空白
    const db = getSupabaseServiceClient();
    const { data: tcTiers } = await db
      .from('trade_config')
      .select('config_value')
      .eq('config_key', 'points.recharge_tiers')
      .maybeSingle();
    const arr = tcTiers?.config_value?.tiers;
    if (Array.isArray(arr) && arr.length > 0) {
      const parsed = arr.map(Number).filter((n) => Number.isFinite(n) && n > 0);
      if (parsed.length > 0) tiers = parsed;
    }
  } catch (e) {
    console.error('[RechargePoints] 读取兑换比例失败，使用默认值:', e);
  }

  return tiers.map((amount) => {
    const points = Math.round(amount * yuanToPoints);
    return {
      id: `recharge_${amount}`,
      name: `充值 ${points} 积分`,
      desc: `¥${amount} 兑换 ${points} 积分`,
      points,
      price: amount,
    };
  });
}

/**
 * 获取充值套餐列表（环境变量 RECHARGE_PLANS 优先，其次 site_config 动态生成）
 */
export async function getRechargePlans(): Promise<RechargePlan[]> {
  const fromEnv = parseRechargePlansEnv();
  if (fromEnv) return fromEnv;
  try {
    return await getFallbackPlans();
  } catch (e) {
    console.error('[RechargePoints] 获取兜底套餐失败:', e);
    return [];
  }
}

/**
 * 按套餐 ID 查询充值套餐
 */
export async function getRechargePlanById(planId: string): Promise<RechargePlan | null> {
  const plans = await getRechargePlans();
  return plans.find((p) => p.id === planId) || null;
}

/**
 * 充值积分到账（支付回调确认后调用）
 *
 * 使用 add_points_atomic 5 参数版（内部自动写入 point_logs + point_records +
 * 同步 user_levels），并携带 reference_id 幂等：重复回调/重复通知不会重复加积分。
 *
 * @returns { success: boolean; newBalance?: number }
 */
export async function rechargePoints(params: RechargePointsParams): Promise<{
  success: boolean;
  newBalance?: number;
  reason?: string;
}> {
  const { userId, points, orderNo, referenceId } = params;
  if (!userId || !points || points <= 0) {
    return { success: false, reason: '参数无效' };
  }

  // 兜底校验：add_points_atomic 的 p_user_id 参数为 uuid 类型，
  // 非 UUID（本地 token 用户 user-<ts>-<rand>）无法入账，明确报错避免"已扣款未到账"
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    console.error(`[RechargePoints] 用户 ID 非 UUID，无法入账: user=${userId}, order=${orderNo}`);
    return { success: false, reason: '用户 ID 无效（非正式注册账号）' };
  }

  const db = getSupabaseServiceClient();
  const { data, error } = await db.rpc('add_points_atomic', {
    p_user_id: userId,
    p_points: points,
    p_type: 'recharge',
    p_description: `积分充值：订单 ${orderNo}`,
    p_reference_id: referenceId,
  });

  if (error) {
    console.error(`[RechargePoints] 积分充值失败: order=${orderNo}, user=${userId}:`, error.message);
    return { success: false, reason: `积分充值失败：${error.message}` };
  }

  const newBalance = data?.new_points;
  return { success: true, newBalance };
}
