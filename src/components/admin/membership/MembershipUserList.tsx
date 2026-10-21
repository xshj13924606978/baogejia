'use client';

// 管理端：会员用户列表（阶段二 #202608292500）
// API: GET /api/admin/membership/users

import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { MEMBERSHIP_CODE_LABEL } from '@/lib/level-constants';
import { formatDate } from '@/lib/date-utils';

interface MembershipUser {
  id: string;
  user_id: string;
  plan_id: string;
  order_no: string;
  level_code: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  user?: { id: string; username?: string; email?: string; phone?: string } | null;
  plan?: { id: string; name: string; price: number; duration_days: number } | null;
}

// #202608302400 阶段1：等级名称统一来源（会员 / 黄金 / 白金）
const LEVEL_LABEL: Record<string, string> = MEMBERSHIP_CODE_LABEL;

const STATUS_LABEL: Record<string, string> = {
  active: '生效中',
  expired: '已过期',
  cancelled: '已取消',
  pending: '待支付',
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
  pending: 'bg-amber-100 text-amber-700',
};

export const MembershipUserList: React.FC = () => {
  const { toast } = useToast();
  const [records, setRecords] = useState<MembershipUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const pageSize = 20;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/membership/users?page=${page}&pageSize=${pageSize}&status=${statusFilter}`,
        { headers: getClientAuthHeaders() }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取会员用户失败');
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, toast]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-bold">会员用户</h2>
          <span className="text-sm text-slate-400">共 {total} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="all">全部状态</option>
            <option value="active">生效中</option>
            <option value="expired">已过期</option>
            <option value="pending">待支付</option>
          </select>
          <Button variant="outline" size="sm" onClick={loadRecords}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">套餐</th>
                <th className="px-4 py-3">等级</th>
                <th className="px-4 py-3">生效日期</th>
                <th className="px-4 py-3">到期日期</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">订单号</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无数据</td>
                </tr>
              )}
              {!loading && records.map((r) => (
                <tr key={r.id} className="border-b hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.user?.username || r.user?.phone || r.user?.email || r.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-400">{r.user?.email || r.user?.phone || ''}</div>
                  </td>
                  <td className="px-4 py-3">{r.plan?.name || '会员套餐'}</td>
                  <td className="px-4 py-3">
                    <Badge className="bg-purple-100 text-purple-700">{LEVEL_LABEL[r.level_code] || r.level_code}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(r.start_date)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(r.end_date)}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-500'}>
                      {STATUS_LABEL[r.status] || r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{r.order_no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
