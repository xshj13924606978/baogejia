'use client';

// 管理端：订单统计卡片（#202608292700-阶段四：统一订单）
// 数据源：GET /api/admin/orders/stats

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { Loader2, TrendingUp, Wallet, RotateCcw, Receipt } from 'lucide-react';

interface OrderStats {
  total_orders: number;
  total_amount: number;
  paid_orders: number;
  paid_amount: number;
  refunded_orders: number;
  refunded_amount: number;
  by_type: Record<string, { count: number; amount: number }>;
  daily_stats: Array<{ date: string; orders: number; amount: number }>;
  monthly_stats: Array<{ month: string; orders: number; amount: number }>;
}

const TYPE_LABEL: Record<string, string> = {
  recharge: '积分充值',
  mall: '积分商城',
  membership: '会员购买',
  token: 'Token购买',
  brand: '品牌付费',
};

export const OrderStats: React.FC = () => {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/orders/stats', { headers: getClientAuthHeaders() });
        const data = await res.json();
        if (data.success) setStats(data.stats);
      } catch (e) {
        console.error('加载订单统计失败:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> 统计加载中...
      </div>
    );
  }
  if (!stats) return null;

  const cards = [
    { label: '订单总数', value: stats.total_orders, amount: `¥${stats.total_amount.toFixed(2)}`, icon: Receipt, color: 'bg-blue-50 text-blue-600' },
    { label: '已支付订单', value: stats.paid_orders, amount: `¥${stats.paid_amount.toFixed(2)}`, icon: TrendingUp, color: 'bg-green-50 text-green-600' },
    { label: '退款订单', value: stats.refunded_orders, amount: `¥${stats.refunded_amount.toFixed(2)}`, icon: RotateCcw, color: 'bg-red-50 text-red-600' },
    { label: '实收金额', value: '-', amount: `¥${Math.max(0, stats.paid_amount - stats.refunded_amount).toFixed(2)}`, icon: Wallet, color: 'bg-purple-50 text-purple-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`p-1.5 rounded-lg ${card.color}`}>
                  <card.icon className="h-4 w-4" />
                </span>
                <span className="text-xs text-gray-500">{card.label}</span>
              </div>
              <div className="text-xl font-bold">{card.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{card.amount}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 按类型 */}
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">按订单类型</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(TYPE_LABEL).map(([type, label]) => {
              const item = stats.by_type?.[type] || { count: 0, amount: 0 };
              return (
                <div key={type} className="rounded-lg bg-gray-50 p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <div className="text-lg font-bold">{item.count}</div>
                  <div className="text-xs text-gray-400">¥{item.amount.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 月度趋势 */}
      {stats.monthly_stats.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">月度趋势</div>
            <div className="space-y-2">
              {stats.monthly_stats.slice(-6).map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">{m.month}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded"
                      style={{
                        width: `${Math.min(100, (m.amount / Math.max(1, stats.monthly_stats[stats.monthly_stats.length - 1].amount)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-20 text-right">
                    {m.orders}单 / ¥{m.amount.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
