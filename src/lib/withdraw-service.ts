/**
 * 积分提现服务
 *
 * 职责：
 * - 提现配置读取（trade_config 优先 / site_config 回退，无硬编码）
 * - 提现账户绑定/查询 + 实名认证
 * - 申请提现（**冻结**积分 → 生成记录 pending）
 * - 审核（通过 approved / 拒绝 rejected 并**解冻**积分）
 * - 确认打款（自动调支付渠道 / 手动登记；**打款成功扣除冻结积分**，失败解冻）
 *
 * #20260831-1600 修复：
 * - P0-3：收款账户强制归属校验，禁止提现到第三方账户
 * - P1-9：单笔最大额度 / 每日次数 / 实名认证 / pending 去重 四项防刷
 * - P1-10：由「申请即真扣」改为「申请冻结 → 打款扣除 → 拒绝/失败解冻」
 *
 * 关联：
 * - points_withdraw（提现记录）
 * - withdraw_accounts（用户提现账户，含实名）
 * - users.frozen_points（冻结积分余额，迁移 123）
 * - pointsService（冻结/解冻/扣减，原子 + 幂等 + 三处存储同步）
 * - src/lib/withdraw/wechat.ts（微信企业付款）
 * - src/lib/withdraw/alipay.ts（支付宝单笔转账）
 */

import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { pointsService } from '@/lib/points-service';
import { getSiteConfigValues } from '@/lib/site-config';
import { getTradeConfigValue } from '@/lib/trade-config-service';
import { transferToWechatOpenid, isWechatTransferConfigured } from '@/lib/withdraw/wechat';
import { transferToAlipayAccount, isAlipayTransferConfigured } from '@/lib/withdraw/alipay';
import { attachUserPhone } from '@/lib/user-phone-utils';

export type WithdrawAccountType = 'wechat' | 'alipay' | 'bank';

export interface WithdrawAccountInfo {
  wechat_openid?: string;
  alipay_account?: string;
  bank_name?: string;
  bank_card?: string;
  bank_holder?: string;
  /** #20260831-1600 P1-9 实名认证：真实姓名 */
  real_name?: string;
  /** #20260831-1600 P1-9 实名认证：身份证号 */
  id_card_no?: string;
}

export interface WithdrawConfig {
  enabled: boolean;
  minPoints: number;
  minAmount: number;
  rate: number; // 多少积分=1元
  feeRate: number; // 手续费比例（0~1）
  /** #20260831-1600 P1-9 防刷：单笔最大提现积分（0 或负 = 不限制） */
  maxPoints: number;
  /** #20260831-1600 P1-9 防刷：每用户每日最多申请次数（0 或负 = 不限制） */
  dailyLimit: number;
  /** #20260831-1600 P1-9 防刷：是否强制实名认证 */
  requireRealName: boolean;
}

export interface ApplyWithdrawParams {
  userId: string;
  points: number;
  accountType: WithdrawAccountType;
  accountInfo: WithdrawAccountInfo;
  remark?: string;
}

export interface WithdrawResult {
  success: boolean;
  withdraw?: any;
  reason?: string;
  refunded?: boolean;
  paidMode?: 'auto' | 'manual';
}

