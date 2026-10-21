/**
 * 积分商城服务
 *
 * 职责：
 * - 商品 CRUD（管理端）
 * - 商品列表/详情（用户端，仅 active）
 * - 积分兑换（points）与现金购买（cash，复用微信 Native 统一下单）
 * - 虚拟商品自动发放 / 实物商品管理员发货
 *
 * #20260831-1600 修复：
 * - P1-7：虚拟商品兑换后**真实发放权益**（vipDays → 会员天数 / rankDays → 品牌置顶天数）
 * - P1-8：实物商品收集并持久化收货地址（mall_exchanges.shipping_address）
 *
 * 关联：
 * - mall_products（商品）
 * - mall_exchanges（兑换记录，含 shipping_address）
 * - pointsService（积分扣减/退还）
 * - src/lib/membership-service.ts（发放会员天数）
 * - src/lib/brand-service.ts（发放品牌置顶天数）
 * - src/lib/wechat-payment.ts（现金购买统一支付）
 */

import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { pointsService } from '@/lib/points-service';
import { isUuidUserId } from '@/lib/withdraw-service';
import { generateOrderNo, unifiedOrder, getWechatPaymentConfig } from '@/lib/wechat-payment';
import { syncOrderFromBusiness } from '@/lib/order-service';
import { attachUserPhone } from '@/lib/user-phone-utils';
import { grantMembershipDays } from '@/lib/membership-service';
import { grantBrandPriorityDays } from '@/lib/brand-service';

export type MallCategory = 'vip' | 'rank' | 'gift' | 'template' | 'physical' | 'custom';

export interface MallProductInput {
  name: string;
  description?: string;
  category: MallCategory;
  points_price?: number;
  cash_price?: number;
  stock?: number;
  image_url?: string;
  is_active?: boolean;
  is_virtual?: boolean;
  sort_order?: number;
  metadata?: Record<string, any>;
}

/** #20260831-1600 P1-8：实物商品收货地址 */
export interface ShippingAddress {
  receiver: string;
  phone: string;
  province: string;
  city: string;
  district?: string;
  detail: string;
  zip_code?: string;
}

/** 收货地址基础校验（服务端强制，前端校验可绕过） */
export function validateShippingAddress(
  addr: Partial<ShippingAddress> | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!addr) return { ok: false, reason: '实物商品需要填写收货地址' };
  const receiver = (addr.receiver || '').trim();
  const phone = (addr.phone || '').trim();
  const province = (addr.province || '').trim();
  const city = (addr.city || '').trim();
  const detail = (addr.detail || '').trim();

  if (!receiver) return { ok: false, reason: '请填写收货人姓名' };
  if (receiver.length > 30) return { ok: false, reason: '收货人姓名过长' };
  if (!/^1[3-9]\d{9}$/.test(phone)) return { ok: false, reason: '收货联系电话格式不正确（11 位手机号）' };
  if (!province) return { ok: false, reason: '请填写省份' };
  if (!city) return { ok: false, reason: '请填写城市' };
  if (!detail) return { ok: false, reason: '请填写详细地址' };
  if (detail.length > 200) return { ok: false, reason: '详细地址过长（最多 200 字）' };
  if (addr.zip_code && !/^\d{6}$/.test(String(addr.zip_code).trim())) {
    return { ok: false, reason: '邮政编码格式不正确（6 位数字）' };
  }
  return { ok: true };
}

/**
 * #20260831-1600 P1-7：发放虚拟商品权益
 *
 * 依据 mall_products.metadata 中的权益键调用**真实**业务服务：
 *   - vipDays  → membership-service.grantMembershipDays()（延长/开通会员）
 *   - rankDays → brand-service.grantBrandPriorityDays()（延长品牌置顶）
 *   - 其他键（templates / code 等）当前无对应权益存储，仅登记到 delivery_info
 *
 * @returns granted 列表与 failed 原因；任一项失败即视为整体失败（调用方退款）
 */
