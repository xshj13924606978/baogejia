'use client';

// 管理端：品牌付费记录（阶段三 #202608292600-厂商付费推广）
// API: GET /api/admin/brand/payments?status=&page=&pageSize=

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { formatDate } from '@/lib/date-utils';

interface BrandPayment {
  id: string;
  order_no: string;
  amount: number;
  priority_level: number;
  duration_days: number;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  user?: { id: string; username: string | null; email: string | null; phone: string | null } | null;
  brand?: { id: string; brand_name: string } | null;
  package?: { id: string; name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
  refunded: 'bg-red-100 text-red-700',
};
const LEVEL_LABEL: Record<number, string> = { 1: '白银', 2: '黄金', 3: '铂金' };

export const BrandPayments: React.FC = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<BrandPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/admin/brand/payments?${params.toString()}`, { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取付费记录失败');
      setPayments(data.payments || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [status, page, toast]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待支付</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
            <SelectItem value="refunded">已退款</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => { setPage(1); loadPayments(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="ml-auto text-sm text-slate-500">共 {total} 条记录</div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-slate-400">暂无付费记录</div>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{p.brand?.brand_name || '-'}</span>
                      <Badge variant="secondary">{p.package?.name || '推广套餐'}</Badge>
                      <Badge className={STATUS_STYLE[p.status] || ''}>{STATUS_LABEL[p.status] || p.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      订单号：{p.order_no}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span>购买人：{p.user?.username || p.user?.phone || p.user?.email || '-'}</span>
                      <span>等级：{LEVEL_LABEL[p.priority_level] || p.priority_level}</span>
                      <span>时长：{p.duration_days} 天</span>
                      <span>权益期：{formatDate(p.start_date)} ~ {formatDate(p.end_date)}</span>
                      <span>下单：{formatDate(p.created_at)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold text-blue-600">¥{Number(p.amount).toFixed(2)}</div>
                    <div className="text-[11px] text-slate-400">{STATUS_LABEL[p.status] || p.status}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-slate-500">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      )}
    </div>
  );
};
