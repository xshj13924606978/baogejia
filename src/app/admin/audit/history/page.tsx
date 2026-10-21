'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  XCircle,
  Eye,
  Search,
  RefreshCw,
  RotateCcw,
  Trash2,
  FileText,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AuditHistoryItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
  uploaderName: string;
  reviewerName?: string;
  reviewedAt?: string;
  createdAt: string;
  contentText?: string;
}

interface StatusCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const STATUS_OPTIONS = [
  { value: 'approved,rejected', label: '全部状态' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'document', label: '文档' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'text', label: '文本' },
  { value: 'price', label: '产品价格' },
  { value: 'other', label: '其他' },
];

function getTypeLabel(type?: string) {
  const found = TYPE_OPTIONS.find((o) => o.value === type);
  return found?.label || type || '未知';
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso?: string) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '刚刚';
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 个月前`;
}

export default function AuditHistoryPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<AuditHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('approved,rejected');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AuditHistoryItem | null>(null);
  const [batchResetOpen, setBatchResetOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/admin/knowledge?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || '获取审核历史失败');
      }
      setItems(json.data || []);
      setTotalItems(json.total || 0);
      setStatusCounts(json.statusCounts || { total: 0, pending: 0, approved: 0, rejected: 0 });
    } catch (err: any) {
      toast({
        title: '加载失败',
        description: err.message || '无法获取审核历史',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [page, keyword, statusFilter, typeFilter, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, statusFilter, typeFilter, keyword]);

  const pageSelectedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const allPageSelected = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((i) => selectedIds.has(i.id));
  }, [items, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (allPageSelected) {
      const next = new Set(selectedIds);
      pageSelectedIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      pageSelectedIds.forEach((id) => next.add(id));
      setSelectedIds(next);
    }
  }, [allPageSelected, pageSelectedIds, selectedIds]);

  const toggleSelectItem = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    },
    [selectedIds]
  );

  const handleSearch = () => {
    setPage(1);
    fetchItems();
  };

  const resetFilters = () => {
    setKeyword('');
    setStatusFilter('approved,rejected');
    setTypeFilter('all');
    setPage(1);
  };

  const openDetail = (item: AuditHistoryItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  const callBatchApi = async (action: 'reset' | 'delete', ids: string[]) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/knowledge/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '批量操作失败');
      const updated = json.data?.updated ?? 0;
      const failed = json.data?.failed ?? [];
      if (failed.length > 0) {
        toast({
          title: `批量操作完成（${failed.length} 条失败）`,
          description: failed.map((f: any) => `${f.id}: ${f.reason}`).join('; '),
          variant: 'destructive',
        });
      } else {
        toast({ title: '批量操作成功', description: `共处理 ${updated} 条` });
      }
      setSelectedIds(new Set());
      await fetchItems();
    } catch (err: any) {
      toast({ title: '批量操作失败', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetStatus = async (item: AuditHistoryItem) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          reject_reason: null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '重置失败');
      toast({ title: '已重置', description: `「${item.title}」已恢复为待审核状态` });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotalItems((t) => Math.max(0, t - 1));
      await fetchItems();
    } catch (err: any) {
      toast({ title: '重置失败', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: AuditHistoryItem) => {
    if (!await confirmDialog({ title: `确定删除「${item.title}」？删除后不可恢复。`, destructive: true })) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${item.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '删除失败');
      toast({ title: '已删除', description: `「${item.title}」已删除` });
      await fetchItems();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchReset = () => {
    if (selectedIds.size === 0) return;
    setBatchResetOpen(true);
  };

  const confirmBatchReset = () => {
    callBatchApi('reset', Array.from(selectedIds));
    setBatchResetOpen(false);
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setBatchDeleteOpen(true);
  };

  const confirmBatchDelete = () => {
    callBatchApi('delete', Array.from(selectedIds));
    setBatchDeleteOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">审核历史</h1>
          <p className="text-sm text-muted-foreground mt-1">查看已审核通过的资料和被拒绝的记录</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card
          className="cursor-pointer hover:shadow-sm transition-shadow border-l-4 border-l-emerald-400"
          onClick={() => {
            setStatusFilter('approved');
            setPage(1);
          }}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">已通过</p>
              <p className="text-2xl font-bold text-emerald-600">{statusCounts.approved}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-sm transition-shadow border-l-4 border-l-rose-400"
          onClick={() => {
            setStatusFilter('rejected');
            setPage(1);
          }}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">已拒绝</p>
              <p className="text-2xl font-bold text-rose-600">{statusCounts.rejected}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-rose-50 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-rose-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
            <div className="relative flex-1 min-w-0 w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索资料名称..."
                className="pl-9"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(v) => {
                  setTypeFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} disabled={loading} size="sm">
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-1" />
                )}
                搜索
              </Button>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                重置
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm">
              已选择 <span className="font-semibold text-primary">{selectedIds.size}</span> 条
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleBatchReset} disabled={submitting}>
                <RotateCcw className="h-4 w-4 mr-1" /> 批量重置
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={handleBatchDelete}
                disabled={submitting}
              >
                <Trash2 className="h-4 w-4 mr-1" /> 批量删除
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                取消选择
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 审核记录 */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">审核记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3 text-left">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="全选本页"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium min-w-[180px]">资料名称</th>
                  <th className="px-4 py-3 text-left font-medium w-[100px]">类型</th>
                  <th className="px-4 py-3 text-left font-medium w-[120px]">提交者</th>
                  <th className="px-4 py-3 text-left font-medium w-[140px]">审核时间</th>
                  <th className="px-4 py-3 text-left font-medium w-[100px]">审核人</th>
                  <th className="px-4 py-3 text-left font-medium w-[90px]">状态</th>
                  <th className="px-4 py-3 text-right font-medium w-[150px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-12" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-14" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-8 w-20 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 opacity-30" />
                        <p>暂无审核记录</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 align-middle">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelectItem(item.id)}
                          aria-label={`选择 ${item.title}`}
                        />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate" title={item.title}>
                              {item.title}
                            </p>
                            {item.fileName && item.fileName !== item.title && (
                              <p className="text-xs text-muted-foreground truncate">
                                {item.fileName} {formatFileSize(item.fileSize)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-muted-foreground">
                        {getTypeLabel(item.type)}
                      </td>
                      <td
                        className="px-4 py-3 align-middle text-muted-foreground truncate max-w-[120px]"
                        title={item.uploaderName}
                      >
                        {item.uploaderName}
                      </td>
                      <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                        {relativeTime(item.reviewedAt) || '—'}
                      </td>
                      <td
                        className="px-4 py-3 align-middle text-muted-foreground truncate max-w-[100px]"
                        title={item.reviewerName || ''}
                      >
                        {item.reviewerName || '—'}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Badge
                          variant="outline"
                          className={
                            item.status === 'approved'
                              ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                              : 'border-rose-200 text-rose-700 bg-rose-50'
                          }
                        >
                          {STATUS_OPTIONS.find((s) => s.value === item.status)?.label ||
                            item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDetail(item)}
                            title="查看"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResetStatus(item)}
                            disabled={submitting}
                            title="重置为待审核"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600"
                            onClick={() => handleDelete(item)}
                            disabled={submitting}
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/knowledge/${item.id}`} target="_blank">
                                  编辑详情
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-xs text-muted-foreground">
                共 {totalItems} 条，第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              {detailItem?.title}
            </DialogTitle>
            <DialogDescription>查看审核详情</DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">类型：</span>
                  {getTypeLabel(detailItem.type)}
                </div>
                <div>
                  <span className="text-muted-foreground">大小：</span>
                  {formatFileSize(detailItem.fileSize) || '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">提交者：</span>
                  {detailItem.uploaderName}
                </div>
                <div>
                  <span className="text-muted-foreground">提交时间：</span>
                  {new Date(detailItem.createdAt).toLocaleString('zh-CN')}
                </div>
                <div>
                  <span className="text-muted-foreground">审核时间：</span>
                  {detailItem.reviewedAt
                    ? new Date(detailItem.reviewedAt).toLocaleString('zh-CN')
                    : '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">审核人：</span>
                  {detailItem.reviewerName || '—'}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">状态：</span>
                  <Badge
                    variant="outline"
                    className={
                      detailItem.status === 'approved'
                        ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                        : 'border-rose-200 text-rose-700 bg-rose-50'
                    }
                  >
                    {STATUS_OPTIONS.find((s) => s.value === detailItem.status)?.label ||
                      detailItem.status}
                  </Badge>
                </div>
                {detailItem.rejectReason && (
                  <div className="col-span-2 p-2 rounded bg-destructive/5 text-destructive text-sm">
                    <span className="font-medium">拒绝原因：</span>
                    {detailItem.rejectReason}
                  </div>
                )}
              </div>
              {detailItem.description && (
                <div className="text-sm border rounded-md p-3 bg-muted/30">
                  <p className="text-muted-foreground mb-1">描述</p>
                  <p>{detailItem.description}</p>
                </div>
              )}
              {detailItem.fileUrl && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">文件链接</p>
                  <a
                    href={detailItem.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {detailItem.fileUrl}
                  </a>
                </div>
              )}
              {detailItem.contentText && (
                <div className="text-sm border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-y-auto">
                  <p className="text-muted-foreground mb-1">解析文本</p>
                  <p className="whitespace-pre-wrap">{detailItem.contentText}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 批量重置确认 */}
      <Dialog open={batchResetOpen} onOpenChange={setBatchResetOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>批量重置</DialogTitle>
            <DialogDescription>
              确定将选中的 {selectedIds.size} 条内容重置为待审核状态吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setBatchResetOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmBatchReset} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认 */}
      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
            <DialogDescription>
              确定要删除选中的 {selectedIds.size} 条内容吗？删除后不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmBatchDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
