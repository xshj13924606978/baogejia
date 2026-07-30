// 支付服务层 - 集成微信支付和支付宝支付

import { PaymentMethod, PaymentStatus, PaymentRequest, PaymentResponse, WechatPaymentConfig, AlipayPaymentConfig } from '@/types/payment';

/**
 * 支付服务类
 */
export class PaymentService {
  private wechatConfig: WechatPaymentConfig;
  private alipayConfig: AlipayPaymentConfig;

  constructor() {
    // 从环境变量读取配置
    this.wechatConfig = {
      app_id: process.env.WECHAT_APP_ID || '',
      mch_id: process.env.WECHAT_MCH_ID || '',
      api_key: process.env.WECHAT_API_KEY || '',
      api_v3_key: process.env.WECHAT_API_V3_KEY || '',
      notify_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/payment/wechat/notify`,
    };

    this.alipayConfig = {
      app_id: process.env.ALIPAY_APP_ID || '',
      private_key: process.env.ALIPAY_PRIVATE_KEY || '',
      public_key: process.env.ALIPAY_PUBLIC_KEY || '',
      gateway_url: process.env.ALIPAY_GATEWAY_URL || 'https://openapi.alipay.com/gateway.do',
      notify_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/payment/alipay/notify`,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/payment/result`,
    };
  }

  /**
   * 创建支付
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const { order_id, payment_method, openid, return_url } = request;

    try {
      // 获取订单信息（从订单服务）
      const order = await this.getOrderById(order_id);
      if (!order) {
        return { success: false, error: '订单不存在' };
      }

      // 验证订单状态
      if (order.status !== 'pending') {
        return { success: false, error: '订单状态异常' };
      }

      // 检查订单是否过期
      if (new Date() > new Date(order.expire_time)) {
        return { success: false, error: '订单已过期' };
      }

      // 根据支付方式调用不同的支付接口
      let paymentData: any;

      switch (payment_method) {
        case PaymentMethod.WECHAT_JSAPI:
          paymentData = await this.createWechatJsapiPayment(order, openid);
          break;
        case PaymentMethod.WECHAT_NATIVE:
          paymentData = await this.createWechatNativePayment(order);
          break;
        case PaymentMethod.WECHAT_H5:
          paymentData = await this.createWechatH5Payment(order, return_url);
          break;
        case PaymentMethod.ALIPAY_WEB:
          paymentData = await this.createAlipayWebPayment(order, return_url);
          break;
        case PaymentMethod.ALIPAY_H5:
          paymentData = await this.createAlipayH5Payment(order, return_url);
          break;
        case PaymentMethod.ALIPAY_QR:
          paymentData = await this.createAlipayQrPayment(order);
          break;
        default:
          return { success: false, error: '不支持的支付方式' };
      }

      return {
        success: true,
        payment: paymentData,
      };
    } catch (error) {
      console.error('[PaymentService] 创建支付失败:', error);
      return { success: false, error: '创建支付失败' };
    }
  }

  /**
   * 创建微信JSAPI支付
   */
  private async createWechatJsapiPayment(order: any, openid?: string): Promise<any> {
    // 检查配置
    if (!this.wechatConfig.app_id || !this.wechatConfig.mch_id || !this.wechatConfig.api_key) {
      console.warn('[PaymentService] 微信支付配置缺失，返回模拟数据');
      return this.getMockPaymentData(PaymentMethod.WECHAT_JSAPI, order);
    }

    // TODO: 调用微信支付API
    // 这里需要接入真实的微信支付SDK
    // 使用 wechatpay-node-v3 或类似库


    // 返回模拟数据
    return this.getMockPaymentData(PaymentMethod.WECHAT_JSAPI, order);
  }

  /**
   * 创建微信扫码支付
   */
  private async createWechatNativePayment(order: any): Promise<any> {
    if (!this.wechatConfig.app_id || !this.wechatConfig.mch_id) {
      console.warn('[PaymentService] 微信支付配置缺失，返回模拟数据');
      return this.getMockPaymentData(PaymentMethod.WECHAT_NATIVE, order);
    }


    return this.getMockPaymentData(PaymentMethod.WECHAT_NATIVE, order);
  }

  /**
   * 创建微信H5支付
   */
  private async createWechatH5Payment(order: any, returnUrl?: string): Promise<any> {
    if (!this.wechatConfig.app_id || !this.wechatConfig.mch_id) {
      console.warn('[PaymentService] 微信支付配置缺失，返回模拟数据');
      return this.getMockPaymentData(PaymentMethod.WECHAT_H5, order);
    }


    return this.getMockPaymentData(PaymentMethod.WECHAT_H5, order);
  }

  /**
   * 创建支付宝网页支付
   */
  private async createAlipayWebPayment(order: any, returnUrl?: string): Promise<any> {
    if (!this.alipayConfig.app_id || !this.alipayConfig.private_key) {
      console.warn('[PaymentService] 支付宝配置缺失，返回模拟数据');
      return this.getMockPaymentData(PaymentMethod.ALIPAY_WEB, order);
    }


    return this.getMockPaymentData(PaymentMethod.ALIPAY_WEB, order);
  }

  /**
   * 创建支付宝H5支付
   */
  private async createAlipayH5Payment(order: any, returnUrl?: string): Promise<any> {
    if (!this.alipayConfig.app_id || !this.alipayConfig.private_key) {
      console.warn('[PaymentService] 支付宝配置缺失，返回模拟数据');
      return this.getMockPaymentData(PaymentMethod.ALIPAY_H5, order);
    }


    return this.getMockPaymentData(PaymentMethod.ALIPAY_H5, order);
  }

  /**
   * 创建支付宝扫码支付
   */
  private async createAlipayQrPayment(order: any): Promise<any> {
    if (!this.alipayConfig.app_id || !this.alipayConfig.private_key) {
      console.warn('[PaymentService] 支付宝配置缺失，返回模拟数据');
      return this.getMockPaymentData(PaymentMethod.ALIPAY_QR, order);
    }


    return this.getMockPaymentData(PaymentMethod.ALIPAY_QR, order);
  }

  /**
   * 处理微信支付回调
   */
  async handleWechatNotify(notifyData: any): Promise<boolean> {
    try {
      // 安全检查：未配置真实支付密钥时拒绝所有回调，防止伪造
      if (!this.wechatConfig.api_key || !this.wechatConfig.app_id) {
        console.error('[PaymentService] 微信支付未配置，拒绝处理回调（防止伪造攻击）');
        return false;
      }

      const sign = notifyData.sign;
      const calculatedSign = this.calculateWechatSign(notifyData);

      if (sign !== calculatedSign) {
        console.error('[PaymentService] 微信支付签名验证失败');
        return false;
      }

      // 提取订单信息
      const orderNo = notifyData.out_trade_no;
      const transactionId = notifyData.transaction_id;
      const amount = Number(notifyData.total_fee) / 100; // 分转元

      // 验证金额是有效数字
      if (!orderNo || isNaN(amount) || amount <= 0) {
        console.error('[PaymentService] 微信支付回调参数无效:', { orderNo, amount });
        return false;
      }

      // 更新订单状态
      await this.processPaymentSuccess(orderNo, transactionId, amount, notifyData);

      return true;
    } catch (error) {
      console.error('[PaymentService] 处理微信支付回调失败:', error);
      return false;
    }
  }

  /**
   * 处理支付宝回调
   */
  async handleAlipayNotify(notifyData: any): Promise<boolean> {
    try {
      // 安全检查：未配置真实支付密钥时拒绝所有回调，防止伪造
      if (!this.alipayConfig.private_key || !this.alipayConfig.app_id) {
        console.error('[PaymentService] 支付宝未配置，拒绝处理回调（防止伪造攻击）');
        return false;
      }

      const sign = notifyData.sign;
      const calculatedSign = this.calculateAlipaySign(notifyData);

      if (sign !== calculatedSign) {
        console.error('[PaymentService] 支付宝签名验证失败');
        return false;
      }

      // 提取订单信息
      const orderNo = notifyData.out_trade_no;
      const transactionId = notifyData.trade_no;
      const amount = parseFloat(notifyData.total_amount);

      // 验证金额是有效数字
      if (!orderNo || isNaN(amount) || amount <= 0) {
        console.error('[PaymentService] 支付宝回调参数无效:', { orderNo, amount });
        return false;
      }

      // 更新订单状态
      await this.processPaymentSuccess(orderNo, transactionId, amount, notifyData);

      return true;
    } catch (error) {
      console.error('[PaymentService] 处理支付宝回调失败:', error);
      return false;
    }
  }

  /**
   * 处理支付成功
   */
  private async processPaymentSuccess(
    orderNo: string,
    transactionId: string,
    amount: number,
    _notifyDatanotifyData: any
  ): Promise<void> {
    console.warn('[PaymentService] processPaymentSuccess 被调用但支付回调处理尚未完整实现');
    console.warn(`[PaymentService] 订单号=${orderNo}, 交易号=${transactionId}, 金额=${amount}`);

    // TODO: 完整实现需要以下步骤：
    // 1. 从数据库查询并验证订单（替换 mock getOrderById）
    // 2. 更新订单状态为已支付
    // 3. 记录支付流水
    // 4. 调用 pointsService.rechargePoints() 充值积分
    // 5. 通知用户支付成功
  }

  /**
   * 计算微信支付签名
   */
  private calculateWechatSign(_data: any): string {
    // TODO: 实现微信支付签名算法
    return 'mock_sign';
  }

  /**
   * 计算支付宝签名
   */
  private calculateAlipaySign(_data: any): string {
    // TODO: 实现支付宝签名算法
    return 'mock_sign';
  }

  /**
   * 查询订单
   */
  private async getOrderById(orderId: string): Promise<any> {
    // TODO: 从数据库查询订单
    // 这里需要调用订单服务

    // 返回模拟订单数据
    return {
      id: orderId,
      order_no: `ORDER${Date.now()}`,
      user_id: 1,
      type: 'vip_membership',
      status: 'pending',
      amount: 500,
      discount_amount: 0,
      points_used: 0,
      final_amount: 500,
      payment_method: PaymentMethod.WECHAT_JSAPI,
      payment_status: PaymentStatus.PENDING,
      expire_time: new Date(Date.now() + 30 * 60 * 1000), // 30分钟后过期
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * 获取模拟支付数据
   */
  private getMockPaymentData(method: PaymentMethod, order: any): any {
    const _mockPaymentUrl = `https://example.com/payment/${method}`;

    switch (method) {
      case PaymentMethod.WECHAT_JSAPI:
        return {
          prepay_id: `wx_prepay_${order.order_no}`,
          params: {
            appId: this.wechatConfig.app_id || 'mock_app_id',
            timeStamp: Math.floor(Date.now() / 1000).toString(),
            nonceStr: this.generateNonceStr(),
            package: `prepay_id=wx_prepay_${order.order_no}`,
            signType: 'RSA',
            paySign: 'mock_pay_sign',
          },
        };

      case PaymentMethod.WECHAT_NATIVE:
        return {
          qr_code: `weixin://wxpay/bizpayurl?pr=mock_${order.order_no}`,
        };

      case PaymentMethod.WECHAT_H5:
        return {
          payment_url: `https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?${new URLSearchParams({
            prepay_id: `wx_prepay_${order.order_no}`,
          })}`,
        };

      case PaymentMethod.ALIPAY_WEB:
      case PaymentMethod.ALIPAY_H5:
        return {
          payment_url: `${this.alipayConfig.gateway_url}?${new URLSearchParams({
            app_id: this.alipayConfig.app_id || 'mock_app_id',
            method: 'alipay.trade.page.pay',
            charset: 'utf-8',
            sign_type: 'RSA2',
            timestamp: new Date().toISOString(),
            version: '1.0',
            notify_url: this.alipayConfig.notify_url,
            return_url: this.alipayConfig.return_url,
            biz_content: JSON.stringify({
              out_trade_no: order.order_no,
              product_code:
                method === PaymentMethod.ALIPAY_WEB ? 'FAST_INSTANT_TRADE_PAY' : 'QUICK_WAP_WAY',
              total_amount: order.final_amount.toFixed(2),
              subject: order.metadata?.item_name || '订单支付',
            }),
          })}`,
        };

      case PaymentMethod.ALIPAY_QR:
        return {
          qr_code: `https://qr.alipay.com/mock_${order.order_no}`,
        };

      default:
        return {};
    }
  }

  /**
   * 生成随机字符串
   */
  private generateNonceStr(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// 导出单例
export const paymentService = new PaymentService();
