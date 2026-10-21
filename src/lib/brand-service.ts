/**
 * 品牌厂商付费推广 服务层
 *
 * 职责：
 * - 品牌入驻/更新/状态查询（用户端）
 * - 套餐 CRUD（管理端）
 * - 购买付费（cash，复用微信 Native 统一下单，BP 前缀订单）
 * - 支付回调开通权益（幂等，更新 brand_vendors 优先级/评分/认证）
 * - 品牌排行列表 + 询价/查价时的匹配推荐
 * - 权益过期惰性降级（读取时判定 priority_expire_at）
 *
 * 关联：
 * - brand_vendors（品牌）
 * - brand_packages（套餐）
 * - brand_payments（付费记录）
 * - src/lib/wechat-payment.ts（统一下单）
 *
 * 对话窗: [#202608292600-阶段三-厂商付费推广]
 *         [#20260831-1600 P1-7 置顶天数发放 / P1-11 入驻资质与审核通知]
 */

import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { isUuidUserId } from '@/lib/withdraw-service';
import { unifiedOrder, getWechatPaymentConfig } from '@/lib/wechat-payment';
import { syncOrderFromBusiness } from '@/lib/order-service';
import { attachUserPhone } from '@/lib/user-phone-utils';
import { createNotification } from '@/lib/notification-service';

/** 优先等级映射 */
export const BRAND_LEVEL_LABEL: Record<number, string> = {
  0: '免费',
  1: '白银',
  2: '黄金',
  3: '铂金',
};

/** 匹配排序权重（第四部分规范） */
export const BRAND_MATCH_WEIGHTS = {
  priority_level: 100, // 付费等级权重
  rating: 50, // 评分权重
  order_count: 30, // 成单数权重
  view_count: 10, // 曝光数权重
  total_paid: 20, // 累计付费权重
};

export interface BrandCreateData {
  brand_name: string;
  brand_logo?: string;
  brand_desc?: string;
  category?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  website?: string;
  address?: string;
  /** #20260831-1600 P1-11 入驻资质 */
  business_license?: string; // 统一社会信用代码（18 位）
  license_image_url?: string; // 营业执照图片
  legal_person?: string; // 法人代表
  qualifications?: Array<{ name: string; url?: string; expired_at?: string }>; // 其他资质材料
}

export interface BrandUpdateData extends Partial<BrandCreateData> {}

/**
 * #20260831-1600 P1-11：入驻资料校验
 * 统一社会信用代码：18 位大写字母与数字（不含 I/O/Z/S/V）
 * 手机号：中国大陆 11 位
 * 邮箱：基础格式
 */
export function validateBrandQualification(data: BrandCreateData): { ok: true } | { ok: false; reason: string } {
  const name = (data.brand_name || '').trim();
  if (!name) return { ok: false, reason: '品牌名称不能为空' };
  if (name.length < 2 || name.length > 60) {
    return { ok: false, reason: '品牌名称长度需在 2~60 个字符之间' };
  }

  if (data.contact_phone && !/^1[3-9]\d{9}$/.test(String(data.contact_phone).trim())) {
    return { ok: false, reason: '联系电话格式不正确（应为 11 位中国大陆手机号）' };
  }
  if (data.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.contact_email).trim())) {
    return { ok: false, reason: '联系邮箱格式不正确' };
  }
  if (data.website && !/^https?:\/\/.+/i.test(String(data.website).trim())) {
    return { ok: false, reason: '官网地址需以 http:// 或 https:// 开头' };
  }

  const license = (data.business_license || '').trim();
  if (license && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(license.toUpperCase())) {
    return { ok: false, reason: '统一社会信用代码格式不正确（应为 18 位）' };
  }

  // 资质材料数组结构校验
  if (data.qualifications !== undefined) {
    if (!Array.isArray(data.qualifications)) {
      return { ok: false, reason: '资质材料格式不正确' };
    }
    for (const q of data.qualifications) {
      if (!q || typeof q.name !== 'string' || !q.name.trim()) {
        return { ok: false, reason: '资质材料缺少名称' };
      }
    }
  }

  return { ok: true };
}

