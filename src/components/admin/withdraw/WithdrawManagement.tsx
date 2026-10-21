'use client';

// 管理端：积分提现审核
// - 提现申请列表（状态过滤 + 分页）
// - 审核通过 / 拒绝（退还积分）
// - 确认打款（自动调支付渠道 / 手动登记）

import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, CheckCircle2, XCircle, Banknote, ShieldAlert } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';

interface WithdrawRecord {
  id: string;
  user_id: string;
  points: number;
  amount: number;
  rate: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'failed';
  account_type: 'wechat' | 'alipay' | 'bank';
  account_info: Record<string, any>;
  remark: string | null;
  reject_reason: string | null;
  paid_mode?: 'auto' | 'manual';
  transaction_id?: string | null;
  paid_at?: string | null;
  created_at: string;
  user?: { id: string; username?: string; email?: string; phone?: string } | null;
}

interface WithdrawStats {
  pending: number;
  approved: number;
  paid: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  paid: '已打款',
  failed: '打款失败',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行卡',
};

export const WithdrawManagement: React.FC = () => {
  const { toast } = useToast();
  const [records, setRecords] = useState<WithdrawRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WithdrawStats>({ pending: 0, approved: 0, paid: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 弹窗
  const [rejectTarget, setRejectTarget] = useState<WithdrawRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [payTarget, setPayTarget] = useState<WithdrawRecord | null>(null);
  const [payMode, setPayMode] = useState<'auto' | 'manual'>('auto');
  const [manualTxId, setManualTxId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<WithdrawRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/withdraw/list?status=${statusFilter}&page=${page}&pageSize=${pageSize}`, {
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取列表失败');
      setRecords(data.records || []);
      setTotal(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message || '获取提现列表失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const accountLabel = (r: WithdrawRecord) => {
    const info = r.account_info || {};
    if (r.account_type === 'wechat') return info.wechat_openid ? `openid: ${info.wechat_openid}` : '微信';
    if (r.account_type === 'alipay') return info.alipay_account || '支付宝';
    return `${info.bank_name || ''} ${info.bank_card || ''} ${info.bank_holder || ''}`.trim();
  };

  const handleApprove = async (r: WithdrawRecord) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/withdraw/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      toast({ title: '审核通过', description: `提现 ${r.points} 积分 / ¥${r.amount} 已通过` });
      loadData();
    } catch (e: any) {
      toast({ title: '操作失败', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/withdraw/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ id: rejectTarget.id, reason: rejectReason || '管理员拒绝' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      toast({ title: '已拒绝', description: `积分已退还原告：${rejectTarget.points} 积分` });
      setRejectTarget(null);
      setRejectReason('');
      loadData();
    } catch (e: any) {
      toast({ title: '操作失败', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = async () => {
    if (!payTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/withdraw/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          id: payTarget.id,
          mode: payMode,
          transactionId: payMode === 'manual' ? manualTxId : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      toast({ title: '打款成功', description: `提现 ${payTarget.amount} 元已标记为已打款` });
      setPayTarget(null);
      setManualTxId('');
      loadData();
    } catch (e: any) {
      toast({ title: '打款失败', description: e?.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">积分提现审核</h1>

      {/* 统计概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-amber-200 bg-amber-50/50">
          <div className="text-sm text-amber-600">待审核</div>
          <div className="text-2xl font-bold text-amber-700">{stats.pending}</div>
        </Card>
        <Card className="p-4 border-blue-200 bg-blue-50/50">
          <div className="text-sm text-blue-600">已通过待打款</div>
          <div className="text-2xl font-bold text-blue-700">{stats.approved}</div>
        </Card>
        <Card className="p-4 border-green-200 bg-green-50/50">
          <div className="text-sm text-green-600">已打款</div>
          <div className="text-2xl font-bold text-green-700">{stats.paid}</div>
        </Card>
      </div>

      {/* 状态过滤 */}
      <div className="flex items-center justify-between mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
            <SelectItem value="paid">已打款</SelectItem>
            <SelectItem value="failed">打款失败</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-slate-400">暂无提现申请</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 dark:bg-slate-800/50 text-left">
                  <th className="px-4 py-2 font-medium">用户</th>
                  <th className="px-4 py-2 font-medium">金额</th>
                  <th className="px-4 py-2 font-medium">方式</th>
                  <th className="px-4 py-2 font-medium">收款账户</th>
                  <th className="px-4 py-2 font-medium">状态</th>
                  <th className="px-4 py-2 font-medium">申请时间</th>
                  <th className="px-4 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.user?.username || r.user?.phone || r.user?.email || '未知'}</div>
                      <div className="text-xs text-slate-400">{r.user?.phone || r.user?.email || r.user_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-violet-700">¥{r.amount}</div>
                      <div className="text-xs text-slate-400">{r.points} 积分</div>
                    </td>
                    <td className="px-4 py-3">{ACCOUNT_TYPE_LABEL[r.account_type] || r.account_type}</td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <button
                        type="button"
                        className="truncate text-left text-xs text-slate-500 hover:text-slate-800 hover:underline"
                        onClick={() => setDetailTarget(r)}
                        title="点击查看"
                      >
                        {accountLabel(r)}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {r.reject_reason && <div className="mt-1 text-[11px] text-red-500">{r.reject_reason}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'pending' && (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-300"
                            onClick={() => handleApprove(r)} disabled={actionLoading}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />通过
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-300"
                            onClick={() => { setRejectTarget(r); setRejectReason(''); }} disabled={actionLoading}>
                            <XCircle className="mr-1 h-3.5 w-3.5" />拒绝
                          </Button>
                        </div>
                      )}
                      {r.status === 'approved' && (
                        <Button size="sm" className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-700"
                          onClick={() => { setPayTarget(r); setPayMode('auto'); setManualTxId(''); }}>
                          <Banknote className="mr-1 h-3.5 w-3.5" />确认打款
                        </Button>
                      )}
                      {(r.status === 'paid' || r.status === 'failed') && (
                        <div className="text-xs text-slate-400">
                          {r.paid_mode ? `(${r.paid_mode === 'manual' ? '手动' : '自动'})` : ''}
                          {r.transaction_id && <div className="truncate max-w-[120px]">tx: {r.transaction_id}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 分页 */}
          <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
            <span className="text-slate-400">共 {total} 条</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
              <span className="flex items-center text-xs text-slate-500">第 {page} / {totalPages} 页</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
            </div>
          </div>
        </Card>
      )}

      {/* 拒绝弹窗 */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝提现申请</DialogTitle>
            <DialogDescription>
              将退还 <b>{rejectTarget?.points}</b> 积分给用户。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="拒绝原因（将展示给用户）"
              rows={3}
            />
            <Button variant="destructive" className="w-full" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : '确认拒绝并退积分'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 打款弹窗 */}
      <Dialog open={!!payTarget} onOpenChange={(v) => { if (!v) setPayTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认打款</DialogTitle>
            <DialogDescription>
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  打款金额 <b>¥{payTarget?.amount}</b>（{payTarget?.points} 积分），收款方式：
                  {payTarget ? ACCOUNT_TYPE_LABEL[payTarget.account_type] : ''} {payTarget ? accountLabel(payTarget) : ''}
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <div className="mb-2 text-sm font-medium">打款方式</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayMode('auto')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${payMode === 'auto' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}
                >
                  自动打款
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('manual')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${payMode === 'manual' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}
                >
                  手动登记
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {payMode === 'auto'
                  ? '自动调用微信/支付宝打款接口（需已配置支付凭据）'
                  : '线下转账完成后登记，需填写交易单号'}
              </p>
            </div>
            {payMode === 'manual' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">交易单号</label>
                <Input value={manualTxId} onChange={(e) => setManualTxId(e.target.value)} placeholder="微信/支付宝交易单号" />
              </div>
            )}
            <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={handlePay} disabled={actionLoading || (payMode === 'manual' && !manualTxId)}>
              {actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : '确认打款'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 账户详情弹窗 */}
      <Dialog open={!!detailTarget} onOpenChange={(v) => { if (!v) setDetailTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>收款账户详情</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            {Object.entries(detailTarget?.account_info || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-500">{k}</span>
                <span className="font-medium">{String(v || '')}</span>
              </div>
            ))}
            {detailTarget?.remark && (
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-slate-500">备注</div>
                <div className="font-medium">{detailTarget.remark}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
