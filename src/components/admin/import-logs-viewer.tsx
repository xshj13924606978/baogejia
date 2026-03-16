'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
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
  duplicate_config?: {
    fields: string[];
    matchRule: string;
  };
}

interface ImportLogsViewerProps {
  limit?: number;
}

export function ImportLogsViewer({ limit = 10 }: ImportLogsViewerProps) {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

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
        toast({
          variant: 'destructive',
          title: '加载失败',
          description: data.error || '未知错误',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: '网络错误',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [statusFilter, currentPage]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (log: ImportLog) => {
    if (log.failed_count > 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          部分失败
        </Badge>
      );
    }
    if (log.skipped_count > 0) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          部分跳过
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        全部成功
      </Badge>
    );
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSuccessRate = (log: ImportLog) => {
    if (log.total_count === 0) return '0%';
    const rate = (log.imported_count / log.total_count) * 100;
    return `${rate.toFixed(1)}%`;
  };

  return (
    <Card className="shadow-sm border-muted/50 h-[400px] flex flex-col">
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-lg">导入日志</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="completed">完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadLogs} className="gap-2 h-8">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto min-h-0">
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
            <p className="text-sm text-muted-foreground/70">
              通过Excel导入功能添加产品，查看导入历史记录
            </p>
          </div>
        ) : (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>{getStatusIcon(log.status)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{log.file_name || 'unknown'}</span>
                        <Badge variant="outline" className="text-xs font-normal">
                          {log.file_type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {getStatusBadge(log)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">{log.total_count}</TableCell>
                    <TableCell className="text-right text-green-600 font-medium text-sm">
                      {log.imported_count}
                    </TableCell>
                    <TableCell className="text-right text-yellow-600 font-medium text-sm">
                      {log.skipped_count}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-medium text-sm">
                      {log.failed_count}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm font-medium">
                      {formatDuration(log.duration_ms)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {getSuccessRate(log)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: zhCN,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 分页控件 */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              共 {totalCount} 条记录，第 {currentPage} 页
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <span className="text-sm">
                {currentPage} / {Math.ceil(totalCount / limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / limit), p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / limit)}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
