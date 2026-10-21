'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  Search, MoreHorizontal, Eye, CheckCircle, XCircle, Trash2,
  FileText, Loader2, Clock, AlertCircle, Database, Upload, Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import FileDownloadButton from '@/components/knowledge-center/FileDownloadButton';
import { formatParseSummary } from '@/components/knowledge-center/knowledge-uploader';
import { getKnowledgeFileName } from '@/lib/knowledge/utils';

interface KnowledgeItem {
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
  uploaderId: string;
  createdAt: string;
  /** 解析全文（指令 2/3） */
  contentText?: string;
  /** 元数据（含 parse 解析摘要） */
  metadata?: any;
  rejectReason?: string;
}

interface StatusCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
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
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
  approved: { label: '已通过', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '?';
}

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 搜索和筛选
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 统计
  const [statusCounts, setStatusCounts] = useState<StatusCounts | null>(null);

  // 对话框
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (keyword) params.set('keyword', keyword);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/knowledge?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotal(data.total || 0);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [keyword, typeFilter, statusFilter, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => { setKeyword(searchInput); setPage(1); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  // 审核：通过直接提交；拒绝先输入意见
  const handleReview = (item: KnowledgeItem, newStatus: string) => {
    if (newStatus === 'rejected') {
      setSelectedItem(item);
      setRejectReason('');
      setRejectOpen(true);
      return;
    }
    doReview(item, 'approved', '');
  };

  const doReview = async (item: KnowledgeItem, newStatus: string, rejectReasonStr: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === 'rejected' && rejectReasonStr ? { reject_reason: rejectReasonStr } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newStatus === 'approved' ? '已通过审核' : '已拒绝');
        setRejectOpen(false);
        loadItems();
      } else { toast.error(data.error || '操作失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const handleConfirmReject = () => {
    if (!selectedItem) return;
    doReview(selectedItem, 'rejected', rejectReason.trim());
  };

  // 删除
  const openDelete = (item: KnowledgeItem) => { setSelectedItem(item); setDeleteOpen(true); };
  const handleDelete = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${selectedItem.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('已删除');
        setDeleteOpen(false);
        loadItems();
      } else { toast.error(data.error || '删除失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  // 查看详情
  const openDetail = (item: KnowledgeItem) => { setSelectedItem(item); setDetailOpen(true); };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
        <div>
          <h1 className="text-2xl font-bold">资料管理</h1>
          <p className="text-gray-500">管理用户上传的资料条目，审核、查看和删除</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/knowledge-center/document"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            上传资料
          </Link>
          <Link
            href="/admin/knowledge/import-config"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            导入配置
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      {statusCounts && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg"><Database className="h-5 w-5 text-blue-600" /></div>
                <div><p className="text-sm text-gray-500">全部</p><p className="text-xl font-bold">{statusCounts.total}</p></div>
              </div>
            </CardContent>
          </Card>
          {(['pending', 'approved', 'rejected'] as const).map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <Card key={s}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${cfg.color.split(' ')[0]}`}>{cfg.icon}</div>
                    <div><p className="text-sm text-gray-500">{cfg.label}</p><p className="text-xl font-bold">{statusCounts[s]}</p></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="搜索标题..." className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleKeyDown} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
              {(keyword || typeFilter !== 'all' || statusFilter !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setTypeFilter('all'); setStatusFilter('all'); setPage(1); }}>清除</Button>
              )}
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
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
        <CardHeader><CardTitle className="text-lg">资料条目</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2">加载中...</span></div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{keyword ? '没有匹配的条目' : '暂无资料条目'}</p>
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
                      <TableHead>大小</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>上传者</TableHead>
                      <TableHead>上传时间</TableHead>
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
                          <Badge variant="outline" className={TYPE_CONFIG[item.type]?.color || ''}>
                            {TYPE_CONFIG[item.type]?.label || item.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{getFileExtension(getKnowledgeFileName(item))}</span>
                            <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={getKnowledgeFileName(item)}>
                              {getKnowledgeFileName(item)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_CONFIG[item.status]?.color || ''}>
                            {STATUS_CONFIG[item.status]?.label || item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.uploaderName}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>操作</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openDetail(item)}><Eye className="h-4 w-4 mr-2" />查看详情</DropdownMenuItem>
                              {item.status === 'pending' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-green-600" onClick={() => handleReview(item, 'approved')}>
                                    <CheckCircle className="h-4 w-4 mr-2" />通过审核
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-red-600" onClick={() => handleReview(item, 'rejected')}>
                                    <XCircle className="h-4 w-4 mr-2" />拒绝
                                  </DropdownMenuItem>
                                </>
                              )}
                              {item.status === 'rejected' && (
                                <DropdownMenuItem className="text-green-600" onClick={() => handleReview(item, 'approved')}>
                                  <CheckCircle className="h-4 w-4 mr-2" />重新通过
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => openDelete(item)}>
                                <Trash2 className="h-4 w-4 mr-2" />删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
          <DialogHeader>
            <DialogTitle>资料条目详情</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">标题：</span>{selectedItem.title}</div>
                <div><span className="text-muted-foreground">类型：</span>{TYPE_CONFIG[selectedItem.type]?.label || selectedItem.type}</div>
                <div><span className="text-muted-foreground">文件名：</span>{getKnowledgeFileName(selectedItem)}</div>
                <div><span className="text-muted-foreground">大小：</span>{formatFileSize(selectedItem.fileSize)}</div>
                <div><span className="text-muted-foreground">状态：</span>
                  <Badge variant="outline" className={STATUS_CONFIG[selectedItem.status]?.color || ''}>{STATUS_CONFIG[selectedItem.status]?.label}</Badge>
                </div>
                <div><span className="text-muted-foreground">上传者：</span>{selectedItem.uploaderName}</div>
                <div className="col-span-2"><span className="text-muted-foreground">说明：</span>{selectedItem.description || '-'}</div>
                <div><span className="text-muted-foreground">上传时间：</span>{new Date(selectedItem.createdAt).toLocaleString('zh-CN')}</div>
              </div>

              {/* 附件下载（指令 2/3：服务端流式下载） */}
              {selectedItem.fileUrl && (
                <div className="flex items-center gap-3">
                  <FileDownloadButton entryId={selectedItem.id} fileName={getKnowledgeFileName(selectedItem)}>下载附件</FileDownloadButton>
                  <a href={selectedItem.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                    查看/下载文件
                  </a>
                </div>
              )}

              {/* 解析信息（指令 2/3） */}
              {selectedItem.metadata?.parse && (
                <div className="bg-gray-50 border rounded p-3 text-sm">
                  <p className="font-medium text-gray-700 mb-2">解析信息</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
                    <div>识别格式：<span className="font-medium">{String(selectedItem.metadata.parse.format || 'unknown').toUpperCase()}</span></div>
                    {typeof selectedItem.metadata.parse.pages === 'number' && <div>页数：{selectedItem.metadata.parse.pages}</div>}
                    {typeof selectedItem.metadata.parse.characters === 'number' && <div>文本字数：{selectedItem.metadata.parse.characters}</div>}
                    {typeof selectedItem.metadata.parse.width === 'number' && <div>尺寸：{selectedItem.metadata.parse.width}×{selectedItem.metadata.parse.height}px</div>}
                    {typeof selectedItem.metadata.parse.sheets === 'number' && <div>工作表：{selectedItem.metadata.parse.sheets}</div>}
                    {typeof selectedItem.metadata.parse.rows === 'number' && <div>数据行：{selectedItem.metadata.parse.rows}</div>}
                    {typeof selectedItem.metadata.parse.entities === 'number' && <div>文本实体：{selectedItem.metadata.parse.entities}</div>}
                    {selectedItem.metadata.parse.error && (
                      <div className="col-span-2 text-amber-600">提示：{selectedItem.metadata.parse.error}</div>
                    )}
                  </div>
                  {formatParseSummary(selectedItem.metadata.parse) && (
                    <p className="mt-2 text-xs text-emerald-600">{formatParseSummary(selectedItem.metadata.parse)}</p>
                  )}
                </div>
              )}

              {/* 向量化状态（指令 2/3 阶段 C） */}
              {selectedItem.metadata?.embedding && (
                <div className="bg-gray-50 border rounded p-3 text-sm">
                  <p className="font-medium text-gray-700 mb-2">向量化</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                    {selectedItem.metadata.embedding.status === 'ok' ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">已向量化</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">未向量化</span>
                    )}
                    {selectedItem.metadata.embedding.model && (
                      <span>模型：{selectedItem.metadata.embedding.model}</span>
                    )}
                    {typeof selectedItem.metadata.embedding.dim === 'number' && (
                      <span>维度：{selectedItem.metadata.embedding.dim}</span>
                    )}
                    {selectedItem.metadata.embedding.reason && (
                      <span className="text-amber-600">原因：{selectedItem.metadata.embedding.reason}</span>
                    )}
                    {selectedItem.metadata.embedding.generated_at && (
                      <span className="text-gray-400">
                        时间：{new Date(selectedItem.metadata.embedding.generated_at).toLocaleString('zh-CN')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 拒绝原因 */}
              {selectedItem.status === 'rejected' && selectedItem.rejectReason && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2.5">
                  <span className="font-medium">拒绝原因：</span>{selectedItem.rejectReason}
                </div>
              )}

              {/* 内容预览（解析全文） */}
              {selectedItem.contentText && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">内容预览</p>
                  <pre className="text-xs text-gray-600 bg-gray-50 border rounded p-2.5 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedItem.contentText.slice(0, 800)}{selectedItem.contentText.length > 800 ? '…' : ''}
                  </pre>
                </div>
              )}

              {/* 附件预览（图片/PDF） */}
              {selectedItem.fileUrl && selectedItem.fileType && (
                selectedItem.fileType.startsWith('image/')
                  ? (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">附件预览</p>
                      <img src={selectedItem.fileUrl} alt={getKnowledgeFileName(selectedItem)} className="max-h-64 object-contain border rounded mx-auto" />
                    </div>
                  )
                  : getKnowledgeFileName(selectedItem).toLowerCase().endsWith('.pdf')
                    ? (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">附件预览</p>
                        <iframe src={selectedItem.fileUrl} className="w-full h-64 border rounded" title="PDF预览" />
                      </div>
                    )
                    : null
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除「{selectedItem?.title}」吗？存储文件也会被删除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 拒绝审核（输入意见） */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>拒绝审核</DialogTitle>
            <DialogDescription>
              拒绝「{selectedItem?.title}」，请填写拒绝原因（用户可见）
            </DialogDescription>
          </DialogHeader>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="例如：资料不完整，请补充规格参数"
            disabled={submitting}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={submitting}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmReject} disabled={submitting || !rejectReason.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
