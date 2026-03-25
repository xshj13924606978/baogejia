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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Search, Eye, CheckCircle, XCircle, Loader2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditHistoryItem {
  id: string;
  type: string;
  title: string;
  description: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  status: string;
  uploaderName: string;
  reviewedAt: string;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  price: { label: '价格库', color: 'bg-blue-100 text-blue-800' },
  document: { label: '文档库', color: 'bg-green-100 text-green-800' },
  case: { label: '案例库', color: 'bg-purple-100 text-purple-800' },
  standard: { label: '标准库', color: 'bg-orange-100 text-orange-800' },
  drawing: { label: '图纸库', color: 'bg-cyan-100 text-cyan-800' },
  quota: { label: '定额库', color: 'bg-pink-100 text-pink-800' },
  other: { label: '其他', color: 'bg-gray-100 text-gray-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  approved: { label: '已通过', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3.5 w-3.5" /> },
};

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export default function AuditHistoryPage() {
  const [items, setItems] = useState<AuditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AuditHistoryItem | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      // 审核历史默认查全部已审核的，不含 pending
      if (statusFilter === 'approved') params.set('status', 'approved');
      else if (statusFilter === 'rejected') params.set('status', 'rejected');
      else {
        // all: 查 approved 和 rejected
        params.set('status', 'approved,rejected');
      }
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (keyword) params.set('keyword', keyword);

      const res = await fetch(`/api/admin/knowledge?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotal(data.total || 0);
      } else {
        toast.error(data.error || '加载审核历史失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, keyword]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => { setKeyword(searchInput); setPage(1); };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">审核历史</h1>
          <p className="text-gray-500">查看已审核通过的资料和被拒绝的记录</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadItems}>
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已通过</p>
              <p className="text-xl font-bold text-green-600">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已拒绝</p>
              <p className="text-xl font-bold text-red-600">-</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索资料名称..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
              {keyword && (
                <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setPage(1); }}>
                  清除
                </Button>
              )}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-lg">审核记录</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {keyword ? '没有匹配的记录' : '暂无审核历史'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>资料名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>上传者</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead>审核时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
                      const statusCfg = STATUS_CONFIG[item.status];
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{item.title}</span>
                              {item.fileName && (
                                <p className="text-xs text-gray-400 mt-0.5">{item.fileName}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={typeCfg.color}>{typeCfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{item.uploaderName || '-'}</TableCell>
                          <TableCell>
                            {statusCfg && (
                              <Badge variant="outline" className={`${statusCfg.color} flex items-center gap-1 w-fit`}>
                                {statusCfg.icon}
                                {statusCfg.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{formatDate(item.createdAt)}</TableCell>
                          <TableCell className="text-sm text-gray-500">{formatDate(item.reviewedAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDetailItem(item); setDetailOpen(true); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    第 {page}/{totalPages} 页，共 {total} 条
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

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailItem?.title || '资料详情'}</DialogTitle>
            <DialogDescription>审核记录详情</DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">类型：</span>
                  <Badge variant="outline" className={TYPE_CONFIG[detailItem.type]?.color}>
                    {TYPE_CONFIG[detailItem.type]?.label || '其他'}
                  </Badge>
                </div>
                <div>
                  <span className="text-gray-500">状态：</span>
                  <Badge variant="outline" className={STATUS_CONFIG[detailItem.status]?.color}>
                    {STATUS_CONFIG[detailItem.status]?.label || detailItem.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-gray-500">上传者：</span>
                  <span>{detailItem.uploaderName || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">文件大小：</span>
                  <span>{formatFileSize(detailItem.fileSize)}</span>
                </div>
                <div>
                  <span className="text-gray-500">提交时间：</span>
                  <span>{formatDate(detailItem.createdAt)}</span>
                </div>
                <div>
                  <span className="text-gray-500">审核时间：</span>
                  <span>{formatDate(detailItem.reviewedAt)}</span>
                </div>
              </div>
              {detailItem.description && (
                <div className="text-sm">
                  <span className="text-gray-500">描述：</span>
                  <p className="mt-1 p-2 bg-gray-50 rounded text-gray-700">{detailItem.description}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
