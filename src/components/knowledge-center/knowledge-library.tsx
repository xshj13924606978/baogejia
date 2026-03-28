'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Search, Upload, Download, Edit, Trash2, Eye, Loader2,
  FileText, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminUploadDialog } from './admin-upload-dialog';
import { getMetadataColumns } from './metadata-columns';

interface KnowledgeLibraryProps {
  title: string;
  type: string;
  search?: string;
}

interface KnowledgeItem {
  id: string;
  type: string;
  title: string;
  description: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  content: string;
  metadata: Record<string, any>;
  tags: string[];
  status: string;
  uploaderName: string;
  uploaderId: string;
  createdAt: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending:  { label: '待审核', variant: 'secondary', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '已通过', variant: 'default', className: 'bg-green-100 text-green-700' },
  rejected: { label: '已拒绝', variant: 'destructive', className: 'bg-red-100 text-red-700' },
};

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

export default function KnowledgeLibrary({ title, type, search: externalSearch }: KnowledgeLibraryProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState(externalSearch || '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [viewItem, setViewItem] = useState<KnowledgeItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        page: String(page),
        limit: String(pageSize),
      });
      if (keyword) params.set('keyword', keyword);
      if (status) params.set('status', status);
      if (externalSearch) params.set('keyword', externalSearch);

      const res = await fetch(`/api/admin/knowledge?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotal(data.total || 0);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [type, page, pageSize, keyword, status, externalSearch]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => { setPage(1); }, [keyword, status, externalSearch]);

  const handleApprove = async (id: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: approve ? 'approved' : 'rejected' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(approve ? '已通过审核' : '已拒绝');
        fetchItems();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('已删除');
        fetchItems();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* 标题和操作栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchItems()}>
            <RefreshCw className="h-4 w-4 mr-1" /> 刷新
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> 上传
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索标题..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mb-2 opacity-30" />
            <p className="font-medium">暂无数据</p>
            <p className="text-sm">点击"上传"按钮添加新内容</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">标题</TableHead>
                <TableHead>文件名</TableHead>
                <TableHead>大小</TableHead>
                {getMetadataColumns(type).map(col => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
                <TableHead>上传者</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>上传时间</TableHead>
                <TableHead className="w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium line-clamp-1">{item.title}</span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground line-clamp-1">{item.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[200px] inline-block truncate">
                        {item.fileName}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatFileSize(item.fileSize)}
                    </TableCell>
                    {getMetadataColumns(type).map(col => (
                      <TableCell key={col.key} className="text-sm">
                        {col.render(item.metadata?.[col.key])}
                      </TableCell>
                    ))}
                    <TableCell className="text-sm">{item.uploaderName}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant} className={`text-xs ${st.className}`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(item.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewItem(item)} title="查看">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {item.fileUrl && (
                          <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="下载">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {item.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => handleApprove(item.id, true)}>
                                  通过审核
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleApprove(item.id, false)} className="text-destructive">
                                  拒绝
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-destructive" disabled={deleting === item.id}>
                              {deleting === item.id ? '删除中...' : '删除'}
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
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 查看详情弹窗 */}
      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewItem?.title}</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">类型：</span>{viewItem.type}</div>
                <div><span className="text-muted-foreground">状态：</span>
                  <Badge variant={STATUS_MAP[viewItem.status]?.variant || 'secondary'} className={`text-xs ${STATUS_MAP[viewItem.status]?.className || ''}`}>
                    {STATUS_MAP[viewItem.status]?.label || viewItem.status}
                  </Badge>
                </div>
                <div><span className="text-muted-foreground">文件：</span>{viewItem.fileName}</div>
                <div><span className="text-muted-foreground">大小：</span>{formatFileSize(viewItem.fileSize)}</div>
                <div><span className="text-muted-foreground">上传者：</span>{viewItem.uploaderName}</div>
                <div><span className="text-muted-foreground">时间：</span>{formatDate(viewItem.createdAt)}</div>
              </div>
              {viewItem.description && (
                <div className="text-sm"><span className="text-muted-foreground">描述：</span>{viewItem.description}</div>
              )}
              {viewItem.metadata && Object.keys(viewItem.metadata).length > 0 && (
                <div className="space-y-1 text-sm border-t pt-2 mt-2">
                  <span className="text-muted-foreground">分类信息：</span>
                  {Object.entries(viewItem.metadata).map(([key, val]) => (
                    <div key={key} className="text-xs">
                      <span className="text-muted-foreground">{key}：</span>{String(val)}
                    </div>
                  ))}
                </div>
              )}
              {viewItem.tags && viewItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {viewItem.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {viewItem?.fileUrl && (
              <a href={viewItem.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button><Download className="h-4 w-4 mr-1" /> 下载文件</Button>
              </a>
            )}
            <Button variant="outline" onClick={() => setViewItem(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 上传弹窗 */}
      <AdminUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        type={type}
        onSuccess={fetchItems}
      />
    </div>
  );
}
