'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileText, Search, MoreHorizontal, Eye, Send, CheckCircle, XCircle,
  Trash2, Loader2, ClipboardList, AlertCircle, ShieldAlert,
  RotateCcw, Copy, X, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';

interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  totalAmount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountRate: number;
  discountAmount: number;
  productCount: number;
  customerName: string;
  customerPhone: string;
  creatorName: string;
  creatorEmail: string;
  version: number;
  issuedAt?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface QuoteDetail extends Quote {
  products: any[];
  customerInfo: Record<string, any>;
  supplierInfo: Record<string, any>;
  terms: Record<string, any>;
}

const statusConfig: Record<string, { label: string; color: string; ring: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-slate-100 text-slate-700', ring: 'ring-slate-200', icon: <FileText className="h-4 w-4" /> },
  pending_review: { label: '待审核', color: 'bg-amber-100 text-amber-700', ring: 'ring-amber-200', icon: <AlertCircle className="h-4 w-4" /> },
  approved: { label: '已批准', color: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200', icon: <CheckCircle className="h-4 w-4" /> },
  rejected: { label: '已拒绝', color: 'bg-rose-100 text-rose-700', ring: 'ring-rose-200', icon: <XCircle className="h-4 w-4" /> },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-700', ring: 'ring-blue-200', icon: <Send className="h-4 w-4" /> },
};

const statusList = Object.keys(statusConfig);

/** 客户信息字段汉化映射 */
const CUSTOMER_FIELD_MAP: Record<string, string> = {
  name: '客户名称',
  customer_name: '客户名称',
  contact: '联系人',
  contactPerson: '联系人',
  contact_person: '联系人',
  contactName: '联系人',
  phone: '联系电话',
  contact_phone: '联系电话',
  tel: '联系电话',
  email: '邮箱',
  address: '地址',
  projectName: '项目名称',
  project_name: '项目名称',
  company: '公司名称',
  company_name: '公司名称',
  tax_no: '税号',
  remark: '备注',
  notes: '备注',
};

/** 商务条款字段汉化映射 */
const TERMS_FIELD_MAP: Record<string, string> = {
  payment: '付款方式',
  payment_terms: '付款方式',
  delivery: '交货期',
  delivery_time: '交货期',
  validity: '有效期',
  validity_days: '有效期',
  warranty: '质保期',
  warranty_period: '质保期',
  currency: '币种',
  freight: '运费',
  tax: '税费',
  discount: '折扣',
  remark: '备注',
  remarks: '备注',
  notes: '备注',
};

function formatMoney(n: number): string {
  return `¥${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return '-';
  }
}

export default function QuotesPage() {
  const { loading: permLoading, canAccessModule, getFieldPermission } = usePermission();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 搜索和筛选
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // 对话框
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteDetail | null>(null);
  const [deleteQuote, setDeleteQuote] = useState<Quote | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 状态统计
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (keyword) params.set('keyword', keyword);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);

      const response = await fetch(`/api/admin/quotes?${params}`);
      const data = await response.json();

      if (data.success) {
        setQuotes(data.data || []);
        setTotalCount(data.total || 0);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
      } else {
        toast.error(data.error || '加载报价单失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [keyword, selectedStatus, page]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  // 当筛选条件变化时清空批量选择，避免跨页误操作
  useEffect(() => {
    setSelectedIds(new Set());
  }, [keyword, selectedStatus, page]);

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearFilters = () => {
    setKeyword('');
    setSearchInput('');
    setSelectedStatus('all');
    setPage(1);
  };

  // 查看详情
  const openDetail = async (quote: Quote) => {
    setDetailLoading(true);
    setDetailDialogOpen(true);
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`);
      const data = await response.json();
      if (data.success) {
        setSelectedQuote(data.data);
      } else {
        toast.error(data.error || '获取详情失败');
        setDetailDialogOpen(false);
      }
    } catch {
      toast.error('网络错误');
      setDetailDialogOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // 变更状态
  const handleStatusChange = async (quote: Quote, newStatus: string) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`报价单已更新为「${statusConfig[newStatus]?.label || newStatus}」`);
        loadQuotes();
      } else {
        toast.error(data.error || '状态变更失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除
  const openDeleteDialog = (quote: Quote) => {
    setDeleteQuote(quote);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteQuote) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/quotes/${deleteQuote.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast.success('报价单已删除');
        setDeleteDialogOpen(false);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteQuote.id);
          return next;
        });
        loadQuotes();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 批量选择
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === quotes.length && quotes.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(quotes.map((q) => q.id)));
    }
  };

  // 批量操作
  const draftSelected = useMemo(
    () => quotes.filter((q) => selectedIds.has(q.id) && q.status === 'draft'),
    [quotes, selectedIds]
  );

  const canBatchDelete = draftSelected.length === selectedIds.size && selectedIds.size > 0;
  const canBatchSend = draftSelected.length === selectedIds.size && selectedIds.size > 0;

  const handleBatchAction = async (action: 'delete' | 'send') => {
    if (selectedIds.size === 0) return;
    setBatchSubmitting(true);
    try {
      const response = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selectedIds) }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message || '批量操作成功');
        setSelectedIds(new Set());
        loadQuotes();
      } else {
        toast.error(data.error || '批量操作失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleBatchDeleteConfirm = () => {
    setBatchDeleteDialogOpen(false);
    handleBatchAction('delete');
  };

  // 复制编号
  const copyQuoteNumber = async (quoteNumber: string) => {
    try {
      await navigator.clipboard.writeText(quoteNumber);
      toast.success('报价编号已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  // 导出当前页（CSV，基于真实数据）
  const exportCurrentPage = () => {
    if (quotes.length === 0) {
      toast.info('没有可导出的数据');
      return;
    }
    const headers = ['报价编号', '客户名称', '产品数量', '金额', '状态', '创建者', '创建时间'];
    const rows = quotes.map((q) => [
      q.quoteNumber,
      q.customerName || '未填写',
      q.productCount,
      q.totalAmount,
      statusConfig[q.status]?.label || q.status,
      q.creatorName || '未填写',
      formatDateTime(q.createdAt),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `报价单_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status];
    if (!config) return <Badge variant="outline">{status}</Badge>;
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // 字段权限
  const fieldTotalAmount = getFieldPermission('totalAmount');
  const fieldCreatedAt = getFieldPermission('createdAt');
  const fieldStatus = getFieldPermission('status');

  // 权限检查：模块级控制，进入本页面的用户已具备操作权限（与原有行为一致）
  if (!permLoading && !canAccessModule('quote')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-1">无访问权限</h2>
        <p className="text-muted-foreground text-sm">您没有访问报价单管理的权限，请联系管理员</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">报价单管理</h1>
          <p className="text-sm text-muted-foreground">管理所有报价单，查看详情和变更状态</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCurrentPage}>
          <Download className="h-4 w-4 mr-1.5" />
          导出当前页
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${selectedStatus === 'all' ? 'ring-2 ring-primary/30' : ''}`}
          onClick={() => { setSelectedStatus('all'); setPage(1); }}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">全部报价</p>
                <p className="text-lg font-bold leading-tight">{statusCounts.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {statusList.map((s) => {
          const config = statusConfig[s];
          const active = selectedStatus === s;
          return (
            <Card
              key={s}
              className={`cursor-pointer transition-shadow hover:shadow-md ${active ? `ring-2 ring-offset-1 ${config.ring}` : ''}`}
              onClick={() => { setSelectedStatus(s); setPage(1); }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    {config.icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                    <p className="text-lg font-bold leading-tight">{statusCounts[s] || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 报价单列表 */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <CardTitle className="text-base font-semibold">报价单列表</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* 批量操作工具栏 */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 bg-muted/60 rounded-md px-2 py-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">已选 {selectedIds.size} 项</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!canBatchSend || batchSubmitting}
                    onClick={() => handleBatchAction('send')}
                    title={!canBatchSend ? '仅草稿状态可批量发送' : ''}
                  >
                    {batchSubmitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    批量发送
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    disabled={!canBatchDelete || batchSubmitting}
                    onClick={() => setBatchDeleteDialogOpen(true)}
                    title={!canBatchDelete ? '仅草稿状态可批量删除' : ''}
                  >
                    {batchSubmitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                    批量删除
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-3 w-3 mr-1" />
                    取消
                  </Button>
                </div>
              )}

              {/* 搜索和筛选 */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索报价编号或客户..."
                    className="pl-8 h-8 text-sm w-48 lg:w-64"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleSearch}>搜索</Button>
                {(keyword || selectedStatus !== 'all') && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                    清除
                  </Button>
                )}
                <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {keyword ? '没有找到匹配的报价单' : '暂无报价单数据'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-10 px-3">
                        <Checkbox
                          checked={quotes.length > 0 && selectedIds.size === quotes.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="全选"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">报价编号</TableHead>
                      <TableHead className="whitespace-nowrap">客户名称</TableHead>
                      <TableHead className="whitespace-nowrap">产品数量</TableHead>
                      {fieldTotalAmount.visible && <TableHead className="text-right whitespace-nowrap">金额</TableHead>}
                      {fieldStatus.visible && <TableHead className="whitespace-nowrap">状态</TableHead>}
                      <TableHead className="whitespace-nowrap">创建者</TableHead>
                      {fieldCreatedAt.visible && <TableHead className="whitespace-nowrap">创建时间</TableHead>}
                      <TableHead className="text-right whitespace-nowrap">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => {
                      const selected = selectedIds.has(quote.id);
                      return (
                        <TableRow key={quote.id} className="group" data-state={selected ? 'selected' : undefined}>
                          <TableCell className="px-3">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleSelect(quote.id)}
                              aria-label={`选择报价单 ${quote.quoteNumber}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openDetail(quote)}
                                className="font-medium text-blue-600 hover:underline text-sm"
                              >
                                {quote.quoteNumber}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyQuoteNumber(quote.quoteNumber)}
                                className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                title="复制编号"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={quote.customerName ? 'text-sm' : 'text-sm text-muted-foreground'}>
                              {quote.customerName || '未填写'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{quote.productCount} 项</TableCell>
                          {fieldTotalAmount.visible && (
                            <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                              {formatMoney(quote.totalAmount)}
                            </TableCell>
                          )}
                          {fieldStatus.visible && (
                            <TableCell>{getStatusBadge(quote.status)}</TableCell>
                          )}
                          <TableCell>
                            <span className="text-sm">{quote.creatorName || quote.creatorEmail || '未填写'}</span>
                          </TableCell>
                          {fieldCreatedAt.visible && (
                            <TableCell>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDateTime(quote.createdAt)}
                              </span>
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="查看详情"
                                onClick={() => openDetail(quote)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuLabel>报价操作</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openDetail(quote)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    查看详情
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyQuoteNumber(quote.quoteNumber)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    复制编号
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {quote.status === 'draft' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(quote, 'sent')}>
                                      <Send className="h-4 w-4 mr-2" />
                                      发送报价
                                    </DropdownMenuItem>
                                  )}
                                  {quote.status === 'sent' && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleStatusChange(quote, 'approved')}>
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        批准
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleStatusChange(quote, 'rejected')}>
                                        <XCircle className="h-4 w-4 mr-2" />
                                        拒绝
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {(quote.status === 'approved' || quote.status === 'rejected') && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(quote, 'draft')}>
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      退回草稿
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => openDeleteDialog(quote)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">
                    第 {page}/{totalPages} 页，共 {totalCount} 条
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      上一页
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 报价单详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              报价单详情 - {selectedQuote?.quoteNumber || ''}
            </DialogTitle>
            <DialogDescription>
              版本 {selectedQuote?.version || 1} | {getStatusBadge(selectedQuote?.status || 'draft')}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : selectedQuote ? (
            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">客户信息</h4>
                  <div className="space-y-1 text-sm">
                    {Object.entries(selectedQuote.customerInfo || {}).map(([key, val]) => (
                      <p key={key}><span className="text-muted-foreground">{CUSTOMER_FIELD_MAP[key] || key}：</span>{String(val) || '-'}</p>
                    ))}
                    {(!selectedQuote.customerInfo || Object.keys(selectedQuote.customerInfo).length === 0) && (
                      <p className="text-muted-foreground">未填写客户信息</p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">报价信息</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">创建者：</span>{selectedQuote.creatorName || '-'}</p>
                    <p><span className="text-muted-foreground">签发时间：</span>{formatDateTime(selectedQuote.issuedAt)}</p>
                    <p><span className="text-muted-foreground">创建时间：</span>{formatDateTime(selectedQuote.createdAt)}</p>
                    <p><span className="text-muted-foreground">更新时间：</span>{formatDateTime(selectedQuote.updatedAt)}</p>
                    <p><span className="text-muted-foreground">有效期至：</span>{selectedQuote.validUntil ? new Date(selectedQuote.validUntil).toLocaleDateString('zh-CN') : '-'}</p>
                  </div>
                </div>
              </div>

              {/* 产品清单 */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  产品清单（{selectedQuote.products?.length || 0} 项）
                </h4>
                {selectedQuote.products?.length > 0 ? (
                  <div className="overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">序号</TableHead>
                          <TableHead>产品名称</TableHead>
                          <TableHead>规格型号</TableHead>
                          <TableHead>品牌</TableHead>
                          <TableHead className="text-right">数量</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">单价</TableHead>
                          <TableHead className="text-right">总价</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedQuote.products.map((p: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{p.name || '-'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.model || p.parameter_description || '-'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.brand || '-'}</TableCell>
                            <TableCell className="text-right">{p.quantity}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.unit || '-'}</TableCell>
                            <TableCell className="text-right">{formatMoney(p.unitPrice || 0)}</TableCell>
                            <TableCell className="text-right font-medium">{formatMoney(p.totalPrice || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无产品数据</p>
                )}
              </div>

              {/* 费用汇总 */}
              <div className="bg-muted/40 rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">费用汇总</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>小计</span>
                    <span>{formatMoney(selectedQuote.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>税费（{selectedQuote.taxRate}%）</span>
                    <span>{formatMoney(selectedQuote.taxAmount)}</span>
                  </div>
                  {selectedQuote.discountRate > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>折扣（{selectedQuote.discountRate}%）</span>
                      <span>-{formatMoney(selectedQuote.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-medium text-base">
                    <span>总计</span>
                    <span className="text-primary">{formatMoney(selectedQuote.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* 商务条款 */}
              {selectedQuote.terms && Object.keys(selectedQuote.terms).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">商务条款</h4>
                  <div className="space-y-1 text-sm">
                    {Object.entries(selectedQuote.terms).map(([key, val]) => (
                      <p key={key}><span className="text-muted-foreground">{TERMS_FIELD_MAP[key] || key}：</span>{String(val) || '-'}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除报价单「{deleteQuote?.quoteNumber}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认对话框 */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>确认批量删除</DialogTitle>
            <DialogDescription>
              确定要删除选中的 {selectedIds.size} 条报价单吗？仅草稿状态可被删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialogOpen(false)} disabled={batchSubmitting}>取消</Button>
            <Button variant="destructive" onClick={handleBatchDeleteConfirm} disabled={batchSubmitting}>
              {batchSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