export interface BrandPackageInput {
  code: string;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  priority_level: number;
  duration_days: number;
  boost_score?: number;
  match_boost?: number;
  is_verified?: boolean;
  sort_order?: number;
  is_active?: boolean;
  is_popular?: boolean;
}

/**
 * 创建品牌入驻申请
 * - 每个用户最多一条品牌记录：无则创建(pending)，有则返回已存在
 */
export async function createBrand(userId: string, data: BrandCreateData) {
  // #20260831-1600 P1-11：入驻资质与联系方式校验（替代原先仅判非空）
  const validation = validateBrandQualification(data);
  if (!validation.ok) {
    return { success: false, reason: validation.reason };
  }

  const db = getSupabaseServiceClient();

  const { data: existing } = await db
    .from('brand_vendors')
    .select('id, brand_name, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    return { success: false, reason: '您已提交过品牌入驻申请，请勿重复提交', brand: existing };
  }

  const { data: inserted, error } = await db
    .from('brand_vendors')
    .insert({
      user_id: userId,
      brand_name: data.brand_name.trim(),
      brand_logo: data.brand_logo || null,
      brand_desc: data.brand_desc || null,
      category: data.category || null,
      contact_person: data.contact_person || null,
      contact_phone: data.contact_phone || null,
      contact_email: data.contact_email || null,
      website: data.website || null,
      address: data.address || null,
      // P1-11 资质字段
      business_license: data.business_license?.trim() || null,
      license_image_url: data.license_image_url || null,
      legal_person: data.legal_person?.trim() || null,
      qualifications: data.qualifications || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[Brand] 创建入驻申请失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, brand: inserted };
}

/** 更新品牌信息（用户只能更新自己的品牌；审核中/已通过可改，暂停不可改） */
export async function updateBrand(brandId: string, userId: string, data: BrandUpdateData) {
  const db = getSupabaseServiceClient();
  const { data: brand, error: qErr } = await db
    .from('brand_vendors')
    .select('id, user_id, status, brand_name')
    .eq('id', brandId)
    .maybeSingle();
  if (qErr) return { success: false, reason: qErr.message };
  if (!brand) return { success: false, reason: '品牌不存在' };
  if (brand.user_id !== userId) return { success: false, reason: '无权操作该品牌' };
  if (brand.status === 'suspended') return { success: false, reason: '品牌已被暂停，无法修改' };

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  // #20260831-1600 P1-11：资质字段纳入可更新范围
  const fields = [
    'brand_name', 'brand_logo', 'brand_desc', 'category',
    'contact_person', 'contact_phone', 'contact_email', 'website', 'address',
    'business_license', 'license_image_url', 'legal_person', 'qualifications',
  ] as const;
  for (const f of fields) {
    if (data[f as keyof BrandUpdateData] !== undefined) {
      const v = (data as any)[f];
      patch[f] = typeof v === 'string' ? (v.trim() || null) : (v ?? null);
    }
  }

  // 修改资质/联系方式时同样做格式校验，防止绕过入驻校验
  if (
    patch.contact_phone ||
    patch.contact_email ||
    patch.website ||
    patch.business_license ||
    patch.qualifications
  ) {
    const validation = validateBrandQualification({
      brand_name: patch.brand_name ?? brand.brand_name ?? '占位名称',
      contact_phone: patch.contact_phone ?? undefined,
      contact_email: patch.contact_email ?? undefined,
      website: patch.website ?? undefined,
      business_license: patch.business_license ?? undefined,
      qualifications: patch.qualifications ?? undefined,
    } as BrandCreateData);
    if (!validation.ok) return { success: false, reason: validation.reason };
  }

  const { data: updated, error } = await db
    .from('brand_vendors')
    .update(patch)
    .eq('id', brandId)
    .select()
    .single();
  if (error) {
    console.error('[Brand] 更新品牌失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, brand: updated };
}

/**
 * 获取用户品牌（含权益过期惰性降级）
 */
export async function getBrandByUserId(userId: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('brand_vendors')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[Brand] 查询品牌失败:', error.message);
    return null;
  }
  if (!data) return null;
  await refreshBrandBenefits(data.id);
  const { data: refreshed } = await db
    .from('brand_vendors')
    .select('*')
    .eq('id', data.id)
    .maybeSingle();
  return refreshed || data;
}

/** 品牌详情（公开） */
export async function getBrandById(brandId: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from('brand_vendors').select('*').eq('id', brandId).maybeSingle();
  if (error) {
    console.error('[Brand] 查询品牌详情失败:', error.message);
    return null;
  }
  if (!data) return null;
  await refreshBrandBenefits(brandId);
  return data;
}

/** 套餐列表 */
export async function getBrandPackages(options: { includeInactive?: boolean } = {}) {
  const db = getSupabaseServiceClient();
  let query = db.from('brand_packages').select('*');
  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) {
    console.error('[Brand] 查询套餐失败:', error.message);
    return [];
  }
  return data || [];
}

/** 套餐详情 */
export async function getBrandPackageById(id: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from('brand_packages').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[Brand] 查询套餐详情失败:', error.message);
    return null;
  }
  return data;
}

