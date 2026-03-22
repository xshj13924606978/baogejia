'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, FileText, CheckCircle2, XCircle, AlertCircle,
  Clock, Trash2, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ImportLog {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string;
  total_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  duration_ms: number;
  status: string;
  user_id?: string;
  details?: any;
}

interface ImportLogsViewerProps {
  limit?: number;
}

export function ImportLogsViewer({ limit = 20 }: ImportLogsViewerProps) {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 详情弹窗
  const [detailLog, setDetailLog] = useState<ImportLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // 删除确认
  const [deleteLog, setDeleteLog] = useState<ImportLog | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * limit;
      const url = `/api/admin/import-logs?limit=${limit}&offset=${offset}&status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data || []);
        setTotalCount(data.total || 0);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, [statusFilter, currentPage]);

  // 查看详情
  const openDetail = async (log: ImportLog) => {
    setDetailLog(log);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/import-logs/${log.id}`);
      const data = await res.json();
      if (data.success) setDetailLog(data.data);
      else toast.error(data.error || '获取详情失败');
    } catch { toast.error('网络错误'); }
    finally { setDetailLoading(false); }
  };

  // 删除
  const openDelete = (log: ImportLog) => { setDeleteLog(log); setDeleteOpen(true); };
  const handleDelete = async () => {
    if (!deleteLog) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/import-logs/${deleteLog.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('日志已删除'); setDeleteOpen(false); loadLogs(); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setDeleting(false); }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (log: ImportLog) => {
    if (log.failed_count > 0) return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />部分失败</Badge>;
    if (log.skipped_count > 0) return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />部分跳过</Badge>;
    return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />全部成功</Badge>;
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSuccessRate = (log: ImportLog) => {
    if (!log.total_count) return '0%';
    return `${((log.imported_count / log.total_count) * 100).toFixed(1)}%`;
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <>
      <Card className="shadow-sm border-muted/50">
        <CardHeader className="pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg"><FileText className="h-4 w-4 text-primary" /></div>
              <CardTitle className="text-lg">导入日志</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="completed">完成</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLogs} className="gap-2 h-8">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg mb-2">暂无导入记录</p>
              <p className="text-sm text-muted-foreground/70">通过Excel导入功能添加产品后查看记录</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-muted/50 overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/30 sticky top-0">
                    <TableRow>
                      <TableHead className="w-[50px] font-medium text-xs uppercase tracking-wider">状态</TableHead>
                      <TableHead className="font-medium text-xs uppercase tracking-wider">文件名</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">总数</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">成功</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">跳过</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">失败</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">耗时</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">成功率</TableHead>
                      <TableHead className="font-medium text-xs uppercase tracking-wider">导入时间</TableHead>
                      <TableHead className="text-right font-medium text-xs uppercase tracking-wider">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>{getStatusIcon(log.status)}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{log.file_name || 'unknown'}</span>
                            <Badge variant="outline" className="text-xs font-normal">{log.file_type}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{getStatusBadge(log)}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">{log.total_count}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium text-sm">{log.imported_count}</TableCell>
                        <TableCell className="text-right text-yellow-600 font-medium text-sm">{log.skipped_count}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium text-sm">{log.failed_count}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm font-medium">{formatDuration(log.duration_ms)}</TableCell>
                        <TableCell className="text-right font-medium text-sm">{getSuccessRate(log)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: zhCN })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(log)}><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => openDelete(log)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {totalCount > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">共 {totalCount} 条记录，第 {currentPage} 页</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>上一页</Button>
                    <span className="text-sm">{currentPage} / {totalPages || 1}</span>
                    <Button variant="outline" size="sm" disabled={currentPage >= (totalPages || 1)} onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}>下一页</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>导入日志详情</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2">加载中...</span></div>
          ) : detailLog ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">文件名：</span>{detailLog.file_name}</div>
                <div><span className="text-muted-foreground">文件类型：</span>{detailLog.file_type}</div>
                <div><span className="text-muted-foreground">状态：</span>{getStatusIcon(detailLog.status)} {detailLog.status}</div>
                <div><span className="text-muted-foreground">耗时：</span>{formatDuration(detailLog.duration_ms)}</div>
                <div><span className="text-muted-foreground">总数：</span>{detailLog.total_count}</div>
                <div><span className="text-muted-foreground">成功：</span><span className="text-green-600">{detailLog.imported_count}</span></div>
                <div><span className="text-muted-foreground">跳过：</span><span className="text-yellow-600">{detailLog.skipped_count}</span></div>
                <div><span className="text-muted-foreground">失败：</span><span className="text-red-600">{detailLog.failed_count}</span></div>
                <div><span className="text-muted-foreground">成功率：</span>{getSuccessRate(detailLog)}</div>
                <div className="col-span-2"><span className="text-muted-foreground">导入时间：</span>{new Date(detailLog.created_at).toLocaleString('zh-CN')}</div>
              </div>
              {detailLog.details && (
                <div>
                  <h4 className="font-medium mb-2">详细信息</h4>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-[300px]">
                    {typeof detailLog.details === 'string' ? detailLog.details : JSON.stringify(detailLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除导入日志「{deleteLog?.file_name}」吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
