'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-800', icon: <FileText className="h-4 w-4" /> },
  pending_review: { label: '待审核', color: 'bg-yellow-100 text-yellow-800', icon: <AlertCircle className="h-4 w-4" /> },
  approved: { label: '已批准', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-4 w-4" /> },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-800', icon: <Send className="h-4 w-4" /> },
};

export default function QuotesPage() {
  const { loading: permLoading, canAccessModule, getFieldPermission, canUseAction } = usePermission();

  // 模块级权限检查
  if (!permLoading && !canAccessModule('quote')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-1">无访问权限</h2>
        <p className="text-muted-foreground text-sm">您没有访问报价单管理的权限，请联系管理员</p>
      </div>
    );
  }

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 搜索和筛选
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // 对话框
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
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
  const fieldCreatorName = getFieldPermission('creatorName');
  const fieldCreatedAt = getFieldPermission('createdAt');
  const fieldStatus = getFieldPermission('status');

  // 按钮权限
  const canView = canUseAction('quote_list_view');
  const canSend = canUseAction('quote_list_send');
  const canApprove = canUseAction('quote_list_approve');
  const canReject = canUseAction('quote_list_reject');
  const canRevert = canUseAction('quote_list_revert');
  const canDelete = canUseAction('quote_list_delete');

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">报价单管理</h1>
          <p className="text-gray-500">管理所有报价单，查看详情和变更状态</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <ClipboardList className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">全部报价</p>
                <p className="text-xl font-bold">{statusCounts.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {['draft', 'sent', 'approved', 'rejected'].map((s) => {
          const config = statusConfig[s];
          return (
            <Card key={s}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.color.split(' ')[0]}`}>
                    {config.icon}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{config.label}</p>
                    <p className="text-xl font-bold">{statusCounts[s] || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索报价编号..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
              {(keyword || selectedStatus !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setKeyword(''); setSearchInput(''); setSelectedStatus('all'); setPage(1);
                }}>清除</Button>
              )}
              <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[130px]">
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
        </CardContent>
      </Card>

      {/* 报价单列表 */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-lg">报价单列表</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
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
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>报价编号</TableHead>
                      <TableHead>客户名称</TableHead>
                      <TableHead>产品数量</TableHead>
                      {fieldTotalAmount.visible && <TableHead className="text-right">金额</TableHead>}
                      {fieldStatus.visible && <TableHead>状态</TableHead>}
                      {fieldCreatorName.visible && <TableHead>创建者</TableHead>}
                      {fieldCreatedAt.visible && <TableHead>创建时间</TableHead>}
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => (
                      <TableRow key={quote.id}>
                        <TableCell>
                          <span className="font-medium text-blue-600">{quote.quoteNumber}</span>
                        </TableCell>
                        <TableCell>
                          {quote.customerName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{quote.productCount} 项</TableCell>
                        {fieldTotalAmount.visible && (
                        <TableCell className="text-right font-medium">
                          ¥{quote.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        )}
                        {fieldStatus.visible && <TableCell>{getStatusBadge(quote.status)}</TableCell>}
                        {fieldCreatorName.visible && (
                        <TableCell>
                          <div>
                            <p className="text-sm">{quote.creatorName || '-'}</p>
                          </div>
                        </TableCell>
                        )}
                        {fieldCreatedAt.visible && (
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(quote.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </TableCell>
                        )}
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>报价操作</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {canView && (
                                <DropdownMenuItem onClick={() => openDetail(quote)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  查看详情
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {quote.status === 'draft' && canSend && (
                                <DropdownMenuItem onClick={() => handleStatusChange(quote, 'sent')}>
                                  <Send className="h-4 w-4 mr-2" />
                                  发送报价
                                </DropdownMenuItem>
                              )}
                              {quote.status === 'sent' && (
                                <>
                                  {canApprove && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(quote, 'approved')}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      批准
                                    </DropdownMenuItem>
                                  )}
                                  {canReject && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(quote, 'rejected')}>
                                      <XCircle className="h-4 w-4 mr-2" />
                                      拒绝
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              {(quote.status === 'approved' || quote.status === 'rejected') && canRevert && (
                                <DropdownMenuItem onClick={() => handleStatusChange(quote, 'draft')}>
                                  <FileText className="h-4 w-4 mr-2" />
                                  退回草稿
                                </DropdownMenuItem>
                              )}
                              {(canView || canSend || canApprove || canReject || canRevert || canDelete) && (
                                <>
                                  <DropdownMenuSeparator />
                                  {canDelete && (
                                    <DropdownMenuItem className="text-red-600" onClick={() => openDeleteDialog(quote)}>
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      删除
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    第 {page}/{totalPages} 页，共 {totalCount} 条
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      上一页
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">客户信息</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">客户名称：</span>{selectedQuote.customerInfo?.name || '-'}</p>
                    <p><span className="text-muted-foreground">联系电话：</span>{selectedQuote.customerInfo?.phone || '-'}</p>
                    <p><span className="text-muted-foreground">地址：</span>{selectedQuote.customerInfo?.address || '-'}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">报价信息</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">创建者：</span>{selectedQuote.creatorName}</p>
                    <p><span className="text-muted-foreground">创建时间：</span>{new Date(selectedQuote.createdAt).toLocaleString('zh-CN')}</p>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>产品名称</TableHead>
                        <TableHead>规格型号</TableHead>
                        <TableHead className="text-right">数量</TableHead>
                        <TableHead className="text-right">单价</TableHead>
                        <TableHead className="text-right">总价</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedQuote.products.map((p: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.name || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.model || p.parameter_description || '-'}</TableCell>
                          <TableCell className="text-right">{p.quantity}</TableCell>
                          <TableCell className="text-right">¥{p.unitPrice?.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">¥{p.totalPrice?.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">无产品数据</p>
                )}
              </div>

              {/* 费用汇总 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">费用汇总</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>小计</span>
                    <span>¥{selectedQuote.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>税费（{selectedQuote.taxRate}%）</span>
                    <span>¥{selectedQuote.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-medium text-lg">
                    <span>总计</span>
                    <span className="text-blue-600">¥{selectedQuote.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* 商务条款 */}
              {selectedQuote.terms && Object.keys(selectedQuote.terms).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">商务条款</h4>
                  <div className="space-y-1 text-sm">
                    {selectedQuote.terms.payment && <p><span className="text-muted-foreground">付款方式：</span>{selectedQuote.terms.payment}</p>}
                    {selectedQuote.terms.delivery && <p><span className="text-muted-foreground">交货方式：</span>{selectedQuote.terms.delivery}</p>}
                    {selectedQuote.terms.warranty && <p><span className="text-muted-foreground">质保条款：</span>{selectedQuote.terms.warranty}</p>}
                    {selectedQuote.terms.validity && <p><span className="text-muted-foreground">报价有效期：</span>{selectedQuote.terms.validity}</p>}
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
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
