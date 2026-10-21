'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  Send,
  Eye,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date-utils';

type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';

interface QuoteItem {
  id: string;
  quoteNumber: string;
  customerName?: string | null;
  productCount: number;
  totalAmount: number;
  status: QuoteStatus;
  createdAt: string;
  version: number;
}

interface QuoteListResponse {
  success: boolean;
  data?: QuoteItem[];
  totalCount?: number;
  statusCounts?: Record<string, number>;
  currentPage?: number;
  totalPages?: number;
  error?: string;
}

const statusTabs = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'sent', label: '已发送' },
  { key: 'approved', label: '已接受' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'expired', label: '已过期' },
] as const;

const statusConfig: Record<
  QuoteStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: '草稿', variant: 'secondary' },
  sent: { label: '已发送', variant: 'default' },
  approved: { label: '已接受', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'destructive' },
  expired: { label: '已过期', variant: 'outline' },
};

const PAGE_SIZE = 10;

export default function QuotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuoteItem | null>(null);
  const [batchAction, setBatchAction] = useState<'delete' | 'send' | null>(null);

  // 从 URL 初始化状态
  useEffect(() => {
    const page = parseInt(searchParams.get('page') || '1', 10);
    const status = searchParams.get('status') || 'all';
    const q = searchParams.get('q') || '';
    setCurrentPage(Number.isNaN(page) || page < 1 ? 1 : page);
    setStatusFilter(status);
    setSearchQuery(q);
  }, [searchParams]);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(PAGE_SIZE));
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }

      const res = await fetch(`/api/quotes?${params.toString()}`);
      const result: QuoteListResponse = await res.json();

      if (result.success && result.data) {
        setQuotes(result.data);
        setTotalCount(result.totalCount || 0);
        setStatusCounts(result.statusCounts || {});
        setTotalPages(result.totalPages || 1);
      } else {
        toast.error(result.error || '获取报价单列表失败');
        setQuotes([]);
        setTotalCount(0);
        setStatusCounts({});
        setTotalPages(1);
      }
    } catch (err) {
      console.error('获取报价单列表失败:', err);
      toast.error('获取报价单列表失败');
      setQuotes([]);
      setTotalCount(0);
      setStatusCounts({});
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, searchQuery]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // 选择相关
  const visibleIds = useMemo(() => quotes.map((q) => q.id), [quotes]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIds.some((id) => selectedIds.has(id)) && !allSelected;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allSelected, visibleIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 状态数量：全部取 totalCount，其它取对应状态统计
  const getStatusCount = useCallback(
    (key: string) => {
      if (key === 'all') return totalCount;
      return statusCounts[key] ?? 0;
    },
    [statusCounts, totalCount]
  );

  // 删除单条
  const handleDelete = useCallback(async (quote: QuoteItem) => {
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success('报价单已删除');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(quote.id);
          return next;
        });
        fetchQuotes();
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (err) {
      console.error('删除报价单失败:', err);
      toast.error('删除报价单失败');
    } finally {
      setDeleteTarget(null);
    }
  }, [fetchQuotes]);

  // 批量操作
  const runBatchAction = useCallback(async () => {
    if (!batchAction || selectedIds.size === 0) return;

    setBatchProcessing(true);
    try {
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action: batchAction,
        }),
      });
      const result = await res.json();

      if (result.success) {
        toast.success(result.message || '批量操作成功');
        clearSelection();
        setStatusFilter('all');
        fetchQuotes();
      } else {
        toast.error(result.error || '批量操作失败');
      }
    } catch (err) {
      console.error('批量操作失败:', err);
      toast.error('批量操作失败');
    } finally {
      setBatchProcessing(false);
      setBatchAction(null);
    }
  }, [batchAction, clearSelection, fetchQuotes, selectedIds]);

  const confirmBatchAction = useCallback((action: 'delete' | 'send') => {
    if (selectedIds.size === 0) return;
    setBatchAction(action);
  }, [selectedIds.size]);

  // URL 与状态同步
  const buildUrl = useCallback(
    (updates: { page?: number; status?: string; q?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (updates.page !== undefined) params.set('page', String(updates.page));
      if (updates.status !== undefined) params.set('status', updates.status);
      if (updates.q !== undefined) {
        if (updates.q) params.set('q', updates.q);
        else params.delete('q');
      }
      return `/quotes?${params.toString()}`;
    },
    [searchParams]
  );

  const handleStatusChange = useCallback(
    (status: string) => {
      setStatusFilter(status);
      setCurrentPage(1);
      clearSelection();
      router.push(buildUrl({ page: 1, status }));
    },
    [buildUrl, clearSelection, router]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setCurrentPage(1);
      clearSelection();
      router.push(buildUrl({ page: 1, q: searchQuery.trim() }));
    },
    [buildUrl, clearSelection, router, searchQuery]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setCurrentPage(1);
    clearSelection();
    router.push(buildUrl({ page: 1, q: null }));
  }, [buildUrl, clearSelection, router]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > totalPages) return;
      setCurrentPage(page);
      router.push(buildUrl({ page }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [buildUrl, router, totalPages]
  );


  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount || 0);
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* 顶部标题栏 */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild className="shrink-0">
              <Link href="/" aria-label="返回对话">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="size-4 text-primary" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">我的报价单</h1>
            </div>
          </div>
          <Button asChild className="gap-2 self-start sm:self-auto">
            <Link href="/">
              <Plus className="size-4" />
              新建报价
            </Link>
          </Button>
        </div>

        {/* 主卡片 */}
        <div className="rounded-xl border bg-white shadow-sm">
          {/* 状态筛选 */}
          <div className="border-b px-4 py-3 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => {
                const count = getStatusCount(tab.key);
                const active = statusFilter === tab.key;
                return (
                  // #[20260901-1300] P2-4：裸 button 收敛为设计系统 Button 组件
                  <Button
                    key={tab.key}
                    onClick={() => handleStatusChange(tab.key)}
                    aria-pressed={active}
                    className={cn(
                      'h-auto rounded-full px-3 py-1.5 text-sm font-medium',
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-xs',
                        active ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
                      )}
                    >
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* 搜索与批量工具栏 */}
          <div className="flex flex-col gap-3 border-b bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <form onSubmit={handleSearch} className="flex w-full max-w-md items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  placeholder="搜索报价编号 / 客户名称"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 pr-8 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="清除搜索"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Button type="submit" size="sm" variant="secondary" className="h-9 gap-1">
                <Search className="size-3.5" />
                搜索
              </Button>
            </form>

            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">
                  已选 <span className="font-medium text-slate-900">{selectedCount}</span> 项
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-slate-700"
                  onClick={() => confirmBatchAction('send')}
                  disabled={batchProcessing}
                >
                  <Send className="size-3.5" />
                  批量发送
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => confirmBatchAction('delete')}
                  disabled={batchProcessing}
                >
                  <Trash2 className="size-3.5" />
                  批量删除
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-slate-500"
                  onClick={clearSelection}
                  disabled={batchProcessing}
                >
                  取消
                </Button>
              </div>
            )}
          </div>

          {/* 表格区域：内容超出才出现滚动条 */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80 text-left text-xs font-medium text-slate-500">
                  <th className="w-10 px-4 py-3 sm:px-6">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="全选当前页"
                    />
                  </th>
                  <th className="px-4 py-3 sm:px-6">报价编号</th>
                  <th className="px-4 py-3 sm:px-6">客户名称</th>
                  <th className="px-4 py-3 text-center sm:px-6">产品数</th>
                  <th className="px-4 py-3 text-right sm:px-6">总金额</th>
                  <th className="px-4 py-3 text-center sm:px-6">状态</th>
                  <th className="px-4 py-3 sm:px-6">创建时间</th>
                  <th className="px-4 py-3 text-right sm:px-6">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500 sm:px-6">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="size-6 animate-spin text-primary" />
                        <span className="text-sm">加载中…</span>
                      </div>
                    </td>
                  </tr>
                ) : quotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center sm:px-6">
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                          <FileText className="size-6 text-slate-400" />
                        </div>
                        <p className="text-sm">暂无报价单</p>
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/">新建报价</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  quotes.map((quote) => {
                    const status = statusConfig[quote.status] || statusConfig.draft;
                    const checked = selectedIds.has(quote.id);
                    const canBatchOperate = quote.status === 'draft';
                    return (
                      <tr
                        key={quote.id}
                        className={cn(
                          'border-b transition-colors last:border-b-0',
                          checked ? 'bg-primary/5' : 'hover:bg-slate-50/80'
                        )}
                      >
                        <td className="px-4 py-3 sm:px-6">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelect(quote.id)}
                            aria-label={`选择报价单 ${quote.quoteNumber}`}
                            disabled={!canBatchOperate}
                            title={!canBatchOperate ? '仅草稿可批量操作' : ''}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-primary sm:px-6">
                          <Link href={`/quotes/${quote.id}`} className="hover:underline">
                            {quote.quoteNumber || '-'}
                          </Link>
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-slate-700 sm:px-6">
                          {quote.customerName || <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-slate-700 sm:px-6">
                          {quote.productCount} 项
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900 sm:px-6">
                          {formatAmount(quote.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-center sm:px-6">
                          <Badge variant={status.variant} className="text-xs">
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500 sm:px-6">
                          {formatDateTime(quote.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right sm:px-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" asChild title="查看">
                              <Link href={`/quotes/${quote.id}`}>
                                <Eye className="size-4 text-slate-500" />
                              </Link>
                            </Button>
                            {quote.status === 'draft' && (
                              <Button variant="ghost" size="icon-sm" asChild title="编辑">
                                <Link href={`/quotes/${quote.id}?edit=1`}>
                                  <Pencil className="size-4 text-slate-500" />
                                </Link>
                              </Button>
                            )}
                            {quote.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeleteTarget(quote)}
                                title="删除"
                              >
                                <Trash2 className="size-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
              <p className="text-sm text-slate-500">
                共 <span className="font-medium text-slate-900">{totalCount}</span> 条，
                第 <span className="font-medium text-slate-900">{currentPage}</span> /{' '}
                {totalPages} 页
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="上一页"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="icon-sm"
                      onClick={() => goToPage(page)}
                      className={cn(
                        'h-8 w-8 text-xs',
                        currentPage === page && 'pointer-events-none'
                      )}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="下一页"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 单条删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-red-500" />
              确认删除报价单
            </DialogTitle>
            <DialogDescription className="text-sm">
              报价单 <span className="font-medium">{deleteTarget?.quoteNumber}</span>{' '}
              删除后将无法恢复，是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量操作确认 */}
      <Dialog open={!!batchAction} onOpenChange={(open) => !open && setBatchAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {batchAction === 'delete' ? (
                <AlertTriangle className="size-5 text-red-500" />
              ) : (
                <Send className="size-5 text-primary" />
              )}
              {batchAction === 'delete' ? '确认批量删除' : '确认批量发送'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {batchAction === 'delete'
                ? `即将删除选中的 ${selectedCount} 条报价单，删除后无法恢复。`
                : `即将发送选中的 ${selectedCount} 条报价单，发送后状态将变为「已发送」。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setBatchAction(null)} disabled={batchProcessing}>
              取消
            </Button>
            <Button
              variant={batchAction === 'delete' ? 'destructive' : 'default'}
              onClick={runBatchAction}
              disabled={batchProcessing}
            >
              {batchProcessing && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {batchAction === 'delete' ? '确认删除' : '确认发送'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
