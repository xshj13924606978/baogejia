'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Search, Eye, CheckCircle, XCircle, Loader2, Clock, FileText,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditItem {
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800' },
};

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 筛选
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');

  // 操作
  const [submitting, setSubmitting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectItem, setRejectItem] = useState<AuditItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AuditItem | null>(null);

  // 待审核数
  const [pendingCount, setPendingCount] = useState(0);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (keyword) params.set('keyword', keyword);

      const res = await fetch(`/api/admin/knowledge?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotal(data.total || 0);
        if (data.statusCounts) setPendingCount(data.statusCounts.pending || 0);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, keyword, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => { setKeyword(searchInput); setPage(1); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  // 审核通过
  const handleApprove = async (item: AuditItem) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`「${item.title}」已通过审核`);
        loadItems();
      } else { toast.error(data.error || '操作失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  // 审核拒绝
  const openReject = (item: AuditItem) => { setRejectItem(item); setRejectReason(''); setRejectOpen(true); };
  const handleReject = async () => {
    if (!rejectItem || !rejectReason.trim()) { toast.error('请填写拒绝原因'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${rejectItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', reject_reason: rejectReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`「${rejectItem.title}」已拒绝`);
        setRejectOpen(false);
        loadItems();
      } else { toast.error(data.error || '操作失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const openDetail = (item: AuditItem) => { setDetailItem(item); setDetailOpen(true); };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">内容审核</h1>
          <p className="text-gray-500">审核用户上传的知识条目</p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1">
            <Clock className="h-4 w-4 mr-1" />
            {pendingCount} 条待审核
          </Badge>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-lg"><Clock className="h-5 w-5 text-yellow-600" /></div>
              <div><p className="text-sm text-gray-500">待审核</p><p className="text-xl font-bold">{pendingCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">已通过</p><p className="text-xl font-bold text-green-600">{statusFilter === 'all' ? '-' : statusFilter === 'approved' ? total : '-'}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg"><XCircle className="h-5 w-5 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">已拒绝</p><p className="text-xl font-bold text-red-600">{statusFilter === 'all' ? '-' : statusFilter === 'rejected' ? total : '-'}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="搜索标题..." className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleKeyDown} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(keyword || statusFilter !== 'all' || typeFilter !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setStatusFilter('pending'); setTypeFilter('all'); setPage(1); }}>重置</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      <Card>
        <CardHeader><CardTitle className="text-lg">审核列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2">加载中...</span></div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <Database className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{statusFilter === 'pending' ? '没有待审核的内容' : '暂无数据'}</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>文件</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>上传者</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm max-w-[200px] truncate">{item.title}</p>
                            {item.description && <p className="text-xs text-muted-foreground max-w-[200px] truncate">{item.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TYPE_CONFIG[item.type]?.color || ''}>{TYPE_CONFIG[item.type]?.label || item.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            <span className="max-w-[100px] truncate">{item.fileName}</span>
                            <span>({formatFileSize(item.fileSize)})</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_CONFIG[item.status]?.color || ''}>{STATUS_CONFIG[item.status]?.label || item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.uploaderName}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => openDetail(item)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {item.status === 'pending' && (
                              <>
                                <Button variant="ghost" size="sm" className="h-8 text-green-600" onClick={() => handleApprove(item)} disabled={submitting}>
                                  <CheckCircle className="h-4 w-4 mr-1" />通过
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 text-red-600" onClick={() => openReject(item)}>
                                  <XCircle className="h-4 w-4 mr-1" />拒绝
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">第 {page}/{totalPages} 页，共 {total} 条</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 详情对话框 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>审核详情</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">标题：</span>{detailItem.title}</div>
                <div><span className="text-muted-foreground">类型：</span>{TYPE_CONFIG[detailItem.type]?.label}</div>
                <div><span className="text-muted-foreground">文件：</span>{detailItem.fileName}</div>
                <div><span className="text-muted-foreground">大小：</span>{formatFileSize(detailItem.fileSize)}</div>
                <div><span className="text-muted-foreground">状态：</span><Badge variant="outline" className={STATUS_CONFIG[detailItem.status]?.color}>{STATUS_CONFIG[detailItem.status]?.label}</Badge></div>
                <div><span className="text-muted-foreground">上传者：</span>{detailItem.uploaderName}</div>
              </div>
              {detailItem.description && <div><span className="text-muted-foreground">说明：</span>{detailItem.description}</div>}
              {detailItem.fileUrl && (
                <div><span className="text-muted-foreground">文件链接：</span><a href={detailItem.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">查看/下载</a></div>
              )}
              <div className="text-xs text-muted-foreground">提交时间：{new Date(detailItem.createdAt).toLocaleString('zh-CN')}</div>
              {detailItem.status === 'pending' && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" className="text-green-600" onClick={() => { setDetailOpen(false); handleApprove(detailItem); }} disabled={submitting}>
                    <CheckCircle className="h-4 w-4 mr-1" />通过审核
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => { setDetailOpen(false); openReject(detailItem); }}>
                    <XCircle className="h-4 w-4 mr-1" />拒绝
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 拒绝对话框 */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>拒绝审核</DialogTitle>
            <DialogDescription>拒绝「{rejectItem?.title}」需要填写原因</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>拒绝原因 <span className="text-destructive">*</span></Label>
            <textarea
              className="mt-2 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="请说明拒绝原因..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleReject} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
