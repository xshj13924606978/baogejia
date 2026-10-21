'use client';

// 用户端订单详情（#202608292700-阶段四：统一订单）
// 展示 unified_orders 单条记录：金额/状态/支付信息/业务元数据

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

interface OrderDetailProps {
  orderNo: string;
  onBack: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  recharge: 'bg-blue-100 text-blue-700',
  mall: 'bg-orange-100 text-orange-700',
  membership: 'bg-purple-100 text-purple-700',
  token: 'bg-yellow-100 text-yellow-700',
  brand: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunding: 'bg-orange-100 text-orange-700',
  refunded: 'bg-red-100 text-red-600',
  failed: 'bg-red-100 text-red-600',
};

/** 根据业务元数据渲染可读信息 */
function renderMetadata(order: any): { label: string; value: string }[] {
  const meta = order.metadata || {};
  const type = order.order_type;
  switch (type) {
    case 'recharge':
      return [
        { label: '充值积分', value: `${meta.points ?? '-'} 积分` },
        { label: '兑换比例', value: meta.plan_id ? `套餐 ${meta.plan_id}` : '-' },
      ];
    case 'mall':
      return [
        { label: '商品', value: meta.product_name || '-' },
        { label: '数量', value: `× ${meta.quantity ?? 1}` },
        { label: '分类', value: meta.category || '-' },
      ];
    case 'membership':
      return [
        { label: '套餐', value: meta.plan_name || meta.level_code || '-' },
        { label: '等级', value: meta.level_code || '-' },
        { label: '有效期', value: meta.duration_days ? `${meta.duration_days} 天` : '-' },
      ];
    case 'token':
      return [
        { label: 'Token 数量', value: `${meta.token_amount ?? 0}` },
        { label: '赠送', value: `+${meta.bonus_token ?? 0}` },
        { label: '到账合计', value: `${meta.total_token ?? 0} Tokens` },
      ];
    case 'brand':
      return [
        { label: '推广等级', value: meta.priority_level ? `L${meta.priority_level}` : '-' },
        { label: '有效期', value: meta.duration_days ? `${meta.duration_days} 天` : '-' },
        { label: '认证标识', value: meta.is_verified ? '包含' : '不包含' },
      ];
    default:
      return [];
  }
}

export default function OrderDetail({ orderNo, onBack }: OrderDetailProps) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderNo}`);
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.success) {
          setError(data.error || '加载失败');
          return;
        }
        setOrder(data.order);
      } catch (e) {
        if (mounted) setError('加载失败，请重试');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [orderNo]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回列表
        </Button>
        <h3 className="font-bold text-base">订单详情</h3>
      </div>

      {loading && <div className="py-12 text-center text-sm text-gray-500">加载中...</div>}
      {error && <div className="py-12 text-center text-sm text-red-500">{error}</div>}

      {order && (
        <div className="space-y-4 text-sm">
          {/* 状态卡片 */}
          <div className="rounded-xl border p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[order.order_type] || 'bg-gray-100'}`}>
                {order.order_type_label}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100'}`}>
                {order.status_label}
              </span>
            </div>
            <div className="text-2xl font-bold">¥{Number(order.amount || 0).toFixed(2)}</div>
            <div className="text-xs text-gray-500 mt-1">订单号：{order.order_no}</div>
          </div>

          {/* 明细 */}
          <div className="rounded-xl border divide-y">
            {renderMetadata(order).map((row) => (
              <div key={row.label} className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-500">支付方式</span>
              <span className="font-medium">
                {order.payment_method === 'wechat' ? '微信支付' : order.payment_method === 'alipay' ? '支付宝' : order.payment_method || '-'}
              </span>
            </div>
            {order.payment_id && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">支付流水号</span>
                <span className="font-medium break-all max-w-[180px] text-right">{order.payment_id}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-500">下单时间</span>
              <span className="font-medium">{order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '-'}</span>
            </div>
            {order.paid_at && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">支付时间</span>
                <span className="font-medium">{new Date(order.paid_at).toLocaleString('zh-CN')}</span>
              </div>
            )}
            {order.expired_at && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">过期时间</span>
                <span className="font-medium">{new Date(order.expired_at).toLocaleString('zh-CN')}</span>
              </div>
            )}
          </div>

          {order.remark && (
            <div className="rounded-xl border p-4">
              <div className="text-gray-500 mb-1">备注</div>
              <div>{order.remark}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
