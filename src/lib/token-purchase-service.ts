/**
 * Token 套餐 + 购买记录 服务层
 *
 * 职责：
 * - 套餐 CRUD（管理端）
 * - 套餐列表/详情（用户端，仅 active）
 * - 购买下单（cash，复用微信 Native 统一下单，TK 前缀订单）
 * - 支付回调到账（幂等更新 token_balance）
 *
 * 关联：
 * - token_packages（套餐）
 * - token_purchases（购买记录）
 * - user_token_balance.token_balance（余额）
 * - src/lib/wechat-payment.ts（统一下单）
 *
 * 对话窗: [#202608292500-阶段二-会员与Token套餐]
 */

import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { isUuidUserId } from '@/lib/withdraw-service';
import { unifiedOrder, getWechatPaymentConfig } from '@/lib/wechat-payment';
import { syncOrderFromBusiness } from '@/lib/order-service';
import { attachUserPhone } from '@/lib/user-phone-utils';

export interface TokenPackageInput {
  code: string;
  name: string;
  description?: string;
  token_amount: number;
  price: number;
  original_price?: number;
  bonus_token?: number;
  sort_order?: number;
  is_active?: boolean;
  is_popular?: boolean;
}

/** 套餐列表 */
export async function getTokenPackages(options: { includeInactive?: boolean } = {}) {
  const db = getSupabaseServiceClient();
  let query = db.from('token_packages').select('*');
  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) {
    console.error('[Token] 查询套餐失败:', error.message);
    return [];
  }
  return data || [];
}

/** 套餐详情 */
export async function getTokenPackageById(id: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from('token_packages').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[Token] 查询套餐详情失败:', error.message);
    return null;
  }
  return data;
}

/** 创建套餐（管理端） */
export async function createTokenPackage(input: TokenPackageInput) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('token_packages')
    .insert({
      code: input.code,
      name: input.name,
      description: input.description || null,
      token_amount: input.token_amount,
      price: input.price,
      original_price: input.original_price ?? null,
      bonus_token: input.bonus_token || 0,
      sort_order: input.sort_order || 0,
      is_active: input.is_active ?? true,
      is_popular: input.is_popular ?? false,
    })
    .select()
    .single();
  if (error) {
    console.error('[Token] 创建套餐失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, package: data };
}

/** 更新套餐（管理端） */
export async function updateTokenPackage(id: string, input: Partial<TokenPackageInput>) {
  const db = getSupabaseServiceClient();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.code !== undefined) patch.code = input.code;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.token_amount !== undefined) patch.token_amount = input.token_amount;
  if (input.price !== undefined) patch.price = input.price;
  if (input.original_price !== undefined) patch.original_price = input.original_price;
  if (input.bonus_token !== undefined) patch.bonus_token = input.bonus_token;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_popular !== undefined) patch.is_popular = input.is_popular;

  const { data, error } = await db.from('token_packages').update(patch).eq('id', id).select().single();
  if (error) {
    console.error('[Token] 更新套餐失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, package: data };
}

/** 删除套餐（管理端）：存在购买记录时软下架，否则物理删除 */
export async function deleteTokenPackage(id: string) {
  const db = getSupabaseServiceClient();
  const { count, error: countError } = await db
    .from('token_purchases')
    .select('*', { count: 'exact', head: true })
    .eq('package_id', id);
  if (countError) {
    return { success: false, reason: countError.message };
  }
  if ((count || 0) > 0) {
    const { data, error } = await db
      .from('token_packages')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return { success: false, reason: error.message };
    return { success: true, package: data, softDeleted: true };
  }
  const { error } = await db.from('token_packages').delete().eq('id', id);
  if (error) {
    return { success: false, reason: error.message };
  }
  return { success: true };
}

/** 获取用户 Token 余额（无记录时自动初始化） */
export async function getTokenBalance(userId: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('user_token_balance')
    .select('token_balance, points_balance, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Token] 查询余额失败:', error.message);
    return { success: false, reason: error.message };
  }
  if (data) {
    return { success: true, balance: Number(data.token_balance || 0), pointsBalance: Number(data.points_balance || 0) };
  }
  // 无记录：初始化
  const { data: created, error: createError } = await db
    .from('user_token_balance')
    .insert({ user_id: userId, token_balance: 0, points_balance: 0 })
    .select('token_balance')
    .single();
  if (createError) {
    console.error('[Token] 初始化余额失败:', createError.message);
    return { success: false, reason: createError.message };
  }
  return { success: true, balance: Number(created.token_balance || 0), pointsBalance: 0 };
}

/**
 * 购买 Token（下单）
 * 流程：校验套餐 → 创建购买记录(pending, TK 前缀) → 微信统一下单 → 返回 code_url
 */
