'use client';

// 管理端：品牌管理（阶段三 #202608292600-厂商付费推广）
// API:
//   GET  /api/admin/brand/vendors?status=&keyword=&page=&pageSize=
//   POST /api/admin/brand/vendors/:id/approve|reject|suspend

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, CheckCircle2, XCircle, PauseCircle, Eye, Store, BadgeCheck } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { formatDate } from '@/lib/date-utils';

interface BrandVendor {
  id: string;
  brand_name: string;
  brand_logo: string | null;
  brand_desc: string | null;
  category: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  address: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  priority_level: number;
  priority_expire_at: string | null;
  is_verified: boolean;
  ranking_score: number;
  total_paid: number;
  view_count: number;
  match_count: number;
  order_count: number;
  rating: number;
  created_at: string;
  user?: { id: string; username: string | null; email: string | null; phone: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  suspended: '已暂停',
};
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-200 text-gray-600',
};
const LEVEL_LABEL: Record<number, string> = { 0: '免费', 1: '白银', 2: '黄金', 3: '铂金' };

export const BrandManagement: React.FC = () => {
  const { toast } = useToast();
  const [brands, setBrands] = useState<BrandVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [actingId, setActingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BrandVendor | null>(null);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/admin/brand/vendors?${params.toString()}`, { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取品牌列表失败');
      setBrands(data.brands || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [status, page, keyword, toast]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'suspend') => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/brand/vendors/${id}/${action}`, {
        method: 'POST',
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      toast({ title: '操作成功', description: action === 'approve' ? '品牌已通过审核' : action === 'reject' ? '品牌已拒绝' : '品牌已暂停' });
      loadBrands();
      if (detail?.id === id) setDetail(data.brand);
    } catch (e: any) {
      toast({ title: '操作失败', description: e?.message, variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };


  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待审核</SelectItem>
              <SelectItem value="approved">已通过</SelectItem>
              <SelectItem value="rejected">已拒绝</SelectItem>
              <SelectItem value="suspended">已暂停</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-48"
            placeholder="搜索品牌名/联系人"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadBrands(); } }}
          />
          <Button variant="outline" size="icon" onClick={() => { setPage(1); loadBrands(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="ml-auto text-sm text-slate-500">共 {total} 个品牌</div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : brands.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-slate-400">暂无品牌数据</div>
      ) : (
        <div className="space-y-3">
          {brands.map((b) => (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {b.brand_logo ? (
                      <img src={b.brand_logo} alt={b.brand_name} className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{b.brand_name}</span>
                      {b.is_verified && <BadgeCheck className="h-4 w-4 text-blue-500" />}
                      <Badge className={STATUS_STYLE[b.status] || 'bg-gray-100 text-gray-600'}>{STATUS_LABEL[b.status] || b.status}</Badge>
                      <Badge variant="outline">{LEVEL_LABEL[b.priority_level] || '免费'}推广</Badge>
                      {b.category && <Badge variant="secondary">{b.category}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 line-clamp-1">{b.brand_desc || '暂无简介'}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span>申请人：{b.user?.username || b.user?.phone || b.user?.email || '-'}</span>
                      <span>联系人：{b.contact_person || '-'} {b.contact_phone ? `（${b.contact_phone}）` : ''}</span>
                      <span>累计付费：¥{Number(b.total_paid || 0).toFixed(2)}</span>
                      <span>权益至：{formatDate(b.priority_expire_at)}</span>
                      <span>曝光 {b.view_count} · 匹配 {b.match_count} · 成单 {b.order_count}</span>
                      <span>申请于 {formatDate(b.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetail(b)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />详情
                    </Button>
                    {b.status === 'pending' && (
                      <>
                        <Button size="sm" className="bg-green-500 hover:bg-green-600" disabled={actingId === b.id} onClick={() => handleAction(b.id, 'approve')}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />通过
                        </Button>
                        <Button variant="destructive" size="sm" disabled={actingId === b.id} onClick={() => handleAction(b.id, 'reject')}>
                          <XCircle className="mr-1 h-3.5 w-3.5" />拒绝
                        </Button>
                      </>
                    )}
                    {b.status === 'approved' && (
                      <Button variant="outline" size="sm" className="text-amber-600" disabled={actingId === b.id} onClick={() => handleAction(b.id, 'suspend')}>
                        <PauseCircle className="mr-1 h-3.5 w-3.5" />暂停
                      </Button>
                    )}
                    {b.status === 'suspended' && (
                      <Button size="sm" className="bg-green-500 hover:bg-green-600" disabled={actingId === b.id} onClick={() => handleAction(b.id, 'approve')}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />恢复
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-slate-500">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>品牌详情</DialogTitle>
            <DialogDescription>品牌入驻信息与推广状态</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  {detail.brand_logo ? (
                    <img src={detail.brand_logo} alt={detail.brand_name} className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-lg">
                    {detail.brand_name}
                    {detail.is_verified && <BadgeCheck className="h-4 w-4 text-blue-500" />}
                  </div>
                  <Badge className={STATUS_STYLE[detail.status] || ''}>{STATUS_LABEL[detail.status] || detail.status}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['行业分类', detail.category || '-'],
                  ['联系人', detail.contact_person || '-'],
                  ['联系电话', detail.contact_phone || '-'],
                  ['联系邮箱', detail.contact_email || '-'],
                  ['官网', detail.website || '-'],
                  ['公司地址', detail.address || '-'],
                  ['优先等级', LEVEL_LABEL[detail.priority_level] || '免费'],
                  ['权益到期', formatDate(detail.priority_expire_at)],
                  ['排行权重', String(detail.ranking_score)],
                  ['累计付费', `¥${Number(detail.total_paid || 0).toFixed(2)}`],
                  ['评分', Number(detail.rating || 0).toFixed(1)],
                  ['曝光/匹配/成单', `${detail.view_count}/${detail.match_count}/${detail.order_count}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[10px] text-slate-400">{k}</div>
                    <div className="mt-0.5 truncate font-medium text-slate-700">{v}</div>
                  </div>
                ))}
              </div>
              {detail.brand_desc && <p className="text-xs text-slate-600">简介：{detail.brand_desc}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
