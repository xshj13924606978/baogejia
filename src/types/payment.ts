// 支付相关类型定义

/**
 * 支付方式枚举
 */
export enum PaymentMethod {
  WECHAT_JSAPI = 'wechat_jsapi', // 微信公众号支付
  WECHAT_NATIVE = 'wechat_native', // 微信扫码支付
  WECHAT_H5 = 'wechat_h5', // 微信H5支付
  ALIPAY_WEB = 'alipay_web', // 支付宝网页支付
  ALIPAY_H5 = 'alipay_h5', // 支付宝H5支付
  ALIPAY_QR = 'alipay_qr', // 支付宝扫码支付
  POINTS = 'points', // 积分支付
  MIXED = 'mixed', // 混合支付（积分+现金）
}

/**
 * 订单状态枚举
 */
export enum OrderStatus {
  PENDING = 'pending', // 待支付
  PAID = 'paid', // 已支付
  CANCELLED = 'cancelled', // 已取消
  REFUNDING = 'refunding', // 退款中
  REFUNDED = 'refunded', // 已退款
  EXPIRED = 'expired', // 已过期
}

/**
 * 支付状态枚举
 */
export enum PaymentStatus {
  PENDING = 'pending', // 待支付
  PROCESSING = 'processing', // 支付中
  SUCCESS = 'success', // 支付成功
  FAILED = 'failed', // 支付失败
  REFUNDED = 'refunded', // 已退款
  CANCELLED = 'cancelled', // 已取消
}

/**
 * 订单类型
 */
export enum OrderType {
  VIP_MEMBERSHIP = 'vip_membership', // VIP会员
  RANK_BOOST = 'rank_boost', // 排名提升
  GIFT_CARD = 'gift_card', // 礼品卡
  TEMPLATE = 'template', // 模板
  POINTS_PURCHASE = 'points_purchase', // 积分购买
}

/**
 * 退款状态
 */
export enum RefundStatus {
  PENDING = 'pending', // 退款中
  SUCCESS = 'success', // 退款成功
  FAILED = 'failed', // 退款失败
  REJECTED = 'rejected', // 退款拒绝
}

/**
 * 订单接口
 */
export interface Order {
  id: string;
  order_no: string; // 订单号
  user_id: number;
  type: OrderType; // 订单类型
  status: OrderStatus; // 订单状态
  amount: number; // 订单金额（元）
  discount_amount: number; // 优惠金额
  points_used: number; // 使用积分
  final_amount: number; // 实付金额
  payment_method: PaymentMethod; // 支付方式
  payment_status: PaymentStatus; // 支付状态
  payment_time?: Date; // 支付时间
  expire_time: Date; // 过期时间
  created_at: Date; // 创建时间
  updated_at: Date; // 更新时间
  metadata?: Record<string, any>; // 元数据
}

/**
 * 支付记录接口
 */
export interface PaymentRecord {
  id: string;
  order_id: string; // 订单ID
  order_no: string; // 订单号
  user_id: number;
  payment_method: PaymentMethod; // 支付方式
  amount: number; // 支付金额
  status: PaymentStatus; // 支付状态
  transaction_id?: string; // 第三方交易号
  notify_data?: string; // 回调数据
  created_at: Date; // 创建时间
  updated_at: Date; // 更新时间
}

/**
 * 退款记录接口
 */
export interface RefundRecord {
  id: string;
  order_id: string; // 订单ID
  order_no: string; // 订单号
  user_id: number;
  refund_amount: number; // 退款金额
  refund_points: number; // 退回积分
  status: RefundStatus; // 退款状态
  reason?: string; // 退款原因
  transaction_id?: string; // 第三方退款号
  created_at: Date; // 创建时间
  updated_at: Date; // 更新时间
}

/**
 * 创建订单请求
 */
export interface CreateOrderRequest {
  user_id: number;
  type: OrderType;
  item_id: number;
  item_name: string;
  amount: number;
  points_used?: number;
  payment_method: PaymentMethod;
  metadata?: Record<string, any>;
}

/**
 * 创建订单响应
 */
export interface CreateOrderResponse {
  success: boolean;
  order?: Order;
  payment_data?: any; // 支付数据（如支付二维码URL等）
  error?: string;
}

/**
 * 支付请求
 */
export interface PaymentRequest {
  order_id: string;
  payment_method: PaymentMethod;
  openid?: string; // 微信openid（JSAPI支付需要）
  return_url?: string; // 支付成功返回URL
}

/**
 * 支付响应
 */
export interface PaymentResponse {
  success: boolean;
  payment?: {
    payment_url?: string; // 支付URL（H5/扫码支付）
    qr_code?: string; // 二维码内容
    prepay_id?: string; // 预支付ID（JSAPI）
    params?: Record<string, any>; // 其他支付参数
  };
  error?: string;
}

/**
 * 退款请求
 */
export interface RefundRequest {
  order_id: string;
  reason?: string;
}

/**
 * 退款响应
 */
export interface RefundResponse {
  success: boolean;
  refund?: RefundRecord;
  error?: string;
}

/**
 * 微信支付配置
 */
export interface WechatPaymentConfig {
  app_id: string;
  mch_id: string;
  api_key: string;
  api_v3_key?: string;
  cert_path?: string;
  notify_url: string;
}

/**
 * 支付宝支付配置
 */
export interface AlipayPaymentConfig {
  app_id: string;
  private_key: string;
  public_key: string;
  gateway_url: string;
  notify_url: string;
  return_url: string;
}

/**
 * 订单查询响应
 */
export interface OrderQueryResponse {
  success: boolean;
  order?: Order;
  payment?: PaymentRecord;
  error?: string;
}

/**
 * 订单列表响应
 */
export interface OrderListResponse {
  success: boolean;
  orders?: Order[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

/**
 * 支付回调通知
 */
export interface PaymentNotify {
  order_no: string;
  transaction_id: string;
  amount: number;
  payment_time: Date;
  status: PaymentStatus;
  notify_data: string;
  sign?: string;
}
