'use client';

// 用户端我的订单列表（#202608292700-阶段四：统一订单）
// 支持按类型/状态筛选 + 分页，点击进入详情

import { useEffect, useState, useCallback } from 'react';
import OrderDetail from '@/components/user/order-detail';

interface OrderListProps {
  userId?: string;
}

const TYPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'recharge', label: '积分充值' },
  { value: 'mall', label: '积分商城' },
  { value: 'membership', label: '会员购买' },
  { value: 'token', label: 'Token购买' },
  { value: 'brand', label: '品牌付费' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'refunded', label: '已退款' },
  { value: 'failed', label: '支付失败' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunding: 'bg-orange-100 text-orange-700',
  refunded: 'bg-red-100 text-red-600',
  failed: 'bg-red-100 text-red-600',
};

export default function OrderList({ userId }: OrderListProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orderType, setOrderType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [detailOrderNo, setDetailOrderNo] = useState<string | null>(null);
  const pageSize = 10;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ orderType, status, page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '加载失败');
        return;
      }
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [orderType, status, page]);

  useEffect(() => {
    if (userId) loadOrders();
  }, [userId, loadOrders]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleFilterChange = (type: string, value: string) => {
    if (type === 'orderType') setOrderType(value);
    if (type === 'status') setStatus(value);
    setPage(1);
  };

  if (detailOrderNo) {
    return <OrderDetail orderNo={detailOrderNo} onBack={() => setDetailOrderNo(null)} />;
  }

  return (
    <div>
      {/* 筛选 */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange('orderType', opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                orderType === opt.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange('status', opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                status === opt.value ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="py-12 text-center text-sm text-gray-500">加载中...</div>}
      {error && <div className="py-12 text-center text-sm text-red-500">{error}</div>}

      {!loading && !error && orders.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">暂无订单记录</div>
      )}

      {/* 订单列表 */}
      {!loading && !error && orders.length > 0 && (
        <>
          <div className="space-y-2.5">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => setDetailOrderNo(order.order_no)}
                className="w-full text-left rounded-xl border p-3.5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{order.order_type_label}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100'}`}>
                    {order.status_label}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-lg font-bold">¥{Number(order.amount || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{order.order_no}</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500">共 {total} 条</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded-lg text-xs bg-gray-100 disabled:opacity-40 hover:bg-gray-200"
              >
                上一页
              </button>
              <span className="px-2 py-1 text-xs text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded-lg text-xs bg-gray-100 disabled:opacity-40 hover:bg-gray-200"
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
