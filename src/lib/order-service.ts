// ============================================================
// 订单服务层 - 统一订单（阶段四 #202608292700-统一订单与后台管理）
//
// 职责：
// - syncOrderFromBusiness：从各业务订单表（recharge_orders/mall_exchanges/
//   user_memberships/token_purchases/brand_payments）读取最新状态，
//   upsert 到 unified_orders（ON CONFLICT order_no 幂等）
// - 用户端：我的订单列表/详情/统计
// - 管理端：全量订单列表/详情/统计/退款/导出
// - 兼容旧内存版 API 方法名（getOrderByNo/handlePaymentSuccess/cancelOrder 等），
//   供旧 payment-service.ts 编译运行（返回 any，底层已改为数据库）
//
// 订单号前缀约定（与各业务模块一致）：
//   RC=充值, MX=商城, MB=会员, TK=Token, BP=品牌
// ============================================================

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { attachUserPhone, attachUserPhoneOne } from '@/lib/user-phone-utils';

/** 订单类型中文名 */
export const ORDER_TYPE_LABEL: Record<string, string> = {
  recharge: '积分充值',
  mall: '积分商城',
  membership: '会员购买',
  token: 'Token购买',
  brand: '品牌付费',
};

/** 订单状态中文名 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款',
  failed: '支付失败',
};

/** 业务订单号前缀 → 业务表/类型映射 */
const BUSINESS_PREFIX_MAP: Record<string, { table: string; orderType: string }> = {
  RC: { table: 'recharge_orders', orderType: 'recharge' },
  MX: { table: 'mall_exchanges', orderType: 'mall' },
  MB: { table: 'user_memberships', orderType: 'membership' },
  TK: { table: 'token_purchases', orderType: 'token' },
  BP: { table: 'brand_payments', orderType: 'brand' },
};

/** 业务表状态 → unified_orders 状态 */
function mapBusinessStatus(status?: string | null): string {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'pending':
      return 'pending';
    case 'active':
    case 'shipped':
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'expired':
    case 'failed':
      return s === 'failed' ? 'failed' : 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'refunding':
      return 'refunding';
    default:
      return 'pending';
  }
}

