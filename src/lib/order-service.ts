// 订单服务层 - 订单管理（创建/查询/更新/退款）

import {
  Order,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  OrderType,
  CreateOrderRequest,
  RefundRecord,
  RefundStatus,
  RefundRequest,
} from '@/types/payment';

/**
 * 订单服务类
 */
export class OrderService {
  // 内存存储（生产环境应使用数据库）
  private orders: Map<string, Order> = new Map();
  private refunds: Map<string, RefundRecord> = new Map();
  private orderCounter = 1000;

  constructor() {
    // 初始化一些模拟订单
    this.initMockOrders();
  }

  /**
   * 创建订单
   */
  async createOrder(request: CreateOrderRequest): Promise<Order> {
    const {
      user_id,
      type,
      item_id,
      item_name,
      amount,
      points_used = 0,
      payment_method,
      metadata = {},
    } = request;

    // 生成订单号
    const order_no = this.generateOrderNo();

    // 计算优惠（这里简单处理，实际应该根据规则计算）
    const discount_amount = 0;
    const final_amount = amount - discount_amount;

    // 创建订单
    const order: Order = {
      id: this.generateId(),
      order_no,
      user_id,
      type,
      status: OrderStatus.PENDING,
      amount,
      discount_amount,
      points_used,
      final_amount,
      payment_method,
      payment_status: PaymentStatus.PENDING,
      expire_time: new Date(Date.now() + 30 * 60 * 1000), // 30分钟后过期
      created_at: new Date(),
      updated_at: new Date(),
      metadata: {
        item_id,
        item_name,
        ...metadata,
      },
    };

    // 保存订单
    this.orders.set(order.id, order);

    return order;
  }

  /**
   * 根据ID查询订单
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  /**
   * 根据订单号查询订单
   */
  async getOrderByNo(orderNo: string): Promise<Order | null> {
    for (const order of this.orders.values()) {
      if (order.order_no === orderNo) {
        return order;
      }
    }
    return null;
  }

  /**
   * 查询用户订单列表
   */
  async getUserOrders(
    userId: number,
    page: number = 1,
    pageSize: number = 20,
    status?: OrderStatus
  ): Promise<{ orders: Order[]; total: number }> {
    let filteredOrders = Array.from(this.orders.values()).filter(
      (order) => order.user_id === userId
    );

    // 筛选状态
    if (status) {
      filteredOrders = filteredOrders.filter((order) => order.status === status);
    }

    // 按创建时间倒序排序
    filteredOrders.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    // 分页
    const total = filteredOrders.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const orders = filteredOrders.slice(start, end);

    return { orders, total };
  }

  /**
   * 更新订单状态
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    paymentStatus?: PaymentStatus
  ): Promise<Order | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    order.status = status;
    order.updated_at = new Date();

    if (paymentStatus) {
      order.payment_status = paymentStatus;
    }

    // 如果支付成功，记录支付时间
    if (status === OrderStatus.PAID && paymentStatus === PaymentStatus.SUCCESS) {
      order.payment_time = new Date();
    }

    this.orders.set(orderId, order);

    return order;
  }

  /**
   * 支付成功处理
   */
  async handlePaymentSuccess(
    orderNo: string,
    transactionId: string,
    amount: number,
    notifyData?: any
  ): Promise<Order | null> {
    const order = await this.getOrderByNo(orderNo);
    if (!order) {
      console.error(`[OrderService] 订单不存在: 订单号=${orderNo}`);
      return null;
    }

    // 验证金额
    if (Math.abs(order.final_amount - amount) > 0.01) {
      console.error(
        `[OrderService] 金额不匹配: 订单金额=${order.final_amount}, 实际金额=${amount}`
      );
      return null;
    }

    // 更新订单状态
    order.status = OrderStatus.PAID;
    order.payment_status = PaymentStatus.SUCCESS;
    order.payment_time = new Date();
    order.updated_at = new Date();
    order.metadata = {
      ...order.metadata,
      transaction_id: transactionId,
      notify_data: notifyData,
    };

    this.orders.set(order.id, order);


    // TODO: 处理后续业务逻辑
    // - 增加用户积分（如果购买了积分）
    // - 激活会员（如果购买了会员）
    // - 记录日志
    // - 发送通知

    return order;
  }

