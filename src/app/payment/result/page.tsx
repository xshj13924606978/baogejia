'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'fail' | 'error'>('loading');
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      const orderNo = searchParams.get('order_no');
      const statusParam = searchParams.get('status');

      // 如果从支付宝同步返回
      if (statusParam === 'success') {
        setStatus('success');
        if (orderNo) {
          await fetchOrder(orderNo);
        }
        return;
      }

      if (statusParam === 'fail') {
        setStatus('fail');
        setError('支付失败，请重试');
        return;
      }

      if (statusParam === 'error') {
        setStatus('error');
        setError('支付过程中发生错误');
        return;
      }

      // 如果没有状态参数，尝试轮询查询订单状态
      if (orderNo) {
        pollOrderStatus(orderNo);
      } else {
        setStatus('error');
        setError('缺少订单信息');
      }
    };

    checkPaymentStatus();

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [searchParams]);

  const fetchOrder = async (orderNo: string) => {
    try {
      const res = await fetch(`/api/orders?user_id=1&status=paid`);
      const data = await res.json();

      if (data.success) {
        const order = data.orders?.find((o: any) => o.order_no === orderNo);
        if (order) {
          setOrder(order);
          return order;
        }
      }
      return null;
    } catch (error) {
      console.error('[PaymentResult] 查询订单失败:', error);
      return null;
    }
  };

  const pollOrderStatus = async (orderNo: string) => {
    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      const order = await fetchOrder(orderNo);

      if (order) {
        setStatus('success');
        setOrder(order);
      } else if (attempts >= maxAttempts) {
        setStatus('fail');
        setError('支付状态查询超时，请稍后查看订单列表');
      } else {
        attempts++;
        pollTimerRef.current = setTimeout(poll, 2000);
      }
    };

    poll();
  };

  const handleContinue = () => {
    router.push('/');
  };

  const handleViewOrders = () => {
    router.push('/profile/orders');
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-16 w-16 text-gray-400 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'fail':
        return <XCircle className="h-16 w-16 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-16 w-16 text-orange-500" />;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'loading':
        return '支付处理中...';
      case 'success':
        return '支付成功！';
      case 'fail':
        return '支付失败';
      case 'error':
        return '支付异常';
    }
  };

  const getStatusDescription = () => {
    switch (status) {
      case 'loading':
        return '正在确认支付结果，请稍候...';
      case 'success':
        return `您已成功支付 ${order?.final_amount || 0} 元`;
      case 'fail':
        return error || '支付失败，请检查您的支付账户余额或稍后重试';
      case 'error':
        return error || '支付过程中发生错误，请联系客服处理';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center pb-8">
            <div className="flex justify-center mb-4">{getStatusIcon()}</div>
            <CardTitle className="text-2xl">{getStatusTitle()}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 状态描述 */}
            <Alert
              variant={status === 'success' ? 'default' : 'destructive'}
              className={status === 'success' ? 'bg-green-50 border-green-200' : ''}
            >
              <AlertDescription className="text-center">{getStatusDescription()}</AlertDescription>
            </Alert>

            {/* 订单详情 */}
            {order && (
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-sm text-gray-500">订单详情</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">订单号</span>
                    <span className="font-medium">{order.order_no}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">商品名称</span>
                    <span className="font-medium">{order.metadata?.item_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">支付金额</span>
                    <span className="font-medium text-orange-600">
                      ¥{order.final_amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">支付方式</span>
                    <span className="font-medium">
                      {order.payment_method === 'wechat_jsapi' && '微信支付'}
                      {order.payment_method === 'alipay_web' && '支付宝'}
                      {order.payment_method === 'alipay_h5' && '支付宝H5'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">支付时间</span>
                    <span className="font-medium">
                      {order.payment_time
                        ? new Date(order.payment_time).toLocaleString('zh-CN')
                        : '-'}
                    </span>
                  </div>
                  {order.metadata?.points_reward > 0 && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-gray-600">获得积分</span>
                      <span className="font-medium text-yellow-600">
                        +{order.metadata.points_reward}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 温馨提示 */}
            {status === 'success' && (
              <Alert>
                <AlertDescription className="text-sm">
                  温馨提示：您的订单已成功支付，权益已生效。如有任何问题，请联系客服处理。
                </AlertDescription>
              </Alert>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleContinue}>
                继续购物
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600"
                onClick={handleViewOrders}
              >
                查看订单
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 底部联系信息 */}
        <div className="text-center mt-6 text-sm text-gray-500">
          如有任何问题，请联系客服
          <br />
          客服电话：400-xxx-xxxx
        </div>
      </div>
    </div>
  );
}

// 用 Suspense 包裹使用 useSearchParams 的组件
export default function PaymentResultPage() {
  return (
    <Suspense fallback={<PaymentResultFallback />}>
      <PaymentResultContent />
    </Suspense>
  );
}

// 加载状态组件
function PaymentResultFallback() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center pb-8">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-16 w-16 text-gray-400 animate-spin" />
            </div>
            <CardTitle className="text-2xl">加载中...</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription className="text-center">
                正在加载支付结果，请稍候...
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