/** 创建套餐（管理端） */
export async function createBrandPackage(input: BrandPackageInput) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('brand_packages')
    .insert({
      code: input.code,
      name: input.name,
      description: input.description || null,
      price: input.price,
      original_price: input.original_price ?? null,
      priority_level: input.priority_level,
      duration_days: input.duration_days,
      boost_score: input.boost_score ?? 100,
      match_boost: input.match_boost ?? 10,
      is_verified: input.is_verified ?? false,
      sort_order: input.sort_order || 0,
      is_active: input.is_active ?? true,
      is_popular: input.is_popular ?? false,
    })
    .select()
    .single();
  if (error) {
    console.error('[Brand] 创建套餐失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, package: data };
}

/** 更新套餐（管理端） */
export async function updateBrandPackage(id: string, input: Partial<BrandPackageInput>) {
  const db = getSupabaseServiceClient();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.code !== undefined) patch.code = input.code;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.price !== undefined) patch.price = input.price;
  if (input.original_price !== undefined) patch.original_price = input.original_price;
  if (input.priority_level !== undefined) patch.priority_level = input.priority_level;
  if (input.duration_days !== undefined) patch.duration_days = input.duration_days;
  if (input.boost_score !== undefined) patch.boost_score = input.boost_score;
  if (input.match_boost !== undefined) patch.match_boost = input.match_boost;
  if (input.is_verified !== undefined) patch.is_verified = input.is_verified;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_popular !== undefined) patch.is_popular = input.is_popular;

  const { data, error } = await db.from('brand_packages').update(patch).eq('id', id).select().single();
  if (error) {
    console.error('[Brand] 更新套餐失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, package: data };
}

/** 删除套餐（管理端）：存在付费记录时软下架，否则物理删除 */
export async function deleteBrandPackage(id: string) {
  const db = getSupabaseServiceClient();
  const { count, error: countError } = await db
    .from('brand_payments')
    .select('*', { count: 'exact', head: true })
    .eq('package_id', id);
  if (countError) {
    return { success: false, reason: countError.message };
  }
  if ((count || 0) > 0) {
    const { data, error } = await db
      .from('brand_packages')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return { success: false, reason: error.message };
    return { success: true, package: data, softDeleted: true };
  }
  const { error } = await db.from('brand_packages').delete().eq('id', id);
  if (error) {
    return { success: false, reason: error.message };
  }
  return { success: true };
}

/**
 * 购买付费套餐（下单）
 * 流程：校验品牌(approved) + 套餐(active) → 创建付费记录(pending, BP 前缀)
 *   → 微信统一下单 → 返回 code_url
 */
export async function purchaseBrandPackage(userId: string, brandId: string, packageId: string) {
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持购买，请先注册并登录' };
  }
  const db = getSupabaseServiceClient();

  // 校验品牌归属 + 状态
  const { data: brand, error: brandError } = await db
    .from('brand_vendors')
    .select('id, user_id, brand_name, status, priority_expire_at')
    .eq('id', brandId)
    .maybeSingle();
  if (brandError || !brand) {
    return { success: false, reason: '品牌不存在' };
  }
  if (brand.user_id !== userId) {
    return { success: false, reason: '只能为自己入驻的品牌购买推广' };
  }
  if (brand.status !== 'approved') {
    return { success: false, reason: '品牌需审核通过后才能购买推广套餐' };
  }

  const pkg = await getBrandPackageById(packageId);
  if (!pkg) {
    return { success: false, reason: '推广套餐不存在' };
  }
  if (!pkg.is_active) {
    return { success: false, reason: '该套餐已下架' };
  }

  const orderNo = `BP${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const { data, error } = await db
    .from('brand_payments')
    .insert({
      brand_id: brandId,
      user_id: userId,
      package_id: packageId,
      order_no: orderNo,
      amount: Number(pkg.price || 0),
      priority_level: Number(pkg.priority_level || 0),
      duration_days: Number(pkg.duration_days || 0),
      boost_score: Number(pkg.boost_score || 0),
      match_boost: Number(pkg.match_boost || 0),
      is_verified: !!pkg.is_verified,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[Brand] 创建付费记录失败:', error?.message);
    return { success: false, reason: error?.message || '下单失败' };
  }

  // 同步到统一订单表（pending）
  await syncOrderFromBusiness(orderNo);

  // 调用微信 Native 统一下单（amount 单位：分）
  try {
    const payConfig = await getWechatPaymentConfig();
    const payResult = await unifiedOrder({
      description: `品牌推广：${pkg.name}（${brand.brand_name}）`,
      outTradeNo: orderNo,
      amount: Math.round(Number(pkg.price || 0) * 100),
      notifyUrl: payConfig?.notifyUrl || '',
    });
    return { success: true, order: data, orderNo, codeUrl: payResult.code_url };
  } catch (payError: any) {
    await db
      .from('brand_payments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', data.id);
    console.error('[Brand] 微信统一下单失败:', payError?.message || payError);
    return { success: false, reason: '支付下单失败，请稍后重试' };
  }
}

/**
 * 支付回调开通权益（幂等）
 * 流程：校验订单 pending → 计算权益起止（已有未过期权益则顺延）
 *   → 更新品牌等级/评分/认证/累计付费 → 订单 completed
 */
export async function activateBrandPayment(brandId: string, orderNo: string, transactionId?: string) {
  const db = getSupabaseServiceClient();

  const { data: order, error: orderError } = await db
    .from('brand_payments')
    .select('*')
    .eq('order_no', orderNo)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (orderError) {
    console.error('[Brand] 查询付费订单失败:', orderError.message);
    return { success: false, reason: orderError.message };
  }
  if (!order) {
    return { success: false, reason: '付费订单不存在' };
  }
  // 幂等：已完成直接返回
  if (order.status === 'completed') {
    return { success: true, order };
  }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return { success: false, reason: '订单已取消/退款' };
  }

  // 计算权益起止：已有未过期权益则顺延，否则从今天起算
  const durationDays = Number(order.duration_days || 0);
  const now = new Date();
  let start = now;
  const { data: brand } = await db
    .from('brand_vendors')
    .select('priority_expire_at')
    .eq('id', brandId)
    .maybeSingle();
  if (brand?.priority_expire_at && new Date(brand.priority_expire_at).getTime() > now.getTime()) {
    start = new Date(brand.priority_expire_at);
  }
  const end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // 更新订单为已完成
  const { data: updated, error: updateError } = await db
    .from('brand_payments')
    .update({
      status: 'completed',
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', order.id)
    .select()
    .single();
  if (updateError) {
    console.error('[Brand] 更新付费订单失败:', updateError.message);
    return { success: false, reason: updateError.message };
  }

  // 更新品牌权益：等级（取最高）、评分累加、认证、累计付费
  const { data: currentBrand } = await db
    .from('brand_vendors')
    .select('priority_level, priority_expire_at, ranking_score, total_paid, is_verified')
    .eq('id', brandId)
    .maybeSingle();

  const newPriorityLevel = Math.max(Number(currentBrand?.priority_level || 0), Number(order.priority_level || 0));
  const newRankingScore = Number(currentBrand?.ranking_score || 0) + Number(order.boost_score || 0);
  const newTotalPaid = Number(currentBrand?.total_paid || 0) + Number(order.amount || 0);

  const { error: brandUpdateError } = await db
    .from('brand_vendors')
    .update({
      priority_level: newPriorityLevel,
      priority_expire_at: end.toISOString(),
      ranking_score: newRankingScore,
      total_paid: newTotalPaid,
      is_verified: !!order.is_verified || !!currentBrand?.is_verified,
      updated_at: now.toISOString(),
    })
    .eq('id', brandId);
  if (brandUpdateError) {
    console.error('[Brand] 更新品牌权益失败:', brandUpdateError.message);
    return { success: false, reason: brandUpdateError.message };
  }

  console.log(`[Brand] 品牌权益开通成功: brand=${brandId}, order=${orderNo}, level=${newPriorityLevel}, tx=${transactionId || '-'}`);
  return { success: true, order: updated };
}

/**
 * 权益过期惰性降级：
 * - 若 priority_expire_at 已过期，重新计算该品牌所有未过期 completed 权益的最高等级；
 * - 无有效权益则降为 0（免费）并清除认证标识。
 */
async function refreshBrandBenefits(brandId: string) {
  const db = getSupabaseServiceClient();
  const { data: brand } = await db
    .from('brand_vendors')
    .select('priority_expire_at')
    .eq('id', brandId)
    .maybeSingle();
  if (!brand?.priority_expire_at) return;
  if (new Date(brand.priority_expire_at).getTime() > Date.now()) return;

  const now = new Date().toISOString();
  const { data: activePayments } = await db
    .from('brand_payments')
    .select('priority_level, is_verified, end_date')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .gt('end_date', now);

  let level = 0;
  let verified = false;
  if (activePayments && activePayments.length > 0) {
    level = Math.max(0, ...activePayments.map((p) => Number(p.priority_level || 0)));
    verified = activePayments.some((p) => !!p.is_verified);
  }

  const { data: latestEnd } = await db
    .from('brand_payments')
    .select('end_date')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .gt('end_date', now)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  await db
    .from('brand_vendors')
    .update({
      priority_level: level,
      priority_expire_at: latestEnd?.end_date || null,
      is_verified: verified,
      updated_at: new Date().toISOString(),
    })
    .eq('id', brandId);
}

/**
 * 品牌排行列表（公开）
 * 规则：仅 approved + 非 suspended；优先等级降序 → ranking_score 降序 → 创建时间升序
 */
export async function getBrandRankingList(options: { category?: string; limit?: number } = {}) {
  const db = getSupabaseServiceClient();
  const limit = Math.min(100, Math.max(1, options.limit || 20));

  let query = db.from('brand_vendors').select('*').eq('status', 'approved').neq('status', 'suspended');
  if (options.category) {
    query = query.eq('category', options.category);
  }
  const { data, error } = await query
    .order('priority_level', { ascending: false })
    .order('ranking_score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[Brand] 查询排行失败:', error.message);
    return [];
  }
  return data || [];
}

/**
 * 匹配推荐品牌（询价/查价时优先匹配）
 * 规则：approved 品牌，综合权重分排序：
 *   score = priority_level * BRAND_MATCH_WEIGHTS.priority_level
 *         + rating * BRAND_MATCH_WEIGHTS.rating
 *         + order_count * BRAND_MATCH_WEIGHTS.order_count
 *         + view_count * BRAND_MATCH_WEIGHTS.view_count
 *         + total_paid * BRAND_MATCH_WEIGHTS.total_paid
 * 付费品牌（priority_level > 0）始终排在未付费品牌之前。
 */
export async function getMatchingBrands(options: { category?: string; limit?: number } = {}) {
  const db = getSupabaseServiceClient();
  const limit = Math.min(100, Math.max(1, options.limit || 10));

  let query = db.from('brand_vendors').select('*').eq('status', 'approved');
  if (options.category) {
    query = query.eq('category', options.category);
  }
  const { data, error } = await query.order('priority_level', { ascending: false }).order('created_at', { ascending: true }).limit(200);

  if (error) {
    console.error('[Brand] 查询匹配品牌失败:', error.message);
    return [];
  }

  const ranked = (data || []).map((brand) => {
    const score =
      Number(brand.priority_level || 0) * BRAND_MATCH_WEIGHTS.priority_level +
      Number(brand.rating || 0) * BRAND_MATCH_WEIGHTS.rating +
      Number(brand.order_count || 0) * BRAND_MATCH_WEIGHTS.order_count +
      Number(brand.view_count || 0) * BRAND_MATCH_WEIGHTS.view_count +
      Number(brand.total_paid || 0) * BRAND_MATCH_WEIGHTS.total_paid;
    return { ...brand, match_score: score };
  });

  ranked.sort((a, b) => {
    // 付费品牌优先（priority_level>0 在前）
    const aPaid = Number(a.priority_level || 0) > 0 ? 1 : 0;
    const bPaid = Number(b.priority_level || 0) > 0 ? 1 : 0;
    if (aPaid !== bPaid) return bPaid - aPaid;
    return b.match_score - a.match_score;
  });

  return ranked.slice(0, limit);
}

/** 用户品牌付费历史 */
export async function getBrandPaymentHistory(userId: string, limit = 50) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('brand_payments')
    .select('*, brand:brand_vendors(id, brand_name), package:brand_packages(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[Brand] 查询付费历史失败:', error.message);
    return [];
  }
  return data || [];
}

/** 管理端品牌列表（分页 + 状态筛选） */
export async function getAdminBrandVendors(params: { status?: string; keyword?: string; page?: number; pageSize?: number } = {}) {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let query = db.from('brand_vendors').select('*, user:users(id, username, email, metadata)', { count: 'exact' });
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.keyword) {
    query = query.or(`brand_name.ilike.%${params.keyword}%,contact_person.ilike.%${params.keyword}%`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[Brand] 查询品牌列表失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
  return { records: attachUserPhone(data || []), total: count || 0 };
}

/** 管理端付费记录列表（分页 + 状态筛选） */
export async function getAdminBrandPayments(params: { status?: string; page?: number; pageSize?: number } = {}) {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let query = db
    .from('brand_payments')
    .select('*, user:users(id, username, email, metadata), brand:brand_vendors(id, brand_name), package:brand_packages(id, name)', {
      count: 'exact',
    });
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[Brand] 查询付费记录失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
  return { records: attachUserPhone(data || []), total: count || 0 };
}

/**
 * #20260831-1600 P1-7：发放品牌置顶天数
 * 供积分商城「排名置顶体验卡」类虚拟商品调用。
 *
 * 规则：
 * - 品牌必须是 approved 状态（未审核通过的品牌不享有置顶权益）
 * - 在 priority_expire_at 基础上顺延 days 天（已过期则从今天起算）
 * - priority_level 至少提升到 1（白银），取 max(现有, 1)
 * - 使用 CAS（.eq('priority_expire_at', 读取值)）防并发重复延长
 */
export async function grantBrandPriorityDays(
  userId: string,
  days: number,
  source: string = '积分商城兑换'
): Promise<{ success: boolean; reason?: string; priority_expire_at?: string }> {
  if (!Number.isFinite(days) || days <= 0) {
    return { success: false, reason: '发放天数必须为正数' };
  }
  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，无法发放置顶权益' };
  }

  const db = getSupabaseServiceClient();
  const now = new Date();
  const addMs = days * 86400000;

  const { data: brand, error: qErr } = await db
    .from('brand_vendors')
    .select('id, user_id, status, priority_level, priority_expire_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (qErr) return { success: false, reason: qErr.message };
  if (!brand) {
    return { success: false, reason: '尚未提交品牌入驻申请，无法发放置顶权益' };
  }
  if (brand.status !== 'approved') {
    return { success: false, reason: '品牌尚未通过审核，暂不享有置顶权益' };
  }

  const CAS_MAX_RETRY = 3;
  for (let attempt = 0; attempt < CAS_MAX_RETRY; attempt++) {
    const { data: cur } = await db
      .from('brand_vendors')
      .select('priority_level, priority_expire_at')
      .eq('id', brand.id)
      .maybeSingle();
    if (!cur) return { success: false, reason: '品牌不存在' };

    const base =
      cur.priority_expire_at && new Date(cur.priority_expire_at).getTime() > now.getTime()
        ? new Date(cur.priority_expire_at)
        : now;
    const newEnd = new Date(base.getTime() + addMs);
    const newLevel = Math.max(Number(cur.priority_level || 0), 1);

    // CAS 条件：priority_expire_at 未被并发改动
    // 注意：值为 NULL 时 PostgREST 需用 .is(null)，不能用 .eq(null)
    const casQuery = db
      .from('brand_vendors')
      .update({
        priority_level: newLevel,
        priority_expire_at: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', brand.id);
    if (cur.priority_expire_at === null || cur.priority_expire_at === undefined) {
      casQuery.is('priority_expire_at', null);
    } else {
      casQuery.eq('priority_expire_at', cur.priority_expire_at);
    }

    const { data, error } = await casQuery.select('priority_expire_at').maybeSingle();

    if (error) return { success: false, reason: error.message };
    if (data) {
      await createNotification({
        userId,
        type: 'brand',
        title: '品牌置顶权益已发放',
        content: `${source}：置顶权益延长 ${days} 天，有效期至 ${new Date(
          data.priority_expire_at
        ).toLocaleDateString('zh-CN')}`,
        data: { reference_id: `brand_priority_grant_${brand.id}_${Date.now()}`, brand_id: brand.id },
      });
      return { success: true, priority_expire_at: data.priority_expire_at };
    }

    // CAS 冲突（含 priority_expire_at 为 NULL 时 .eq(NULL) 不匹配的首次场景）→ 退避重试
    await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
  }

  return { success: false, reason: '置顶权益发放冲突，请稍后重试' };
}

/**
 * 审核品牌（approve/reject/suspend）
 *
 * #20260831-1600 P1-11：审核结果通过站内信通知用户，并记录审核人与拒绝原因
 * @param adminId  审核人 users.id（UUID 才写入，本地 token 账号传 null）
 * @param reason   拒绝原因（reject 时必填，写入 brand_vendors.reject_reason）
 */
export async function reviewBrand(
  brandId: string,
  action: 'approve' | 'reject' | 'suspend',
  options: { adminId?: string | null; reason?: string } = {}
) {
  const db = getSupabaseServiceClient();
  const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';

  // 先读取品牌，拿到归属用户与品牌名用于通知
  const { data: before } = await db
    .from('brand_vendors')
    .select('id, user_id, brand_name, status')
    .eq('id', brandId)
    .maybeSingle();
  if (!before) {
    return { success: false, reason: '品牌不存在' };
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeAdminId =
    options.adminId && UUID_REGEX.test(options.adminId) ? options.adminId : null;

  const patch: Record<string, any> = {
    status: nextStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: safeAdminId,
    updated_at: new Date().toISOString(),
  };
  if (action === 'reject') {
    patch.reject_reason = options.reason || '管理员拒绝';
  } else if (action === 'approve') {
    patch.reject_reason = null;
  }

  const { data, error } = await db
    .from('brand_vendors')
    .update(patch)
    .eq('id', brandId)
    .select()
    .single();
  if (error) {
    console.error('[Brand] 审核品牌失败:', error.message);
    return { success: false, reason: error.message };
  }

  // P1-11：审核结果站内信通知（失败不影响审核主流程）
  const brandName = before.brand_name || '您的品牌';
  const notifyMap: Record<string, { title: string; content: string }> = {
    approve: {
      title: '品牌入驻审核通过',
      content: `恭喜！品牌「${brandName}」已通过入驻审核，现已正式上线，可前往品牌中心管理推广权益。`,
    },
    reject: {
      title: '品牌入驻审核未通过',
      content: `很抱歉，品牌「${brandName}」未通过入驻审核。原因：${patch.reject_reason}。修正后可重新提交申请。`,
    },
    suspend: {
      title: '品牌已被暂停',
      content: `品牌「${brandName}」已被管理员暂停展示${options.reason ? `，原因：${options.reason}` : ''}。如有疑问请联系平台客服。`,
    },
  };
  const n = notifyMap[action];
  if (n && before.user_id) {
    await createNotification({
      userId: before.user_id,
      type: 'brand',
      title: n.title,
      content: n.content,
      data: {
        reference_id: `brand_review_${brandId}_${nextStatus}_${Date.now()}`,
        brand_id: brandId,
        action,
      },
    });
  }

  return { success: true, brand: data };
}