  /**
   * 申请退款
   */
  async requestRefund(orderId: string, reason?: string): Promise<RefundRecord | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      console.error(`[OrderService] 订单不存在: 订单ID=${orderId}`);
      return null;
    }

    // 验证订单状态
    if (order.status !== OrderStatus.PAID) {
      console.error(`[OrderService] 订单状态不支持退款: 订单状态=${order.status}`);
      return null;
    }

    // 检查是否已有退款记录
    const existingRefund = Array.from(this.refunds.values()).find(
      (r) => r.order_id === orderId && r.status === RefundStatus.PENDING
    );
    if (existingRefund) {
      console.error(`[OrderService] 订单已有退款记录`);
      return null;
    }

    // 创建退款记录
    const refund: RefundRecord = {
      id: this.generateId(),
      order_id: orderId,
      order_no: order.order_no,
      user_id: order.user_id,
      refund_amount: order.final_amount,
      refund_points: order.points_used,
      status: RefundStatus.PENDING,
      reason,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.refunds.set(refund.id, refund);

    // 更新订单状态为退款中
    order.status = OrderStatus.REFUNDING;
    order.updated_at = new Date();
    this.orders.set(orderId, order);


    // TODO: 调用第三方退款接口（微信/支付宝）

    // 标记退款为处理中，避免 setTimeout 未完成时被重复触发
    refund.status = RefundStatus.PROCESSING;
    this.refunds.set(refund.id, refund);

    // 模拟退款成功（生产环境应替换为第三方退款API回调）
    setTimeout(async () => {
      const current = this.refunds.get(refund.id);
      // 幂等性检查：仅在仍为 PROCESSING 时才完成
      if (current && current.status === RefundStatus.PROCESSING) {
        await this.completeRefund(refund.id, 'REFUND_' + order.order_no);
      }
    }, 2000);

    return refund;
  }

  /**
   * 完成退款
   */
  async completeRefund(
    refundId: string,
    transactionId: string,
    success: boolean = true
  ): Promise<RefundRecord | null> {
    const refund = this.refunds.get(refundId);
    if (!refund) {
      return null;
    }

    refund.status = success ? RefundStatus.SUCCESS : RefundStatus.FAILED;
    refund.transaction_id = transactionId;
    refund.updated_at = new Date();
    this.refunds.set(refundId, refund);

    if (success) {
      // 更新订单状态
      const order = this.orders.get(refund.order_id);
      if (order) {
        order.status = OrderStatus.REFUNDED;
        order.updated_at = new Date();
        this.orders.set(order.id, order);


        // TODO: 处理后续业务逻辑
        // - 退回积分
        // - 取消会员权益
        // - 发送通知
      }
    }

    return refund;
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string): Promise<Order | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    // 验证订单状态
    if (order.status !== OrderStatus.PENDING) {
      console.error(`[OrderService] 订单状态不支持取消: 订单状态=${order.status}`);
      return null;
    }

    order.status = OrderStatus.CANCELLED;
    order.payment_status = PaymentStatus.CANCELLED;
    order.updated_at = new Date();
    this.orders.set(orderId, order);

    return order;
  }

  /**
   * 检查并更新过期订单
   */
  async checkExpiredOrders(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const order of this.orders.values()) {
      if (order.status === OrderStatus.PENDING && new Date(order.expire_time) < now) {
        order.status = OrderStatus.EXPIRED;
        order.payment_status = PaymentStatus.CANCELLED;
        order.updated_at = new Date();
        this.orders.set(order.id, order);
        count++;
      }
    }

    if (count > 0) {
    }

    return count;
  }

  /**
   * 获取用户订单统计
   */
  async getUserOrderStats(userId: number): Promise<{
    total: number;
    pending: number;
    paid: number;
    cancelled: number;
    refunded: number;
  }> {
    const userOrders = Array.from(this.orders.values()).filter((order) => order.user_id === userId);

    return {
      total: userOrders.length,
      pending: userOrders.filter((o) => o.status === OrderStatus.PENDING).length,
      paid: userOrders.filter((o) => o.status === OrderStatus.PAID).length,
      cancelled: userOrders.filter((o) => o.status === OrderStatus.CANCELLED).length,
      refunded: userOrders.filter((o) => o.status === OrderStatus.REFUNDED).length,
    };
  }

  /**
   * 生成订单号
   */
  private generateOrderNo(): string {
    this.orderCounter++;
    const timestamp = Date.now().toString();
    const sequence = this.orderCounter.toString().padStart(6, '0');
    return `ORD${timestamp.slice(-8)}${sequence}`;
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化模拟订单
   */
  private initMockOrders(): void {
    const mockOrders: Order[] = [
      {
        id: 'mock-order-1',
        order_no: 'ORD202501010001001',
        user_id: 1,
        type: OrderType.VIP_MEMBERSHIP,
        status: OrderStatus.PAID,
        amount: 500,
        discount_amount: 0,
        points_used: 0,
        final_amount: 500,
        payment_method: PaymentMethod.WECHAT_JSAPI,
        payment_status: PaymentStatus.SUCCESS,
        payment_time: new Date(Date.now() - 86400000),
        expire_time: new Date(Date.now() + 86400000),
        created_at: new Date(Date.now() - 86400000),
        updated_at: new Date(Date.now() - 86400000),
        metadata: {
          item_id: 1,
          item_name: '高级会员月卡',
        },
      },
      {
        id: 'mock-order-2',
        order_no: 'ORD202501020001002',
        user_id: 1,
        type: OrderType.RANK_BOOST,
        status: OrderStatus.PENDING,
        amount: 200,
        discount_amount: 0,
        points_used: 0,
        final_amount: 200,
        payment_method: PaymentMethod.ALIPAY_WEB,
        payment_status: PaymentStatus.PENDING,
        expire_time: new Date(Date.now() + 30 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          item_id: 2,
          item_name: '排名体验卡',
        },
      },
    ];

    mockOrders.forEach((order) => {
      this.orders.set(order.id, order);
    });

  }
}

// 导出单例
export const orderService = new OrderService();
