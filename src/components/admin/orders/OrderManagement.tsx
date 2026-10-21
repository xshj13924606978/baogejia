'use client';

// 管理端：统一订单管理（#202608292700-阶段四：统一订单）
// API:
//   GET  /api/admin/orders?orderType=&status=&keyword=&dateFrom=&dateTo=&page=&pageSize=
//   GET  /api/admin/orders/export?...
// 含：统计卡片 + 列表 + 筛选/搜索 + 分页 + 导出 + 详情 + 退款

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { OrderStats } from '@/components/admin/orders/OrderStats';
import { OrderDetail } from '@/components/admin/orders/OrderDetail';
import { RefundDialog } from '@/components/admin/orders/RefundDialog';
import { Loader2, RefreshCw, Download, Eye, RotateCcw } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
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
  { value: 'refunding', label: '退款中' },
  { value: 'refunded', label: '已退款' },
  { value: 'failed', label: '支付失败' },
];
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunding: 'bg-orange-100 text-orange-700',
  refunded: 'bg-red-100 text-red-600',
  failed: 'bg-red-100 text-red-600',
};

export const OrderManagement: React.FC = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [orderType, setOrderType] = useState('all');
  const [status, setStatus] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [detailOrderNo, setDetailOrderNo] = useState<string | null>(null);
  const [refundOrderNo, setRefundOrderNo] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ orderType, status, page: String(page), pageSize: String(pageSize) });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取订单列表失败');
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orderType, status, keyword, dateFrom, dateTo, page, toast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ orderType, status });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/admin/orders/export?${params.toString()}`, { headers: getClientAuthHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '导出失败');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: '导出成功', description: '订单报表已下载' });
    } catch (e: any) {
      toast({ title: '导出失败', description: e?.message || '网络异常', variant: 'destructive' });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <OrderStats />

      {/* 筛选区 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[130px]">
              <div className="text-xs text-gray-500 mb-1">订单类型</div>
              <Select value={orderType} onValueChange={(v) => { setOrderType(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <div className="text-xs text-gray-500 mb-1">订单状态</div>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">开始日期</div>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[140px]" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">结束日期</div>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[140px]" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-xs text-gray-500 mb-1">搜索（订单号/用户名/邮箱）</div>
              <Input
                placeholder="输入订单号或用户信息搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadOrders}>
                <RefreshCw className="h-4 w-4 mr-1" /> 刷新
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" /> 导出报表
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      <Card>
        <CardContent className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> 加载中...
            </div>
          )}
          {!loading && orders.length === 0 && <div className="py-10 text-center text-gray-400">暂无订单</div>}

          {!loading && orders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="py-2 pr-3">订单号</th>
                    <th className="py-2 pr-3">类型</th>
                    <th className="py-2 pr-3">金额</th>
                    <th className="py-2 pr-3">状态</th>
                    <th className="py-2 pr-3">用户</th>
                    <th className="py-2 pr-3">支付方式</th>
                    <th className="py-2 pr-3">下单时间</th>
                    <th className="py-2 pr-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 pr-3 font-mono text-xs">{order.order_no}</td>
                      <td className="py-2.5 pr-3">{order.order_type_label}</td>
                      <td className="py-2.5 pr-3 font-semibold">¥{Number(order.amount || 0).toFixed(2)}</td>
                      <td className="py-2.5 pr-3">
                        <Badge className={STATUS_STYLE[order.status] || 'bg-gray-100'}>{order.status_label}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{order.user?.username || order.user?.email || order.user?.phone || '-'}</td>
                      <td className="py-2.5 pr-3 text-xs">
                        {order.payment_method === 'wechat' ? '微信' : order.payment_method === 'alipay' ? '支付宝' : order.payment_method || '-'}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '-'}</td>
                      <td className="py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetailOrderNo(order.order_no)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {(order.status === 'paid' || order.status === 'completed') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => setRefundOrderNo(order.order_no)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && total > 0 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">共 {total} 条</span>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  上一页
                </Button>
                <span className="px-2 py-1 text-xs text-gray-500">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 详情弹窗 */}
      <OrderDetail orderNo={detailOrderNo} onClose={() => setDetailOrderNo(null)} onRefund={(no) => { setDetailOrderNo(null); setRefundOrderNo(no); }} />

      {/* 退款弹窗 */}
      <RefundDialog
        orderNo={refundOrderNo}
        onClose={() => setRefundOrderNo(null)}
        onRefunded={() => { setPage(1); loadOrders(); }}
      />
    </div>
  );
};