/** 生成统一订单号（保留前缀） */
function makeOrderNo(): string {
  return `UO${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** 从业务表读取订单信息 → 构造 unified_orders 行（各业务表字段差异在此归一化） */
async function buildUnifiedRecord(
  db: any,
  orderNo: string,
  extra?: { paymentId?: string; paidAt?: string }
): Promise<Record<string, any> | null> {
  const prefix = orderNo.slice(0, 2).toUpperCase();
  const mapping = BUSINESS_PREFIX_MAP[prefix];
  if (!mapping) return null;

  // 商城现金购买订单号存于 pay_order_no 列（积分兑换无支付订单号，不参与同步）
  const orderColumn = mapping.orderType === 'mall' ? 'pay_order_no' : 'order_no';
  const { data: biz, error } = await db
    .from(mapping.table)
    .select('*')
    .eq(orderColumn, orderNo)
    .maybeSingle();
  if (error || !biz) return null;

  let amount = 0;
  let metadata: Record<string, any> = {};
  let paymentId: string | null = null;
  let paidAt: string | null = null;

  switch (mapping.orderType) {
    case 'recharge':
      amount = Number(biz.amount || 0);
      metadata = { plan_id: biz.plan_id, points: Number(biz.points || 0) };
      paymentId = biz.transaction_id || null;
      paidAt = biz.paid_at || null;
      break;
    case 'mall':
      amount = Number(biz.cash_paid || 0);
      metadata = {
        product_id: biz.product_id,
        product_name: biz.product_name,
        quantity: Number(biz.quantity || 1),
        category: biz.category,
      };
      paymentId = biz.delivery_info?.payment_tx_id || null;
      paidAt = biz.delivery_info?.paid_at || null;
      break;
    case 'membership': {
      // user_memberships 未存金额，联查 membership_plans 价格
      const { data: plan } = await db
        .from('membership_plans')
        .select('name, price, duration_days')
        .eq('id', biz.plan_id)
        .maybeSingle();
      amount = Number(plan?.price || 0);
      metadata = {
        plan_id: biz.plan_id,
        plan_name: plan?.name || '',
        level_code: biz.level_code,
        duration_days: Number(plan?.duration_days || 0),
      };
      break;
    }
    case 'token':
      amount = Number(biz.price || 0);
      metadata = {
        package_id: biz.package_id,
        token_amount: Number(biz.token_amount || 0),
        bonus_token: Number(biz.bonus_token || 0),
        total_token: Number(biz.total_token || 0),
      };
      paidAt = biz.completed_at || null;
      break;
    case 'brand':
      amount = Number(biz.amount || 0);
      metadata = {
        brand_id: biz.brand_id,
        package_id: biz.package_id,
        priority_level: Number(biz.priority_level || 0),
        duration_days: Number(biz.duration_days || 0),
        boost_score: Number(biz.boost_score || 0),
        match_boost: Number(biz.match_boost || 0),
        is_verified: !!biz.is_verified,
      };
      paidAt = biz.completed_at || biz.start_date || null;
      break;
  }

  return {
    order_no: orderNo,
    user_id: biz.user_id,
    order_type: mapping.orderType,
    amount,
    business_id: biz.id,
    business_type: mapping.table,
    status: mapBusinessStatus(biz.status),
    payment_id: extra?.paymentId || paymentId,
    paid_at: extra?.paidAt || paidAt || null,
    metadata,
    remark: biz.remark || null,
    expired_at: biz.expires_at || null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * 同步业务订单到 unified_orders（幂等，核心收口函数）
 * 下单时调用 → 创建 pending 记录；支付回调时调用 → 更新为完成状态。
 */
export async function syncOrderFromBusiness(orderNo: string, extra?: { paymentId?: string; paidAt?: string }) {
  if (!orderNo) return null;
  const db = getSupabaseServiceClient();
  const record = await buildUnifiedRecord(db, orderNo, extra);
  if (!record) return null;

  const { data, error } = await db
    .from('unified_orders')
    .upsert(record, { onConflict: 'order_no' })
    .select()
    .single();
  if (error) {
    console.error(`[OrderService] 同步订单失败: order=${orderNo}:`, error.message);
    return null;
  }
  return data;
}

export class OrderService {
  // ==================== 兼容旧内存版 API（底层为数据库） ====================

  /** 按 unified_orders.id 查询（兼容旧调用） */
  async getOrderById(orderId: string): Promise<any | null> {
    if (!orderId) return null;
    const db = getSupabaseServiceClient();
    const { data, error } = await db.from('unified_orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !data) return null;
    return data;
  }

  /** 按订单号查询（兼容旧调用） */
  async getOrderByNo(orderNo: string): Promise<any | null> {
    if (!orderNo) return null;
    const db = getSupabaseServiceClient();
    const { data, error } = await db.from('unified_orders').select('*').eq('order_no', orderNo).maybeSingle();
    if (error || !data) return null;
    return data;
  }

  /** 创建订单（兼容旧签名；新交易走 syncOrderFromBusiness） */
  async createOrder(request: any): Promise<any | null> {
    const {
      user_id,
      type,
      item_name,
      amount,
      points_used = 0,
      payment_method,
      metadata = {},
    } = request || {};
    if (!user_id || !amount) return null;

    const orderTypeMap: Record<string, string> = {
      points_purchase: 'recharge',
      recharge: 'recharge',
      vip_membership: 'membership',
      rank_boost: 'brand',
      token: 'token',
      mall: 'mall',
    };
    const orderNo = makeOrderNo();
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('unified_orders')
      .insert({
        order_no: orderNo,
        user_id,
        order_type: orderTypeMap[type] || 'recharge',
        amount,
        payment_method: payment_method === 'alipay' ? 'alipay' : 'wechat',
        status: 'pending',
        metadata: { ...metadata, item_name },
        remark: item_name ? `${item_name}（含积分 ${points_used}）` : null,
        expired_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (error || !data) {
      console.error('[OrderService] 创建订单失败:', error?.message);
      return null;
    }
    return data;
  }

  /** 支付成功处理（兼容旧调用） */
  async handlePaymentSuccess(
    orderNo: string,
    transactionId: string,
    _amount: number,
    _notifyData?: any
  ): Promise<any | null> {
    const db = getSupabaseServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('unified_orders')
      .update({
        status: 'completed',
        paid_at: now,
        payment_id: transactionId,
        updated_at: now,
      })
      .eq('order_no', orderNo)
      .select()
      .maybeSingle();
    if (error || !data) return null;
    return data;
  }

  /** 用户订单列表（兼容旧签名） */
  async getUserOrders(userId: number | string, page = 1, pageSize = 20, status?: string): Promise<{ orders: any[]; total: number }> {
    const uid = String(userId);
    const db = getSupabaseServiceClient();
    let query = db.from('unified_orders').select('*', { count: 'exact' }).eq('user_id', uid);
    if (status) query = query.eq('status', status);
    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return { orders: [], total: 0 };
    return { orders: data || [], total: count || 0 };
  }

  /** 取消订单（兼容旧调用） */
  async cancelOrder(orderId: string): Promise<any | null> {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('unified_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (error || !data) return null;
    return data;
  }

  /** 过期订单检查（兼容旧调用；统一订单以各业务表 expires_at 惰性处理） */
  async checkExpiredOrders(): Promise<number> {
    return 0;
  }

  /** 用户订单统计（兼容旧调用） */
  async getUserOrderStats(userId: number | string): Promise<{ total: number; pending: number; paid: number; cancelled: number; refunded: number }> {
    const uid = String(userId);
    const db = getSupabaseServiceClient();
    const { data } = await db.from('unified_orders').select('status').eq('user_id', uid);
    const orders = data || [];
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      paid: orders.filter((o) => o.status === 'paid' || o.status === 'completed').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      refunded: orders.filter((o) => o.status === 'refunded').length,
    };
  }

  // ==================== 阶段四：统一订单 API ====================

  /**
   * 用户端我的订单列表
   * options: { orderType?, status?, keyword?, page?, pageSize? }
   */
  async getUserOrderList(
    userId: string,
    options: { orderType?: string; status?: string; keyword?: string; page?: number; pageSize?: number } = {}
  ): Promise<{ orders: any[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const db = getSupabaseServiceClient();

    let query = db
      .from('unified_orders')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (options.orderType && options.orderType !== 'all') {
      query = query.eq('order_type', options.orderType);
    }
    if (options.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options.keyword) {
      query = query.or(`order_no.ilike.%${options.keyword}%`);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      console.error('[OrderService] 用户订单列表查询失败:', error.message);
      return { orders: [], total: 0 };
    }
    return { orders: data || [], total: count || 0 };
  }

  /** 订单详情（用户端：仅限本人；管理端：不限） */
  async getOrderDetail(orderNo: string, options: { userId?: string; asAdmin?: boolean } = {}): Promise<any | null> {
    const db = getSupabaseServiceClient();
    let query = db
      .from('unified_orders')
      .select('*, user:users(id, username, email, metadata)')
      .eq('order_no', orderNo);
    if (!options.asAdmin && options.userId) {
      query = query.eq('user_id', options.userId);
    }
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return attachUserPhoneOne(data);
  }

  /** 管理端订单列表（筛选/搜索/分页） */
  async getAdminOrders(options: {
    orderType?: string;
    status?: string;
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ orders: any[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const db = getSupabaseServiceClient();

    let query = db
      .from('unified_orders')
      .select('*, user:users(id, username, email, metadata)', { count: 'exact' });

    if (options.orderType && options.orderType !== 'all') {
      query = query.eq('order_type', options.orderType);
    }
    if (options.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options.keyword) {
      // 用户信息模糊匹配（先查 users 表拿 id 列表，避免嵌套资源 or 语法兼容性问题）
      // users 无顶层 phone 列，手机号存 metadata->>phone（jsonb），需单独过滤后合并
      const [emailNameRes, phoneRes] = await Promise.all([
        db
          .from('users')
          .select('id')
          .or(`email.ilike.%${options.keyword}%,username.ilike.%${options.keyword}%`)
          .limit(200),
        db
          .from('users')
          .select('id')
          .ilike('metadata->>phone', `%${options.keyword}%`)
          .limit(200),
      ]);
      const userIds = Array.from(
        new Set([...(emailNameRes.data || []), ...(phoneRes.data || [])].map((u: any) => u.id))
      );
      if (userIds.length > 0) {
        // 订单号 或 用户ID 命中
        query = query.or(`order_no.ilike.%${options.keyword}%,user_id.in.(${userIds.join(',')})`);
      } else {
        query = query.or(`order_no.ilike.%${options.keyword}%`);
      }
    }
    if (options.dateFrom) {
      query = query.gte('created_at', options.dateFrom);
    }
    if (options.dateTo) {
      query = query.lte('created_at', options.dateTo);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      console.error('[OrderService] 管理端订单列表查询失败:', error.message);
      return { orders: [], total: 0 };
    }
    return { orders: attachUserPhone(data || []), total: count || 0 };
  }

  /**
   * 订单统计
   * 返回：汇总 + 按类型 + 日/月趋势
   */
  async getOrderStats(options: { dateFrom?: string; dateTo?: string } = {}): Promise<any> {
    const db = getSupabaseServiceClient();
    let query = db.from('unified_orders').select('*');
    if (options.dateFrom) query = query.gte('created_at', options.dateFrom);
    if (options.dateTo) query = query.lte('created_at', options.dateTo);

    const { data, error } = await query;
    const orders = data || [];
    if (error) {
      console.error('[OrderService] 订单统计查询失败:', error.message);
    }

    const types = ['recharge', 'mall', 'membership', 'token', 'brand'];
    const byType: Record<string, { count: number; amount: number }> = {};
    for (const t of types) byType[t] = { count: 0, amount: 0 };

    const dailyMap = new Map<string, { orders: number; amount: number }>();
    const monthlyMap = new Map<string, { orders: number; amount: number }>();

    let totalAmount = 0;
    let paidOrders = 0;
    let paidAmount = 0;
    let refundedOrders = 0;
    let refundedAmount = 0;

    for (const o of orders) {
      const amount = Number(o.amount || 0);
      totalAmount += amount;
      const type = byType[o.order_type] ? o.order_type : 'recharge';
      byType[type].count += 1;
      byType[type].amount += amount;

      if (o.status === 'paid' || o.status === 'completed') {
        paidOrders += 1;
        paidAmount += amount;
      }
      if (o.status === 'refunded') {
        refundedOrders += 1;
        refundedAmount += amount;
      }

      const d = new Date(o.created_at);
      const dayKey = d.toISOString().slice(0, 10);
      const monthKey = d.toISOString().slice(0, 7);
      const daily = dailyMap.get(dayKey) || { orders: 0, amount: 0 };
      daily.orders += 1;
      daily.amount += amount;
      dailyMap.set(dayKey, daily);
      const monthly = monthlyMap.get(monthKey) || { orders: 0, amount: 0 };
      monthly.orders += 1;
      monthly.amount += amount;
      monthlyMap.set(monthKey, monthly);
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const monthlyStats = Array.from(monthlyMap.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      total_orders: orders.length,
      total_amount: Math.round(totalAmount * 100) / 100,
      paid_orders: paidOrders,
      paid_amount: Math.round(paidAmount * 100) / 100,
      refunded_orders: refundedOrders,
      refunded_amount: Math.round(refundedAmount * 100) / 100,
      by_type: byType,
      daily_stats: dailyStats,
      monthly_stats: monthlyStats,
    };
  }

  /** 退款（管理端）：标记 unified_orders 为 refunded，并同步业务表状态 */
  async refundOrder(orderNo: string, reason: string, operatorId: string): Promise<{ success: boolean; reason?: string }> {
    const db = getSupabaseServiceClient();
    const { data: order, error: qErr } = await db
      .from('unified_orders')
      .select('*')
      .eq('order_no', orderNo)
      .maybeSingle();
    if (qErr) return { success: false, reason: qErr.message };
    if (!order) return { success: false, reason: '订单不存在' };
    if (order.status === 'refunded') return { success: false, reason: '订单已退款' };
    if (order.status !== 'completed' && order.status !== 'paid') {
      return { success: false, reason: '仅已完成订单可退款' };
    }

    const now = new Date().toISOString();
    const remark = order.remark
      ? `${order.remark}（退款：${reason}，操作人：${operatorId}）`
      : `退款：${reason}（操作人：${operatorId}）`;

    const { error: uErr } = await db
      .from('unified_orders')
      .update({ status: 'refunded', remark, updated_at: now })
      .eq('id', order.id);
    if (uErr) return { success: false, reason: uErr.message };

    // 同步业务表状态（尽力而为，失败不阻断主流程）
    try {
      const mapping = BUSINESS_PREFIX_MAP[orderNo.slice(0, 2).toUpperCase()];
      if (mapping) {
        const orderColumn = mapping.orderType === 'mall' ? 'pay_order_no' : 'order_no';
        await db
          .from(mapping.table)
          .update({ status: 'refunded', updated_at: now })
          .eq(orderColumn, orderNo);
      }
    } catch (e) {
      console.warn('[OrderService] 退款同步业务表失败:', e);
    }

    return { success: true };
  }

  /** 管理端导出订单（CSV 行数组） */
  async getOrdersForExport(options: { orderType?: string; status?: string; dateFrom?: string; dateTo?: string } = {}): Promise<any[]> {
    const db = getSupabaseServiceClient();
    let query = db
      .from('unified_orders')
      .select('*, user:users(id, username, email, metadata)')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (options.orderType && options.orderType !== 'all') query = query.eq('order_type', options.orderType);
    if (options.status && options.status !== 'all') query = query.eq('status', options.status);
    if (options.dateFrom) query = query.gte('created_at', options.dateFrom);
    if (options.dateTo) query = query.lte('created_at', options.dateTo);

    const { data, error } = await query;
    if (error) {
      console.error('[OrderService] 导出订单失败:', error.message);
      return [];
    }
    return attachUserPhone(data || []);
  }

  /** 主动同步一批业务订单到 unified_orders（供后台对账/补数据） */
  async syncManyOrderNos(orderNos: string[]): Promise<number> {
    let synced = 0;
    for (const no of orderNos) {
      const r = await syncOrderFromBusiness(no);
      if (r) synced += 1;
    }
    return synced;
  }
}

// 导出单例（兼容旧调用方：payment-service.ts 等）
export const orderService = new OrderService();
