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

export function ImportLogsViewer({ limit = 20 }: ImportLogsViewerProps) {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const url = `/api/admin/import-logs?limit=${limit}&status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setLogs(data.data || []);
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
  }, [statusFilter]);

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            导入日志
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="completed">完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadLogs}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">加载中...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            暂无导入记录
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">状态</TableHead>
                  <TableHead>文件名</TableHead>
                  <TableHead className="text-right">总数</TableHead>
                  <TableHead className="text-right">成功</TableHead>
                  <TableHead className="text-right">跳过</TableHead>
                  <TableHead className="text-right">失败</TableHead>
                  <TableHead className="text-right">耗时</TableHead>
                  <TableHead className="text-right">成功率</TableHead>
                  <TableHead>导入时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{getStatusIcon(log.status)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{log.file_name || 'unknown'}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.file_type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {getStatusBadge(log)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{log.total_count}</TableCell>
                    <TableCell className="text-right text-green-600">
                      {log.imported_count}
                    </TableCell>
                    <TableCell className="text-right text-yellow-600">
                      {log.skipped_count}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {log.failed_count}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDuration(log.duration_ms)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
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
      </CardContent>
    </Card>
  );
}
