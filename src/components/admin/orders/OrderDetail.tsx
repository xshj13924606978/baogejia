'use client';

// 管理端：订单详情弹窗（#202608292700-阶段四：统一订单）
// GET /api/admin/orders/[orderNo]

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { Loader2 } from 'lucide-react';

interface OrderDetailProps {
  orderNo: string | null;
  onClose: () => void;
  onRefund?: (orderNo: string) => void;
}

const TYPE_STYLE: Record<string, string> = {
  recharge: 'bg-blue-100 text-blue-700',
  mall: 'bg-orange-100 text-orange-700',
  membership: 'bg-purple-100 text-purple-700',
  token: 'bg-yellow-100 text-yellow-700',
  brand: 'bg-green-100 text-green-700',
};
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunding: 'bg-orange-100 text-orange-700',
  refunded: 'bg-red-100 text-red-600',
  failed: 'bg-red-100 text-red-600',
};

export const OrderDetail: React.FC<OrderDetailProps> = ({ orderNo, onClose, onRefund }) => {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderNo) return;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderNo}`, { headers: getClientAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || '加载失败');
          return;
        }
        setOrder(data.order);
      } catch (e) {
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [orderNo]);

  const meta = order?.metadata || {};

  return (
    <Dialog open={!!orderNo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>订单详情</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> 加载中...
          </div>
        )}
        {error && <div className="py-10 text-center text-red-500">{error}</div>}

        {order && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge className={TYPE_STYLE[order.order_type]}>{order.order_type_label}</Badge>
              <Badge className={STATUS_STYLE[order.status]}>{order.status_label}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-gray-50 p-4">
              <div>
                <div className="text-xs text-gray-500">订单号</div>
                <div className="font-medium break-all">{order.order_no}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">金额</div>
                <div className="font-bold text-lg">¥{Number(order.amount || 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">用户</div>
                <div className="font-medium">{order.user?.username || order.user?.email || order.user?.phone || order.user_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">支付方式</div>
                <div className="font-medium">
                  {order.payment_method === 'wechat' ? '微信支付' : order.payment_method === 'alipay' ? '支付宝' : order.payment_method || '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">下单时间</div>
                <div className="font-medium">{order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">支付时间</div>
                <div className="font-medium">{order.paid_at ? new Date(order.paid_at).toLocaleString('zh-CN') : '-'}</div>
              </div>
              {order.payment_id && (
                <div className="col-span-2">
                  <div className="text-xs text-gray-500">支付流水号</div>
                  <div className="font-medium break-all">{order.payment_id}</div>
                </div>
              )}
            </div>

            {Object.keys(meta).length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="text-xs text-gray-500 mb-2">业务信息</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {Object.entries(meta).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-xs text-gray-400">{k}: </span>
                      <span className="text-xs">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {order.remark && (
              <div className="rounded-lg border p-4">
                <div className="text-xs text-gray-500 mb-1">备注</div>
                <div>{order.remark}</div>
              </div>
            )}

            {(order.status === 'paid' || order.status === 'completed') && onRefund && (
              <div className="flex justify-end pt-2">
                <Button variant="destructive" size="sm" onClick={() => onRefund(order.order_no)}>
                  退款
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