async function grantVirtualBenefit(params: {
  userId: string;
  productName: string;
  category: string;
  metadata: Record<string, any> | null;
}): Promise<{ success: boolean; reason?: string; granted: Array<{ type: string; detail: string }> }> {
  const { userId, productName, category, metadata } = params;
  const granted: Array<{ type: string; detail: string }> = [];
  const source = `积分商城兑换：${productName}`;
  const meta = metadata || {};

  // 1) 会员天数（vip / 会员卡类）
  const vipDays = Number(meta.vipDays ?? meta.vip_days ?? 0);
  if (Number.isFinite(vipDays) && vipDays > 0) {
    const levelCode = typeof meta.levelCode === 'string' ? meta.levelCode : 'vip';
    const result = await grantMembershipDays(userId, Math.floor(vipDays), levelCode, source);
    if (!result.success) {
      return { success: false, reason: `会员权益发放失败：${result.reason}`, granted };
    }
    granted.push({ type: 'membership_days', detail: `会员 +${Math.floor(vipDays)} 天（至 ${result.end_date}）` });
  }

  // 2) 品牌置顶天数（rank / 排名置顶类）
  const rankDays = Number(meta.rankDays ?? meta.rank_days ?? 0);
  if (Number.isFinite(rankDays) && rankDays > 0) {
    const result = await grantBrandPriorityDays(userId, Math.floor(rankDays), source);
    if (!result.success) {
      // 会员已发放时失败 → 回滚困难，这里返回失败原因由调用方退款（会员天数已发但整体判失败）
      return { success: false, reason: `置顶权益发放失败：${result.reason}`, granted };
    }
    granted.push({
      type: 'brand_priority_days',
      detail: `品牌置顶 +${Math.floor(rankDays)} 天（至 ${result.priority_expire_at}）`,
    });
  }

  // 3) 无消费方的权益键：仅登记（明确告知，避免"付了积分没东西"却不自知）
  const unmapped = Object.keys(meta).filter(
    (k) => !['vipDays', 'vip_days', 'rankDays', 'rank_days', 'levelCode'].includes(k)
  );
  if (unmapped.length > 0) {
    console.warn(
      `[Mall] 商品「${productName}」(category=${category}) metadata 存在无消费方的权益键: ${unmapped.join(',')}`
    );
    granted.push({ type: 'unmapped_metadata', detail: `未映射权益键：${unmapped.join(',')}` });
  }

  if (granted.length === 0) {
    // 虚拟商品但无任何可发放权益 → 视为配置缺失，拒绝成交（退还积分）
    return {
      success: false,
      reason: '该虚拟商品未配置可发放的权益（metadata 缺少 vipDays / rankDays），请联系管理员配置',
      granted,
    };
  }

  return { success: true, granted };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 生成兑换单号 */
export function generateExchangeNo(prefix: 'EX' | 'MX'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${ts}${rand}`;
}

/**
 * 原子扣减商品库存（-1 = 无限库存，不扣减）。
 * 使用乐观锁（WHERE stock = 当前值）防并发超卖。
 * #202608292800: 原 097 迁移中的 AFTER UPDATE 触发器因 INSERT 直接
 * completed 不触发、cash 模式 pay_method 条件不满足而失效，改为服务层统一扣减。
 */
async function decrementMallStock(productId: string, quantity: number): Promise<{ success: boolean; reason?: string }> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('mall_products')
    .select('id, stock')
    .eq('id', productId)
    .maybeSingle();
  if (error || !data) return { success: false, reason: '商品不存在' };
  const stock = Number(data.stock ?? -1);
  if (stock === -1) return { success: true }; // 无限库存
  if (stock < quantity) return { success: false, reason: '商品库存不足' };

  const { data: updated, error: updError } = await db
    .from('mall_products')
    .update({ stock: stock - quantity, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('stock', stock) // 乐观锁：并发下仅一方成功
    .select('id')
    .maybeSingle();
  if (updError) return { success: false, reason: updError.message };
  if (!updated) return { success: false, reason: '商品库存不足' };
  return { success: true };
}

/** 回补商品库存（记录创建失败时恢复，防重复回补依赖调用方） */
async function incrementMallStock(productId: string, quantity: number) {
  const db = getSupabaseServiceClient();
  const { data: cur } = await db
    .from('mall_products')
    .select('stock')
    .eq('id', productId)
    .maybeSingle();
  const stock = Number(cur?.stock ?? -1);
  if (stock === -1) return;
  await db
    .from('mall_products')
    .update({ stock: stock + quantity, updated_at: new Date().toISOString() })
    .eq('id', productId);
}

/** 商品列表（用户端仅 active；管理端含全部） */
export async function getMallProducts(options: { includeInactive?: boolean; category?: string } = {}) {
  const db = getSupabaseServiceClient();
  let query = db
    .from('mall_products')
    .select('*');

  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }
  if (options.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) {
    console.error('[Mall] 查询商品失败:', error.message);
    return [];
  }
  return data || [];
}

/** 商品详情 */
export async function getMallProductById(id: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from('mall_products').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[Mall] 查询商品详情失败:', error.message);
    return null;
  }
  return data;
}

/** 创建商品（管理端） */
export async function createMallProduct(input: MallProductInput) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('mall_products')
    .insert({
      name: input.name,
      description: input.description || null,
      category: input.category,
      points_price: input.points_price || 0,
      cash_price: input.cash_price || 0,
      stock: input.stock ?? -1,
      image_url: input.image_url || null,
      is_active: input.is_active ?? true,
      is_virtual: input.is_virtual ?? true,
      sort_order: input.sort_order || 0,
      metadata: input.metadata || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[Mall] 创建商品失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, product: data };
}

/** 更新商品（管理端） */
export async function updateMallProduct(id: string, input: Partial<MallProductInput>) {
  const db = getSupabaseServiceClient();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.points_price !== undefined) patch.points_price = input.points_price;
  if (input.cash_price !== undefined) patch.cash_price = input.cash_price;
  if (input.stock !== undefined) patch.stock = input.stock;
  if (input.image_url !== undefined) patch.image_url = input.image_url;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_virtual !== undefined) patch.is_virtual = input.is_virtual;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const { data, error } = await db.from('mall_products').update(patch).eq('id', id).select().single();
  if (error) {
    console.error('[Mall] 更新商品失败:', error.message);
    return { success: false, reason: error.message };
  }
  return { success: true, product: data };
}

/** 删除商品（管理端） */
export async function deleteMallProduct(id: string) {
  const db = getSupabaseServiceClient();

  // 存在兑换记录时禁止物理删除，改为下架
  const { count: exchangeCount, error: countError } = await db
    .from('mall_exchanges')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', id);
  if (countError) {
    return { success: false, reason: countError.message };
  }

  if ((exchangeCount || 0) > 0) {
    const { data, error } = await db
      .from('mall_products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return { success: false, reason: error.message };
    return { success: true, product: data, softDeleted: true };
  }

  const { error } = await db.from('mall_products').delete().eq('id', id);
  if (error) {
    return { success: false, reason: error.message };
  }
  return { success: true };
}

/**
 * 积分兑换 / 现金购买
 *
 * mode: 'points' | 'cash'
 * points: 扣减积分 → 生成记录 → 虚拟商品自动完成（发放权益）
 * cash:   生成记录(pending) → 调用微信统一下单 → 返回 code_url
 */
export async function exchangeMallProduct(
  userId: string,
  productId: string,
  options: {
    quantity?: number;
    mode?: 'points' | 'cash';
    remark?: string;
    /** #20260831-1600 P1-8：实物商品收货地址 */
    shippingAddress?: Partial<ShippingAddress> | null;
  } = {}
) {
  const quantity = Math.max(1, options.quantity || 1);
  const mode = options.mode || 'points';

  if (!isUuidUserId(userId)) {
    return { success: false, reason: '当前账号未完成正式注册，暂不支持兑换，请先注册并登录' };
  }

  const product = await getMallProductById(productId);
  if (!product) {
    return { success: false, reason: '商品不存在' };
  }
  if (!product.is_active) {
    return { success: false, reason: '商品已下架' };
  }
  if (product.stock !== -1 && product.stock < quantity) {
    return { success: false, reason: '商品库存不足' };
  }

  const db = getSupabaseServiceClient();

  // #20260831-1600 P1-8：实物商品强制收集收货地址（is_virtual=false 或 category=physical）
  const isVirtual = product.is_virtual !== false && product.category !== 'physical';
  if (!isVirtual) {
    const addrCheck = validateShippingAddress(options.shippingAddress);
    if (!addrCheck.ok) {
      return { success: false, reason: addrCheck.reason };
    }
  }

  if (mode === 'points') {
    const pointsPrice = product.points_price || 0;
    if (pointsPrice <= 0) {
      return { success: false, reason: '该商品不支持积分兑换' };
    }
    const totalPoints = pointsPrice * quantity;

    // 扣减积分（原子 + 幂等）
    const exchangeId = crypto.randomUUID();
    const deduct = await pointsService.deductPoints(
      userId,
      totalPoints,
      'mall_exchange',
      `积分商城兑换：${product.name} × ${quantity}`,
      `mall_exchange_${exchangeId}`
    );
    if (!deduct.success) {
      return { success: false, reason: deduct.reason || '积分不足' };
    }

    // 扣减库存（#202608292800：原数据库触发器失效，改为服务层原子扣减）
    const stockResult = await decrementMallStock(productId, quantity);
    if (!stockResult.success) {
      // 库存不足 → 退还积分
      await pointsService.refundPoints(
        userId,
        totalPoints,
        `mall_exchange_${exchangeId}`,
        '库存不足，积分退回'
      );
      return { success: false, reason: stockResult.reason || '商品库存不足' };
    }

    // #20260831-1600 P1-7：虚拟商品先真实发放权益，成功后再落 completed 记录
    let grantInfo: Array<{ type: string; detail: string }> = [];
    if (isVirtual) {
      const grant = await grantVirtualBenefit({
        userId,
        productName: product.name,
        category: product.category,
        metadata: product.metadata,
      });
      if (!grant.success) {
        // 发放失败 → 退还积分 + 回补库存，杜绝「扣了积分没权益」
        await pointsService.refundPoints(
          userId,
          totalPoints,
          `mall_exchange_${exchangeId}`,
          `权益发放失败，积分退回：${grant.reason || ''}`
        );
        await incrementMallStock(productId, quantity);
        console.error('[Mall] 虚拟商品权益发放失败，已退款:', grant.reason);
        return { success: false, reason: grant.reason || '权益发放失败，积分已退回' };
      }
      grantInfo = grant.granted;
    }

    const status = isVirtual ? 'completed' : 'pending';

    const { data, error } = await db
      .from('mall_exchanges')
      .insert({
        id: exchangeId,
        exchange_no: generateExchangeNo('EX'),
        user_id: userId,
        product_id: productId,
        product_name: product.name,
        category: product.category,
        points_used: totalPoints,
        cash_paid: 0,
        quantity,
        pay_method: 'points',
        status,
        delivery_info: isVirtual
          ? {
              type: 'auto',
              granted_at: new Date().toISOString(),
              product_name: product.name,
              metadata: product.metadata,
              // P1-7：真实发放结果留痕，可查询
              granted_benefits: grantInfo,
            }
          : null,
        // P1-8：实物商品落库收货地址
        shipping_address: isVirtual ? null : (options.shippingAddress ?? null),
        remark: options.remark || null,
      })
      .select()
      .single();

    if (error || !data) {
      // 记录创建失败 → 退还积分 + 回补库存
      await pointsService.refundPoints(
        userId,
        totalPoints,
        `mall_exchange_${exchangeId}`,
        '兑换记录创建失败，积分退回'
      );
      await incrementMallStock(productId, quantity);
      console.error('[Mall] 创建兑换记录失败:', error?.message);
      return { success: false, reason: error?.message || '兑换失败' };
    }

    return {
      success: true,
      exchange: data,
      mode,
      autoCompleted: isVirtual,
      grantedBenefits: grantInfo,
    };
  }

  // cash 模式：创建记录 → 微信统一下单
  const cashPrice = Number(product.cash_price || 0);
  if (cashPrice <= 0) {
    return { success: false, reason: '该商品不支持现金购买' };
  }
  const totalCash = Number((cashPrice * quantity).toFixed(2));

  const exchangeId = crypto.randomUUID();
  const exchangeNo = generateExchangeNo('MX');
  const payOrderNo = `MX${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const { data, error } = await db
    .from('mall_exchanges')
    .insert({
      id: exchangeId,
      exchange_no: exchangeNo,
      user_id: userId,
      product_id: productId,
      product_name: product.name,
      category: product.category,
      points_used: 0,
      cash_paid: totalCash,
      quantity,
      pay_method: 'cash',
      pay_order_no: payOrderNo,
      status: 'pending',
      // P1-8：实物商品落库收货地址
      shipping_address: isVirtual ? null : (options.shippingAddress ?? null),
      remark: options.remark || null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[Mall] 创建现金购买记录失败:', error?.message);
    return { success: false, reason: error?.message || '下单失败' };
  }

  // 同步到统一订单表（pending）
  await syncOrderFromBusiness(payOrderNo);

  // 调用微信 Native 统一下单（复用充值支付链路）
  try {
    const payConfig = await getWechatPaymentConfig();
    const payResult = await unifiedOrder({
      description: `积分商城：${product.name} × ${quantity}`,
      outTradeNo: payOrderNo,
      amount: totalCash,
      notifyUrl: payConfig?.notifyUrl || '',
    });
    return { success: true, exchange: data, mode, payOrderNo, codeUrl: payResult.code_url };
  } catch (payError: any) {
    // 下单失败 → 取消记录（保留以便查询），返回错误
    await db
      .from('mall_exchanges')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', exchangeId);
    console.error('[Mall] 微信统一下单失败:', payError?.message || payError);
    return { success: false, reason: '支付下单失败，请稍后重试' };
  }
}

/** 获取用户兑换记录 */
export async function getUserExchanges(userId: string, limit = 50) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('mall_exchanges')
    .select('*, product:mall_products(id, name, image_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[Mall] 查询兑换记录失败:', error.message);
    return [];
  }
  return data || [];
}

/** 管理端兑换列表 */
export async function getAdminExchanges(params: { status?: string; page?: number; pageSize?: number } = {}) {
  const db = getSupabaseServiceClient();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let query = db
    .from('mall_exchanges')
    .select('*, user:users(id, username, email, metadata), product:mall_products(id, name, image_url)', { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[Mall] 查询兑换列表失败:', error.message);
    return { records: [], total: 0, error: error.message };
  }
  // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
  return { records: attachUserPhone(data || []), total: count || 0 };
}

/**
 * 确认发货/发放（管理端）
 * - 虚拟商品（异常未自动完成）→ completed
 * - 实物商品 → shipped
 */
export async function deliverExchange(adminId: string, exchangeId: string, deliveryInfo?: Record<string, any>) {
  const db = getSupabaseServiceClient();
  const { data: record, error: queryError } = await db
    .from('mall_exchanges')
    .select('*')
    .eq('id', exchangeId)
    .maybeSingle();

  if (queryError || !record) {
    return { success: false, reason: '兑换记录不存在' };
  }
  if (record.status !== 'pending' && record.status !== 'completed') {
    return { success: false, reason: `当前状态（${record.status}）不可发货` };
  }

  const isVirtual = record.category !== 'physical';
  const newStatus = isVirtual ? 'completed' : 'shipped';
  // 首次交付判定：重复调用（已 completed/shipped）不再扣减
  const wasDelivered = record.status === 'completed' || record.status === 'shipped';

  // #20260831-1600 P1-8：实物发货必须已有收货地址（兑换时强制收集，此处兜底校验）
  if (!isVirtual) {
    const addr = record.shipping_address;
    if (!addr || !addr.receiver || !addr.phone || !addr.detail) {
      return { success: false, reason: '该订单缺少收货地址，无法发货' };
    }
  }

  // #20260831-1600 P1-7：现金购买的虚拟商品在交付时真实发放权益
  // （积分兑换路径已在 exchangeMallProduct 内发放，此处仅处理 pay_method=cash）
  let grantedBenefits: Array<{ type: string; detail: string }> | null = null;
  if (isVirtual && !wasDelivered && record.pay_method === 'cash') {
    const { data: product } = await db
      .from('mall_products')
      .select('name, category, metadata, is_virtual')
      .eq('id', record.product_id)
      .maybeSingle();

    const grant = await grantVirtualBenefit({
      userId: record.user_id,
      productName: product?.name || record.product_name || '商品',
      category: product?.category || record.category || '',
      metadata: product?.metadata ?? null,
    });
    if (!grant.success) {
      console.error('[Mall] 现金虚拟商品权益发放失败:', grant.reason);
      return { success: false, reason: grant.reason || '权益发放失败，未标记完成' };
    }
    grantedBenefits = grant.granted;
  }

  const { data, error } = await db
    .from('mall_exchanges')
    .update({
      status: newStatus,
      delivery_info: {
        ...(record.delivery_info || {}),
        ...(deliveryInfo || {}),
        ...(grantedBenefits ? { granted_benefits: grantedBenefits } : {}),
        delivered_at: new Date().toISOString(),
        delivered_by: adminId,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', exchangeId)
    .select()
    .single();

  if (error) {
    return { success: false, reason: error.message };
  }

  // #202608292800：现金购买在交付时扣减库存（积分兑换已在兑换时扣减）
  if (record.pay_method === 'cash' && !wasDelivered) {
    const stockResult = await decrementMallStock(record.product_id, record.quantity);
    if (!stockResult.success) {
      console.error(`[Mall] 交付时扣减库存失败: exchange=${exchangeId}, reason=${stockResult.reason}`);
    }
  }

  return { success: true, exchange: data };
}

/** 用户确认收货（实物） */
export async function confirmExchangeReceive(userId: string, exchangeId: string) {
  const db = getSupabaseServiceClient();
  const { data: record, error: queryError } = await db
    .from('mall_exchanges')
    .select('*')
    .eq('id', exchangeId)
    .maybeSingle();

  if (queryError || !record) {
    return { success: false, reason: '兑换记录不存在' };
  }
  if (record.user_id !== userId) {
    return { success: false, reason: '无权操作' };
  }
  if (record.status !== 'shipped') {
    return { success: false, reason: `当前状态（${record.status}）不可确认收货` };
  }

  const { data, error } = await db
    .from('mall_exchanges')
    .update({
      status: 'completed',
      delivery_info: { ...(record.delivery_info || {}), received_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', exchangeId)
    .select()
    .single();

  if (error) return { success: false, reason: error.message };
  return { success: true, exchange: data };
}

/** 导出 generateOrderNo 供现金支付使用（兼容统一订单号前缀） */
export { generateOrderNo };