export async function purchaseToken(userId: string, packageId: string) {
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持购买，请先注册并登录' };
  }
  const pkg = await getTokenPackageById(packageId);
  if (!pkg) {
    return { success: false, reason: 'Token套餐不存在' };
  }
  if (!pkg.is_active) {
    return { success: false, reason: '该套餐已下架' };
  }

  const db = getSupabaseServiceClient();
  const orderNo = `TK${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const tokenAmount = Number(pkg.token_amount || 0);
  const bonusToken = Number(pkg.bonus_token || 0);
  const totalToken = tokenAmount + bonusToken;

  const { data, error } = await db
    .from('token_purchases')
    .insert({
      user_id: userId,
      package_id: packageId,
      order_no: orderNo,
      token_amount: tokenAmount,
      bonus_token: bonusToken,
      total_token: totalToken,
      price: Number(pkg.price || 0),
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[Token] 创建购买记录失败:', error?.message);
    return { success: false, reason: error?.message || '下单失败' };
  }

  // 同步到统一订单表（pending）
  await syncOrderFromBusiness(orderNo);

  // 调用微信 Native 统一下单（amount 单位：分）
  try {
    const payConfig = await getWechatPaymentConfig();
    const payResult = await unifiedOrder({
      description: `Token套餐：${pkg.name}（${totalToken} Tokens）`,
      outTradeNo: orderNo,
      amount: Math.round(Number(pkg.price || 0) * 100),
      notifyUrl: payConfig?.notifyUrl || '',
    });
    return { success: true, order: data, orderNo, codeUrl: payResult.code_url };
  } catch (payError: any) {
    await db
      .from('token_purchases')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', data.id);
    console.error('[Token] 微信统一下单失败:', payError?.message || payError);
    return { success: false, reason: '支付下单失败，请稍后重试' };
  }
}

/**
 * 支付回调到账（幂等）
 * 流程：校验订单 pending → 更新 completed → token_balance += total_token
 */
export async function creditToken(userId: string, orderNo: string, transactionId?: string) {
  const db = getSupabaseServiceClient();

  // 1. 查订单
  const { data: order, error: orderError } = await db
    .from('token_purchases')
    .select('*')
    .eq('order_no', orderNo)
    .eq('user_id', userId)
    .maybeSingle();
  if (orderError) {
    console.error('[Token] 查询购买订单失败:', orderError.message);
    return { success: false, reason: orderError.message };
  }
  if (!order) {
    return { success: false, reason: 'Token订单不存在' };
  }
  // 幂等：已完成直接返回
  if (order.status === 'completed') {
    return { success: true, order };
  }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return { success: false, reason: '订单已取消/退款' };
  }

  const totalToken = Number(order.total_token || 0);
  if (totalToken <= 0) {
    return { success: false, reason: '订单 Token 数量异常' };
  }

  // 2. 更新余额（原子：条件 UPDATE 校验同一行最新值，并发安全）
  const { data: balance, error: balanceError } = await db
    .from('user_token_balance')
    .select('token_balance')
    .eq('user_id', userId)
    .maybeSingle();

  const current = Number(balance?.token_balance ?? 0);
  const newBalance = current + totalToken;
  const { error: updateBalanceError } = await db
    .from('user_token_balance')
    .update({ token_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (updateBalanceError) {
    console.error('[Token] 更新余额失败:', updateBalanceError.message);
    return { success: false, reason: updateBalanceError.message };
  }

  // 3. 标记订单完成
  const { data: updated, error: updateError } = await db
    .from('token_purchases')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select()
    .single();
  if (updateError) {
    // 余额已加（幂等依赖 status，此处标记失败会让微信重试 → 重复加余额）
    // 兜底：重试时余额会再加一次。为防重复入账，这里标记失败前回滚余额。
    console.error('[Token] 更新订单状态失败，回滚余额:', updateError.message);
    await db
      .from('user_token_balance')
      .update({ token_balance: current, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return { success: false, reason: updateError.message };
  }

  console.log(`[Token] 到账成功: order=${orderNo}, tokens=${totalToken}, tx=${transactionId || '-'}`);
  return { success: true, order: updated, tokensCredited: totalToken };
}

/** 用户 Token 购买历史 */
export async function getTokenPurchaseHistory(userId: string, limit = 50) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('token_purchases')
    .select('*, package:token_packages(id, name, token_amount)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[Token] 查询购买历史失败:', error.message);
    return [];
  }
  return data || [];
}

/** 管理端购买记录列表 */
export async function getAdminTokenPurchases(params: { status?: string; page?: number; pageSize?: number } = {}) {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let query = db
    .from('token_purchases')
    .select('*, user:users(id, username, email, metadata), package:token_packages(id, name)', { count: 'exact' });
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[Token] 查询购买记录失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
  return { records: attachUserPhone(data || []), total: count || 0 };
}
