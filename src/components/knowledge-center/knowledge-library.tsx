'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Search, Upload, Download, Edit, Eye, Loader2,
  FileText, ChevronLeft, ChevronRight, RefreshCw,
  CheckCircle2, XCircle, Trash2, BookOpen, ListChecks,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { METADATA_FIELDS } from './admin-upload-dialog';
import KnowledgeUploader from './knowledge-uploader';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { getMetadataColumns } from './metadata-columns';
import { usePermission } from '@/hooks/usePermission';
import { trackUserAction } from '@/lib/user-log-tracker';
import FileDownloadButton from './FileDownloadButton';
import { cn } from '@/lib/utils';
import { getKnowledgeFileName } from '@/lib/knowledge/utils';
import { formatDateTime } from '@/lib/date-utils';

interface KnowledgeLibraryProps {
  title: string;
  type: string;
  search?: string;
  /** 在管理端等受信任环境下强制启用上传入口（不依赖业务权限校验） */
  forceCanEdit?: boolean;
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


export default function KnowledgeLibrary({ title, type, search: externalSearch, forceCanEdit }: KnowledgeLibraryProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState(externalSearch || '');
  // 搜索防抖 500ms（#[20260825-2350-1] 优化；#[20260901-1100] P2-11 收敛到共享 Hook）
  const debouncedKeyword = useDebouncedValue(keyword, 500);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const { canUseAction } = usePermission();
  const canEdit = forceCanEdit || canUseAction('knowledge:edit');
  const canDelete = canUseAction('knowledge:delete');
  const canDownload = canUseAction('knowledge:download');

  const [viewItem, setViewItem] = useState<KnowledgeItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 批量操作状态（#[20260825-2350] 复核优化）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<'approve' | 'reject' | 'delete' | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // 单条删除二次确认（#[20260825-2350] 复核优化，避免误删）
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 统一上传流程（管理端身份上传 → 后端自动置为 approved）
  const { uploadFile, uploading, progress: uploadProgress } = useKnowledgeUpload(type as any);
  const uploadMetadataFields = useMemo(() => {
    const fields = METADATA_FIELDS[type] || [];
    return fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.kind,
      options: f.options,
      placeholder: f.placeholder,
    }));
  }, [type]);

  // 文档详情相关推荐（#20260822-2242 指令 3/3）
  const [recommendations, setRecommendations] = useState<
    { id: string; title: string; type: string; summary?: string; relevance_score: number }[]
  >([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // 打开详情时按标题+标签匹配相关文档（排除自身，Top-3）
  useEffect(() => {
    let cancelled = false;
    if (!viewItem?.id) {
      setRecommendations([]);
      return;
    }
    const loadRecommendations = async () => {
      setLoadingRecommendations(true);
      try {
        const headers = await getClientAuthHeaders();
        const query = [viewItem.title, ...(viewItem.tags || [])].filter(Boolean).join(' ').slice(0, 200);
        const res = await fetch('/api/knowledge/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            query,
            moduleTypes: [viewItem.type],
            limit: 3,
            excludeId: viewItem.id,
          }),
        });
        const data = await res.json();
        if (!cancelled) {
          setRecommendations(data.success ? data.results || [] : []);
        }
      } catch {
        if (!cancelled) setRecommendations([]);
      } finally {
        if (!cancelled) setLoadingRecommendations(false);
      }
    };
    loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [viewItem?.id, viewItem?.title, viewItem?.tags, viewItem?.type]);

  // 点击推荐项 → 切换详情查看
  const openRecommendation = useCallback(
    (id: string) => {
      const target = items.find((it) => it.id === id);
      if (target) setViewItem(target);
    },
    [items]
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        page: String(page),
        limit: String(pageSize),
      });
      const effectiveKeyword = externalSearch || debouncedKeyword;
      if (effectiveKeyword) params.set('keyword', effectiveKeyword);
      if (status) params.set('status', status);

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
  }, [type, page, pageSize, debouncedKeyword, status, externalSearch]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => { setPage(1); }, [keyword, status, externalSearch]);

  const handleUpload = async (params: {
    file: File;
    title: string;
    description: string;
    metadata: Record<string, any>;
    tags: string[];
    onProgress?: (percent: number) => void;
  }) => {
    try {
      const result = await uploadFile(params);
      if (result.success) {
        toast.success(result.message || '上传成功');
        setUploadOpen(false);
        fetchItems();
        trackUserAction('upload', {
          type,
          title: params.title,
          fileName: params.file.name,
        });
      } else {
        toast.error(result.error || '上传失败');
        throw new Error(result.error || '上传失败');
      }
    } catch (err: any) {
      throw err;
    }
  };

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

  // 单条删除：先弹确认，再实际请求（#[20260825-2350]）
  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
    setConfirmDeleteOpen(true);
  };
  const doDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('已删除');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
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

  // 批量操作（#[20260825-2350]）—— 调用 /api/admin/knowledge/batch
  const handleToggleOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );
  const someOnPageSelected = useMemo(
    () => items.some((it) => selectedIds.has(it.id)) && !allOnPageSelected,
    [items, selectedIds, allOnPageSelected]
  );
  const handleToggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) items.forEach((it) => next.add(it.id));
        else items.forEach((it) => next.delete(it.id));
        return next;
      });
    },
    [items]
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openBatchConfirm = (action: 'approve' | 'reject' | 'delete') => {
    if (selectedIds.size === 0) return;
    setBatchAction(action);
    setBatchOpen(true);
  };
  const handleBatchConfirm = async () => {
    if (!batchAction || selectedIds.size === 0) return;
    setBatchSubmitting(true);
    try {
      const res = await fetch('/api/admin/knowledge/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: batchAction,
          ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const cnt = selectedIds.size;
        toast.success(
          batchAction === 'approve'
            ? `已通过 ${cnt} 项`
            : batchAction === 'reject'
              ? `已拒绝 ${cnt} 项`
              : `已删除 ${cnt} 项`
        );
        clearSelection();
        setBatchOpen(false);
        setBatchAction(null);
        fetchItems();
      } else {
        toast.error(data.error || '批量操作失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBatchSubmitting(false);
    }
  };

  // 切换筛选/翻页时清空选择，避免跨页误选（#[20260825-2350]）
  useEffect(() => {
    clearSelection();
  }, [keyword, status, page, type, clearSelection]);

  // 当页数据实时统计（仅基于当前页，不跨页汇总；避免硬编码虚假统计）
  const pageStats = useMemo(() => {
    const pending = items.filter((it) => it.status === 'pending').length;
    const approved = items.filter((it) => it.status === 'approved').length;
    const rejected = items.filter((it) => it.status === 'rejected').length;
    return { pending, approved, rejected };
  }, [items]);

  const totalPages = Math.ceil(total / pageSize);

  const hasFilters = Boolean(keyword || status);
  const resetFilters = () => {
    setKeyword('');
    // #[20260901-1100] debouncedKeyword 由 useDebouncedValue 派生，keyword 置空后自动跟进，无需手动重置
    setStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* 标题 / 操作 / 当页统计（#[20260825-2350] 头部卡片化） */}
      <Card className="overflow-hidden border-slate-200/80 dark:border-slate-700/60 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 text-white shadow-md shrink-0">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
                <p className="text-sm text-muted-foreground">
                  集中管理 {title} 内容，支持查看、下载、审核、批量处理。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchItems()}
                disabled={loading}
                aria-label="刷新列表"
                title="刷新列表"
              >
                <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
                刷新
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-sm">
                  <Upload className="h-4 w-4 mr-1" /> 上传
                </Button>
              )}
            </div>
          </div>
          {/* 当页状态分布（仅基于当前页数据，源自后端真实响应，不硬编码） */}
          {!loading && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/40 px-5 py-3 text-xs">
              <span className="text-muted-foreground">本页：</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5 font-medium">
                待审核 {pageStats.pending}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 font-medium">
                已通过 {pageStats.approved}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">
                已拒绝 {pageStats.rejected}
              </span>
              <span className="ml-auto text-muted-foreground">
                共 {total} 条 · 第 {page} / {Math.max(totalPages, 1)} 页
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 筛选栏（紧凑卡片） */}
      <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="搜索标题..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9 pr-9"
            />
            {keyword !== debouncedKeyword && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>
          <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待审核</SelectItem>
              <SelectItem value="approved">已通过</SelectItem>
              <SelectItem value="rejected">已拒绝</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重置
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 批量操作栏（仅在有选中且有权限时展示，#[20260825-2350]） */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/90 px-4 py-2.5 text-sm shadow-sm backdrop-blur dark:border-blue-800/60 dark:bg-blue-950/40">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-200">
            <ListChecks className="h-4 w-4" />
            已选 <strong>{selectedIds.size}</strong> 项
            {someOnPageSelected && (
              <Button variant="link" size="sm" className="h-auto p-0 text-blue-700 dark:text-blue-200" onClick={() => handleToggleAll(true)}>
                全选当页
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              取消选择
            </Button>
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/40"
                  onClick={() => openBatchConfirm('approve')}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> 批量通过
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/40"
                  onClick={() => openBatchConfirm('reject')}
                >
                  <XCircle className="h-4 w-4 mr-1" /> 批量拒绝
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                onClick={() => openBatchConfirm('delete')}
              >
                <Trash2 className="h-4 w-4 mr-1" /> 批量删除
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm">加载中...</p>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40">
              <FileText className="h-8 w-8 text-indigo-400" />
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-300 mt-2">暂无数据</p>
            <p className="text-sm">
              {hasFilters ? '当前筛选条件下无结果，可尝试重置筛选。' : '点击右上角"上传"按钮添加新内容'}
            </p>
            {hasFilters && (
              <Button variant="outline" size="sm" className="mt-1" onClick={resetFilters}>
                重置筛选
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)', minHeight: 300 }}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95 shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={
                        allOnPageSelected
                          ? true
                          : someOnPageSelected
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={(value) => handleToggleAll(Boolean(value))}
                      aria-label="全选当前页"
                    />
                  </TableHead>
                  <TableHead className="min-w-[240px]">标题</TableHead>
                  <TableHead className="min-w-[180px]">文件名</TableHead>
                  <TableHead className="w-[90px]">大小</TableHead>
                  {getMetadataColumns(type).map(col => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                  <TableHead className="min-w-[100px]">上传者</TableHead>
                  <TableHead className="w-[100px]">状态</TableHead>
                  <TableHead className="w-[150px]">上传时间</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <TableRow
                      key={item.id}
                      data-state={isSelected ? 'selected' : undefined}
                      className={cn(
                        'transition-colors',
                        isSelected && 'bg-indigo-50/70 hover:bg-indigo-50 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/40'
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(value) => handleToggleOne(item.id, Boolean(value))}
                          aria-label={`选择 ${item.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium line-clamp-1 text-slate-900 dark:text-slate-100">{item.title}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground line-clamp-1">{item.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[220px] inline-block truncate align-middle" title={getKnowledgeFileName(item)}>
                          {getKnowledgeFileName(item)}
                        </code>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatFileSize(item.fileSize)}
                      </TableCell>
                      {getMetadataColumns(type).map(col => (
                        <TableCell key={col.key} className="text-sm">
                          {col.render(item.metadata?.[col.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-sm whitespace-nowrap">{item.uploaderName}</TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className={cn('text-xs whitespace-nowrap', st.className)}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setViewItem(item); trackUserAction('view', { entry_id: item.id, title: item.title }); }} title="查看">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {item.fileUrl && canDownload && (
                            <FileDownloadButton
                              entryId={item.id}
                              fileName={getKnowledgeFileName(item)}
                              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8')}
                            >
                              <Download className="h-4 w-4" />
                            </FileDownloadButton>
                          )}
                          {(canEdit || canDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEdit && item.status === 'pending' && (
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
                                {canDelete && (
                                  <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-destructive" disabled={deleting === item.id}>
                                    {deleting === item.id ? '删除中...' : '删除'}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* 分页（即使只有 1 页也展示统计信息） */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            {selectedIds.size > 0 ? (
              <span className="text-indigo-600 dark:text-indigo-300">
                已选 {selectedIds.size} 项
              </span>
            ) : (
              <span>共 {total} 条</span>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 tabular-nums">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
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
                <div><span className="text-muted-foreground">文件：</span>{getKnowledgeFileName(viewItem)}</div>
                <div><span className="text-muted-foreground">大小：</span>{formatFileSize(viewItem.fileSize)}</div>
                <div><span className="text-muted-foreground">上传者：</span>{viewItem.uploaderName}</div>
                <div><span className="text-muted-foreground">时间：</span>{formatDateTime(viewItem.createdAt)}</div>
              </div>
              {viewItem.description && (
                <div className="text-sm"><span className="text-muted-foreground">描述：</span>{viewItem.description}</div>
              )}
              {(() => {
                const internalKeys = new Set(['__originalFileNames', 'upload_id', 'reviewer_id', 'original_file_name']);
                const metaEntries = Object.entries(viewItem.metadata || {}).filter(([key, val]) =>
                  val !== null && val !== undefined && val !== '' && !internalKeys.has(key)
                );
                if (metaEntries.length === 0) return null;
                return (
                  <div className="space-y-1 text-sm border-t pt-2 mt-2">
                    <span className="text-muted-foreground">分类信息：</span>
                    {metaEntries.map(([key, val]) => (
                      <div key={key} className="text-xs">
                        <span className="text-muted-foreground">{key}：</span>
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </div>
                    ))}
                  </div>
                );
              })()}
              {viewItem.tags && viewItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {viewItem.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
              {/* 相关文档推荐（#20260822-2242 指令 3/3） */}
              <div className="border-t pt-2 mt-3">
                <div className="text-sm font-medium mb-2">📎 相关文档推荐</div>
                {loadingRecommendations ? (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" /> 匹配中...
                  </div>
                ) : recommendations.length > 0 ? (
                  <ul className="space-y-1">
                    {recommendations.map((rec) => (
                      <li key={rec.id}>
                        <button
                          type="button"
                          className="text-left w-full text-xs hover:bg-muted rounded px-2 py-1 flex items-start justify-between gap-2"
                          onClick={() => openRecommendation(rec.id)}
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block truncate">{rec.title}</span>
                            {rec.summary && (
                              <span className="block text-muted-foreground truncate">{rec.summary}</span>
                            )}
                          </span>
                          <span className="text-green-600 shrink-0">{rec.relevance_score}%</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-muted-foreground">暂无相关推荐</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {viewItem?.fileUrl && canDownload && (
              <FileDownloadButton
                entryId={viewItem.id}
                fileName={getKnowledgeFileName(viewItem)}
                className={buttonVariants({ variant: 'default', size: 'default' })}
              >
                <Download className="h-4 w-4 mr-1" />
                下载文件
              </FileDownloadButton>
            )}
            <Button variant="outline" onClick={() => setViewItem(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    {/* 单条删除二次确认（#[20260825-2350]） */}
    <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除该条目？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后该文件将不可恢复。此操作仅针对当前选中的条目。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!!deleting}
            onClick={(e) => {
              e.preventDefault();
              if (confirmDeleteId) {
                doDelete(confirmDeleteId);
                setConfirmDeleteOpen(false);
                setConfirmDeleteId(null);
              }
            }}
          >
            {deleting ? '删除中...' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 批量操作二次确认（#[20260825-2350]） */}
    <AlertDialog
      open={batchOpen}
      onOpenChange={(open) => {
        if (!batchSubmitting) {
          setBatchOpen(open);
          if (!open) setBatchAction(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {batchAction === 'approve'
              ? '批量通过审核？'
              : batchAction === 'reject'
                ? '批量拒绝？'
                : '批量删除？'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {batchAction === 'delete'
              ? `即将删除所选的 ${selectedIds.size} 条记录及其存储文件。此操作不可恢复，请谨慎！`
              : `即将对所选 ${selectedIds.size} 条记录执行"${
                  batchAction === 'approve' ? '通过审核' : '拒绝'
                }"操作。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={batchSubmitting}>取消</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              batchAction === 'approve' && 'bg-green-600 text-white hover:bg-green-700',
              batchAction === 'reject' && 'bg-orange-600 text-white hover:bg-orange-700',
              batchAction === 'delete' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              !batchAction && 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
            disabled={batchSubmitting}
            onClick={(e) => {
              e.preventDefault();
              handleBatchConfirm();
            }}
          >
            {batchSubmitting
              ? '处理中...'
              : batchAction === 'approve'
                ? `批量通过 ${selectedIds.size} 项`
                : batchAction === 'reject'
                  ? `批量拒绝 ${selectedIds.size} 项`
                  : batchAction === 'delete'
                    ? `批量删除 ${selectedIds.size} 项`
                    : '确认'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 上传弹窗（统一上传流程） */}
      {uploadOpen && (
        <KnowledgeUploader
          type={type as any}
          metadataFields={uploadMetadataFields}
          onClose={() => setUploadOpen(false)}
          onSubmit={handleUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );
}
