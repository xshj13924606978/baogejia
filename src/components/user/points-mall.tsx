'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import PaymentDialog from '@/components/payment-dialog';
import { PaymentMethod, OrderType } from '@/types/payment';

interface PointsMallProps {
  user: any;
}

interface MallItem {
  id: number;
  name: string;
  desc: string;
  points: number;
  price?: number; // 现金价格（元）
  icon: string;
  color: string;
  type: 'vip' | 'rank' | 'gift' | 'template';
}

export default function PointsMall({ user }: PointsMallProps) {
  const [exchanging, setExchanging] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MallItem | null>(null);

  const items: MallItem[] = [
    {
      id: 1,
      name: '高级会员月卡',
      desc: '无限次使用、无水印导出、专属客服',
      points: 500,
      price: 29.9, // 现金价格
      icon: '💎',
      color: 'purple',
      type: 'vip',
    },
    {
      id: 2,
      name: '排名体验卡',
      desc: '厂家排名置顶1天，提升产品曝光',
      points: 200,
      price: 12.9,
      icon: '📈',
      color: 'green',
      type: 'rank',
    },
    {
      id: 3,
      name: '京东礼品卡',
      desc: '50元京东E卡，全场通用',
      points: 1000,
      price: 45,
      icon: '🎁',
      color: 'red',
      type: 'gift',
    },
    {
      id: 4,
      name: '专业方案模板',
      desc: '10套精品报价方案模板，直接可用',
      points: 100,
      price: 9.9,
      icon: '📄',
      color: 'blue',
      type: 'template',
    },
    {
      id: 5,
      name: '高级会员年卡',
      desc: '无限次使用一年，立省500积分',
      points: 5000,
      price: 299,
      icon: '👑',
      color: 'purple',
      type: 'vip',
    },
    {
      id: 6,
      name: '排名体验周卡',
      desc: '厂家排名置顶7天，稳定曝光',
      points: 1200,
      price: 79.9,
      icon: '🚀',
      color: 'green',
      type: 'rank',
    },
    {
      id: 7,
      name: '积分充值包',
      desc: '充值1000积分，享超值优惠',
      points: 1000,
      price: 88,
      icon: '🪙',
      color: 'yellow',
      type: 'gift',
    },
    {
      id: 8,
      name: '积分充值包（大）',
      desc: '充值5000积分，专享8折优惠',
      points: 5000,
      price: 398,
      icon: '💰',
      color: 'yellow',
      type: 'gift',
    },
  ];

  const handleExchangeByPoints = async (item: MallItem) => {
    if (user.points < item.points) {
      setMessage({
        type: 'error',
        text: `积分不足，还差 ${item.points - user.points} 积分`,
      });
      return;
    }

    try {
      setExchanging(item.id);
      setMessage(null);

      const res = await fetch('/api/points/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          item_id: item.id,
          item_type: item.type,
          item_name: item.name,
          points_cost: item.points,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `兑换成功！消耗 ${item.points} 积分`,
        });
        // 刷新用户信息
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setMessage({
          type: 'error',
          text: data.error || '兑换失败',
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: '网络错误，请重试',
      });
    } finally {
      setExchanging(null);
    }
  };

  const handlePayByMoney = async (item: MallItem) => {
    setSelectedItem(item);
    setPaymentDialogOpen(true);
  };

  const handlePaymentConfirm = async (paymentMethod: PaymentMethod) => {
    if (!selectedItem) return;

    try {
      // 1. 创建订单
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          type: getOrderType(selectedItem.type),
          item_id: selectedItem.id,
          item_name: selectedItem.name,
          amount: selectedItem.price,
          payment_method: paymentMethod,
          metadata: {
            points_reward: selectedItem.type === 'gift' ? selectedItem.points : 0,
          },
        }),
      });

      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error(orderData.error || '创建订单失败');
      }

      // 2. 创建支付
      const paymentRes = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderData.order.id,
          payment_method: paymentMethod,
          return_url: `${window.location.origin}/payment/result`,
        }),
      });

      const paymentData = await paymentRes.json();

      if (!paymentData.success) {
        throw new Error(paymentData.error || '创建支付失败');
      }

      // 3. 跳转支付
      if (paymentData.payment?.payment_url) {
        window.location.href = paymentData.payment.payment_url;
      } else if (paymentData.payment?.qr_code) {
        // 显示二维码
        alert(`请扫描二维码支付：${paymentData.payment.qr_code}`);
      } else {
        throw new Error('支付方式不支持');
      }
    } catch (error: any) {
      throw error;
    }
  };

  const getOrderType = (type: string): OrderType => {
    const typeMap: Record<string, OrderType> = {
      vip: OrderType.VIP_MEMBERSHIP,
      rank: OrderType.RANK_BOOST,
      gift: OrderType.GIFT_CARD,
      template: OrderType.TEMPLATE,
    };
    return typeMap[type] || OrderType.VIP_MEMBERSHIP;
  };

  return (
    <div className="space-y-4">
      {/* 当前积分 */}
      <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-yellow-600">可用积分</div>
              <div className="text-3xl font-bold text-yellow-700">{user.points}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-orange-600">累计获得</div>
              <div className="text-lg font-bold text-orange-700">{user.total_points || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 兑换提示 */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* 商品列表 */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3 pr-2">
          {items.map((item) => {
            const canAffordByPoints = user.points >= item.points;

            return (
              <Card key={item.id} className="hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{item.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-base">{item.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{item.desc}</div>
                        </div>
                        <Badge className={`bg-${item.color}-100 text-${item.color}-700`}>
                          {item.type === 'vip' && '会员'}
                          {item.type === 'rank' && '推广'}
                          {item.type === 'gift' && '礼品'}
                          {item.type === 'template' && '模板'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xl font-bold text-${item.color}-600`}>
                            {item.price ? `¥${item.price}` : `${item.points}积分`}
                          </span>
                          {item.price && (
                            <span className="text-xs text-gray-400 line-through">
                              {item.points}积分
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {canAffordByPoints && (
                            <Button
                              onClick={() => handleExchangeByPoints(item)}
                              disabled={exchanging === item.id}
                              size="sm"
                              variant="outline"
                              className="border-orange-500 text-orange-600 hover:bg-orange-50"
                            >
                              {exchanging === item.id ? '兑换中...' : '积分兑换'}
                            </Button>
                          )}
                          {item.price && (
                            <Button
                              onClick={() => handlePayByMoney(item)}
                              disabled={exchanging === item.id}
                              className={`bg-${item.color}-500 hover:bg-${item.color}-600`}
                              size="sm"
                            >
                              立即支付
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* 支付弹窗 */}
      {selectedItem && (
        <PaymentDialog
          open={paymentDialogOpen}
          onClose={() => {
            setPaymentDialogOpen(false);
            setSelectedItem(null);
          }}
          item={selectedItem}
          user={user}
          onConfirm={handlePaymentConfirm}
        />
      )}
    </div>
  );
}