// 默认配置（trade_config / site_config 均未配置时兜底，与 094、123 迁移种子一致）
const DEFAULT_CONFIG: WithdrawConfig = {
  enabled: true,
  minPoints: 100,
  minAmount: 1,
  rate: 100,
  feeRate: 0,
  maxPoints: 50000,
  dailyLimit: 3,
  requireRealName: true,
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 读取提现配置（#202608302200 配置数据动态同步）
 * 提现比例 / 最低积分以统一数据源 trade_config 为准（points.withdraw_rate /
 * points.withdraw_min，与「交易配置」中心实时联动），site_config 仅作历史回退。
 */
export async function getWithdrawConfig(): Promise<WithdrawConfig> {
  const values = await getSiteConfigValues([
    'withdraw_enabled',
    'withdraw_min_points',
    'withdraw_min_amount',
    'withdraw_rate',
    'withdraw_fee_rate',
  ]);

  // #20260831-1600 P1-9：防刷三项配置同样以 trade_config 为唯一权威源（迁移 123 种子）
  const [tcRate, tcMin, tcMax, tcDaily, tcRealName] = await Promise.all([
    getTradeConfigValue<{ rate?: number }>('points.withdraw_rate'),
    getTradeConfigValue<{ min?: number }>('points.withdraw_min'),
    getTradeConfigValue<{ max?: number }>('withdraw.max_points'),
    getTradeConfigValue<{ count?: number }>('withdraw.daily_limit'),
    getTradeConfigValue<{ enabled?: boolean }>('withdraw.require_realname'),
  ]);

  const num = (v: string | null, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const tcRateNum = Number(tcRate?.rate);
  const tcMinNum = Number(tcMin?.min);
  const tcMaxNum = Number(tcMax?.max);
  const tcDailyNum = Number(tcDaily?.count);

  return {
    enabled: values.withdraw_enabled === null || values.withdraw_enabled === 'true',
    minPoints:
      Number.isFinite(tcMinNum) && tcMinNum >= 0
        ? tcMinNum
        : num(values.withdraw_min_points, DEFAULT_CONFIG.minPoints),
    minAmount: num(values.withdraw_min_amount, DEFAULT_CONFIG.minAmount),
    rate:
      Number.isFinite(tcRateNum) && tcRateNum > 0
        ? tcRateNum
        : num(values.withdraw_rate, DEFAULT_CONFIG.rate) || DEFAULT_CONFIG.rate,
    feeRate: num(values.withdraw_fee_rate, DEFAULT_CONFIG.feeRate),
    maxPoints:
      Number.isFinite(tcMaxNum) && tcMaxNum > 0 ? tcMaxNum : DEFAULT_CONFIG.maxPoints,
    dailyLimit:
      Number.isFinite(tcDailyNum) && tcDailyNum > 0 ? tcDailyNum : DEFAULT_CONFIG.dailyLimit,
    requireRealName:
      tcRealName && typeof tcRealName.enabled === 'boolean'
        ? tcRealName.enabled
        : DEFAULT_CONFIG.requireRealName,
  };
}

/**
 * #20260831-1600 P0-3：从 withdraw_accounts 读取当前用户**真实绑定**的收款账户
 * 并校验指定渠道是否已绑定。任何情况下都不能使用请求体传入的第三方账户。
 */
export async function getBoundAccountForType(
  userId: string,
  accountType: WithdrawAccountType
): Promise<{ ok: true; info: WithdrawAccountInfo; bound: any } | { ok: false; reason: string }> {
  const bound = await getWithdrawAccount(userId);
  if (!bound) {
    return { ok: false, reason: '请先在「提现账户」中绑定收款账户后再申请提现' };
  }

  if (accountType === 'wechat') {
    if (!bound.wechat_openid) return { ok: false, reason: '未绑定微信收款账户，请先在提现账户中绑定' };
    return { ok: true, info: { wechat_openid: bound.wechat_openid }, bound };
  }
  if (accountType === 'alipay') {
    if (!bound.alipay_account) return { ok: false, reason: '未绑定支付宝收款账户，请先在提现账户中绑定' };
    return {
      ok: true,
      info: { alipay_account: bound.alipay_account, bank_holder: bound.bank_holder || undefined },
      bound,
    };
  }
  // bank
  if (!bound.bank_card || !bound.bank_holder) {
    return { ok: false, reason: '未绑定银行卡收款账户，请先在提现账户中绑定' };
  }
  return {
    ok: true,
    info: {
      bank_name: bound.bank_name || undefined,
      bank_card: bound.bank_card,
      bank_holder: bound.bank_holder,
    },
    bound,
  };
}

/**
 * 比对请求体传入的账户与已绑定账户是否一致（P0-3）
 * 返回不一致的字段名列表；空数组表示一致。
 */
function diffAccountInfo(provided: WithdrawAccountInfo, bound: WithdrawAccountInfo): string[] {
  const diffs: string[] = [];
  const keys: (keyof WithdrawAccountInfo)[] = [
    'wechat_openid',
    'alipay_account',
    'bank_name',
    'bank_card',
    'bank_holder',
  ];
  for (const k of keys) {
    const p = provided[k];
    const b = bound[k];
    // 请求体未提供的字段不参与比对（前端可只传部分字段）
    if (p === undefined || p === null || p === '') continue;
    if (b === undefined || b === null || b === '') {
      diffs.push(k);
      continue;
    }
    if (String(p) !== String(b)) diffs.push(k);
  }
  return diffs;
}

/** 校验用户 ID 是否为 UUID（提现需真实注册账号） */
export function isUuidUserId(userId: string): boolean {
  return UUID_REGEX.test(userId);
}

/** 获取用户提现账户 */
export async function getWithdrawAccount(userId: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('withdraw_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[Withdraw] 查询提现账户失败:', error.message);
    return null;
  }
  return data;
}

/**
 * 保存/更新用户提现账户（upsert，一用户一账户）
 *
 * #20260831-1600 P1-9：支持实名信息（real_name / id_card_no）。
 * 身份证号仅做基础格式校验（18 位，末位可为 X），不做真实性核验；
 * 姓名非空即视为已实名（verified_at 记录首次写入时间）。
 */
export async function saveWithdrawAccount(userId: string, info: WithdrawAccountInfo) {
  const db = getSupabaseServiceClient();

  // 身份证号基础格式校验（允许不填，填了就必须是 18 位）
  if (info.id_card_no && !/^\d{17}[\dXx]$/.test(String(info.id_card_no).trim())) {
    return { success: false, reason: '身份证号格式不正确（应为 18 位，末位可为 X）' };
  }

  // 读取既有账户，保留未传入的字段（避免局部更新把已绑定渠道清空）
  const existing = await getWithdrawAccount(userId);
  const merged = {
    user_id: userId,
    wechat_openid: info.wechat_openid ?? existing?.wechat_openid ?? null,
    alipay_account: info.alipay_account ?? existing?.alipay_account ?? null,
    bank_name: info.bank_name ?? existing?.bank_name ?? null,
    bank_card: info.bank_card ?? existing?.bank_card ?? null,
    bank_holder: info.bank_holder ?? existing?.bank_holder ?? null,
    real_name: info.real_name ?? existing?.real_name ?? null,
    id_card_no: info.id_card_no ?? existing?.id_card_no ?? null,
    verified_at:
      (info.real_name ?? existing?.real_name)
        ? existing?.verified_at || new Date().toISOString()
        : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('withdraw_accounts')
    .upsert(merged, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('[Withdraw] 保存提现账户失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, account: data };
}

/** 获取用户提现记录 */
export async function getUserWithdrawRecords(userId: string, limit = 50) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('points_withdraw')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[Withdraw] 查询提现记录失败:', error.message);
    return [];
  }
  return data || [];
}

/** 获取管理员提现列表（分页 + 状态过滤） */
export async function getAdminWithdrawList(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let query = db
    .from('points_withdraw')
    .select('*, user:users!user_id(id, username, email, metadata)', { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[Withdraw] 查询提现列表失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
  return { records: attachUserPhone(data || []), total: count || 0 };
}

/**
 * 申请提现
 *
 * #20260831-1600 流程（P0-3 / P1-9 / P1-10）：
 *   校验参数 → 读取配置 → 校验收款账户归属感（P0-3）→ 实名认证 / 单笔上限 /
 *   每日次数 / pending 去重（P1-9）→ **冻结**积分（P1-10）→ 生成记录(pending)
 *
 * 与旧实现的关键差异：
 *   - 旧：申请时立即真扣积分（无冻结），且 account_info 完全取自请求体（可提现到任意第三方）
 *   - 新：申请时冻结积分（可用余额↓ 冻结余额↑），账户强制取自 withdraw_accounts 并比对
 *
 * 冻结与记录创建之间若失败会自动解冻（幂等 referenceId）。
 */
export async function applyWithdraw(params: ApplyWithdrawParams): Promise<WithdrawResult> {
  const { userId, points, accountType, accountInfo, remark } = params;

  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持提现，请先注册并登录' };
  }

  if (!Number.isInteger(points) || points <= 0) {
    return { success: false, reason: '提现积分必须为正整数' };
  }
  if (!['wechat', 'alipay', 'bank'].includes(accountType)) {
    return { success: false, reason: '不支持的提现方式' };
  }

  const config = await getWithdrawConfig();
  if (!config.enabled) {
    return { success: false, reason: '提现功能暂未开放' };
  }

  const db = getSupabaseServiceClient();

  // ---------- P0-3：收款账户归属校验（禁止提现到第三方账户） ----------
  const boundResult = await getBoundAccountForType(userId, accountType);
  if (!boundResult.ok) {
    return { success: false, reason: boundResult.reason };
  }
  const boundInfo = boundResult.info;

  // 请求体若携带账户信息，必须与已绑定账户逐字段一致，否则视为篡改
  if (accountInfo && Object.keys(accountInfo).length > 0) {
    const diffs = diffAccountInfo(accountInfo, boundInfo);
    if (diffs.length > 0) {
      console.warn(
        `[Withdraw] 收款账户与绑定账户不一致，已拒绝: user=${userId}, diffs=${diffs.join(',')}`
      );
      return {
        success: false,
        reason: '收款账户与已绑定的提现账户不一致，如需更换请先修改提现账户',
      };
    }
  }

  // ---------- P1-9 防刷 ----------
  // 1) 实名认证
  if (config.requireRealName) {
    const realName = (boundResult.bound as any)?.real_name;
    if (!realName || !String(realName).trim()) {
      return { success: false, reason: '提现需完成实名认证，请先在「提现账户」中填写真实姓名' };
    }
  }

  // 2) 单笔最大额度
  if (config.maxPoints > 0 && points > config.maxPoints) {
    return { success: false, reason: `单笔提现积分不得超过 ${config.maxPoints}` };
  }

  // 3) 每日申请次数
  if (config.dailyLimit > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count: todayCount, error: todayError } = await db
      .from('points_withdraw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfDay.toISOString());
    if (!todayError && (todayCount || 0) >= config.dailyLimit) {
      return { success: false, reason: `每日最多提交 ${config.dailyLimit} 笔提现申请，请明日再试` };
    }
  }

  // 4) 未完结申请去重（pending / approved 均视为占用中）
  const { count: pendingCount, error: pendingError } = await db
    .from('points_withdraw')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'approved']);
  if (!pendingError && (pendingCount || 0) > 0) {
    return { success: false, reason: '您有尚未处理完的提现申请，请等待审核/打款完成后再提交' };
  }

  // ---------- 金额校验 ----------
  if (points < config.minPoints) {
    return { success: false, reason: `最低提现积分为 ${config.minPoints}` };
  }

  // 计算金额：amount = points / rate（元），手续费按比例扣除
  const amount = points / config.rate;
  const fee = Number((amount * config.feeRate).toFixed(2));
  const actualAmount = Number((amount - fee).toFixed(2));
  if (amount < config.minAmount) {
    return { success: false, reason: `最低提现金额为 ${config.minAmount} 元（需 ${Math.ceil(config.minAmount * config.rate)} 积分）` };
  }
  if (actualAmount <= 0) {
    return { success: false, reason: '提现金额计算异常（手续费过高）' };
  }

  // ---------- P1-10：冻结积分（非真扣） ----------
  const withdrawId = crypto.randomUUID();
  const freezeReferenceId = `withdraw_freeze_${withdrawId}`;
  const freezeResult = await pointsService.freezePoints(
    userId,
    points,
    `积分提现申请冻结：${points} 积分`,
    freezeReferenceId
  );
  if (!freezeResult.success) {
    return { success: false, reason: freezeResult.reason || '积分冻结失败' };
  }

  // 生成提现记录（账户信息以绑定账户为准）
  const { data, error } = await db
    .from('points_withdraw')
    .insert({
      id: withdrawId,
      user_id: userId,
      points,
      amount: actualAmount,
      rate: config.rate,
      status: 'pending',
      account_type: accountType,
      account_info: boundInfo,
      freeze_reference_id: freezeReferenceId,
      remark: remark || null,
    })
    .select()
    .single();

  if (error || !data) {
    // 记录创建失败 → 解冻（幂等，不会重复解冻）
    await pointsService.unfreezePoints(
      userId,
      points,
      '提现申请记录创建失败，积分解冻',
      `withdraw_unfreeze_${withdrawId}`
    );
    console.error('[Withdraw] 创建提现记录失败:', error?.message);
    return { success: false, reason: error?.message || '提现申请失败' };
  }

  return { success: true, withdraw: data };
}

/**
 * 审核通过
 * pending → approved
 */
export async function approveWithdraw(adminId: string, withdrawId: string): Promise<WithdrawResult> {
  const db = getSupabaseServiceClient();
  const { data: record, error: queryError } = await db
    .from('points_withdraw')
    .select('*')
    .eq('id', withdrawId)
    .maybeSingle();

  if (queryError || !record) {
    return { success: false, reason: '提现记录不存在' };
  }
  if (record.status !== 'pending') {
    return { success: false, reason: `当前状态（${record.status}）不可审核通过` };
  }

  const { data, error } = await db
    .from('points_withdraw')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: adminId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', withdrawId)
    .select()
    .single();

  if (error) {
    return { success: false, reason: error.message };
  }
  return { success: true, withdraw: data };
}

/**
 * 审核拒绝（退还积分）
 * pending → rejected
 */
export async function rejectWithdraw(adminId: string, withdrawId: string, reason?: string): Promise<WithdrawResult> {
  const db = getSupabaseServiceClient();
  const { data: record, error: queryError } = await db
    .from('points_withdraw')
    .select('*')
    .eq('id', withdrawId)
    .maybeSingle();

  if (queryError || !record) {
    return { success: false, reason: '提现记录不存在' };
  }
  if (record.status !== 'pending') {
    return { success: false, reason: `当前状态（${record.status}）不可拒绝` };
  }

  const { data, error } = await db
    .from('points_withdraw')
    .update({
      status: 'rejected',
      reject_reason: reason || '管理员拒绝',
      updated_at: new Date().toISOString(),
    })
    .eq('id', withdrawId)
    .select()
    .single();

  if (error) {
    return { success: false, reason: error.message };
  }

  // #20260831-1600 P1-10：拒绝 → **解冻**积分（冻结余额 → 可用余额）
  // 兼容旧数据：若该记录未走冻结（freeze_reference_id 为空），则退回 addPoints 旧路径
  const refunded = record.freeze_reference_id
    ? (
        await pointsService.unfreezePoints(
          record.user_id,
          record.points,
          '提现申请被拒绝，积分解冻退回',
          `withdraw_unfreeze_${withdrawId}`
        )
      ).success
    : await pointsService.refundPoints(
        record.user_id,
        record.points,
        `withdraw_${withdrawId}`,
        '提现申请被拒绝，积分退回'
      );
  if (!refunded) {
    console.error(`[Withdraw] 拒绝提现后退积分失败: withdraw=${withdrawId}, user=${record.user_id}`);
  }

  return { success: true, withdraw: data, refunded };
}

/**
 * 确认打款
 * approved → paid（自动打款成功） / failed（自动打款失败，退还积分）
 *
 * mode:
 *   'auto'  自动调用微信/支付宝打款接口（渠道未配置则返回错误）
 *   'manual'管理员线下已打款，登记 transactionId（无打款渠道时使用）
 */
export async function payWithdraw(
  adminId: string,
  withdrawId: string,
  mode: 'auto' | 'manual' = 'auto',
  transactionId?: string
): Promise<WithdrawResult> {
  const db = getSupabaseServiceClient();
  const { data: record, error: queryError } = await db
    .from('points_withdraw')
    .select('*')
    .eq('id', withdrawId)
    .maybeSingle();

  if (queryError || !record) {
    return { success: false, reason: '提现记录不存在' };
  }
  if (record.status !== 'approved') {
    return { success: false, reason: `当前状态（${record.status}）不可打款` };
  }

  // 手动打款登记
  if (mode === 'manual') {
    // #20260831-1600 P1-10：打款成功 → 真正扣除已冻结积分
    const consumed = await consumeFrozenForWithdraw(record);
    if (!consumed.success) {
      return { success: false, reason: consumed.reason || '扣减冻结积分失败，打款登记已中止' };
    }

    const { data, error } = await db
      .from('points_withdraw')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: adminId,
        paid_mode: 'manual',
        transaction_id: transactionId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawId)
      .select()
      .single();

    if (error) return { success: false, reason: error.message };
    return { success: true, withdraw: data, paidMode: 'manual' };
  }

  // 自动打款
  const accountInfo = (record.account_info || {}) as WithdrawAccountInfo;
  const amountFen = Math.round(Number(record.amount) * 100);
  const outBatchNo = `WD${Date.now()}`;
  const outDetailNo = `WD${Date.now()}${Math.floor(Math.random() * 10000)}`;

  let payResult: { success: boolean; transactionId?: string; error?: string };
  if (record.account_type === 'wechat') {
    if (!isWechatTransferConfigured()) {
      return { success: false, reason: '微信打款渠道未配置，请在环境变量配置 WECHAT_MCHID/API_V3_KEY/SERIAL_NO/PRIVATE_KEY，或使用手动打款登记' };
    }
    payResult = await transferToWechatOpenid({
      openid: accountInfo.wechat_openid || '',
      amountFen,
      outBatchNo,
      outDetailNo,
      remark: `积分提现 ${record.amount} 元`,
    });
  } else if (record.account_type === 'alipay') {
    if (!isAlipayTransferConfigured()) {
      return { success: false, reason: '支付宝打款渠道未配置，请在环境变量配置 ALIPAY_APP_ID/PRIVATE_KEY/PUBLIC_KEY，或使用手动打款登记' };
    }
    payResult = await transferToAlipayAccount({
      account: accountInfo.alipay_account || '',
      accountName: (accountInfo as any).bank_holder || undefined,
      amountYuan: Number(record.amount),
      outBizNo: outDetailNo,
      remark: `积分提现 ${record.amount} 元`,
    });
  } else {
    // 银行卡提现需银行代付渠道（未接入），引导手动打款
    return { success: false, reason: '银行卡提现暂未接入自动代付渠道，请使用手动打款登记' };
  }

  if (payResult.success) {
    // #20260831-1600 P1-10：打款成功 → 真正扣除已冻结积分
    const consumed = await consumeFrozenForWithdraw(record);
    if (!consumed.success) {
      console.error(
        `[Withdraw] 打款成功但扣减冻结积分失败: withdraw=${withdrawId}, reason=${consumed.reason}`
      );
    }

    const { data, error } = await db
      .from('points_withdraw')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: adminId,
        paid_mode: 'auto',
        transaction_id: payResult.transactionId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawId)
      .select()
      .single();

    if (error) return { success: false, reason: error.message };
    return { success: true, withdraw: data, paidMode: 'auto' };
  }

  // 打款失败 → 标记 failed 并退还积分
  const { data: failedRecord, error: updateError } = await db
    .from('points_withdraw')
    .update({
      status: 'failed',
      remark: payResult.error || '打款失败',
      updated_at: new Date().toISOString(),
    })
    .eq('id', withdrawId)
    .select()
    .single();

  if (updateError) {
    console.error('[Withdraw] 打款失败后更新状态失败:', updateError.message);
  }

  // #20260831-1600 P1-10：打款失败 → **解冻**积分（兼容未冻结的历史记录）
  const refunded = record.freeze_reference_id
    ? (
        await pointsService.unfreezePoints(
          record.user_id,
          record.points,
          '提现打款失败，积分解冻退回',
          `withdraw_unfreeze_${withdrawId}`
        )
      ).success
    : await pointsService.refundPoints(
        record.user_id,
        record.points,
        `withdraw_${withdrawId}`,
        '提现打款失败，积分退回'
      );
  if (!refunded) {
    console.error(`[Withdraw] 打款失败后退积分失败: withdraw=${withdrawId}`);
  }

  return {
    success: false,
    withdraw: failedRecord || record,
    refunded,
    reason: payResult.error || '打款失败，冻结积分已解冻退回',
  };
}

/**
 * #20260831-1600 P1-10：打款成功时扣除已冻结积分
 * 兼容旧数据：记录未走冻结（freeze_reference_id 为空）时视为已真扣，直接放行。
 */
async function consumeFrozenForWithdraw(
  record: any
): Promise<{ success: boolean; reason?: string }> {
  if (!record?.freeze_reference_id) {
    // 历史记录（旧逻辑申请时已真扣），无需再扣
    return { success: true };
  }
  return pointsService.consumeFrozenPoints(
    record.user_id,
    record.points,
    `提现打款成功，扣除冻结积分：${record.points} 积分`,
    `withdraw_paid_${record.id}`
  );
}

/** 统计提现概览（管理端） */
export async function getWithdrawStats() {
  const db = getSupabaseServiceClient();
  const { count: pending } = await db
    .from('points_withdraw')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  const { count: approved } = await db
    .from('points_withdraw')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');
  const { count: paid } = await db
    .from('points_withdraw')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paid');

  return {
    pending: pending || 0,
    approved: approved || 0,
    paid: paid || 0,
  };
}
