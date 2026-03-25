'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Trash2, Loader2, FileText, Clock, CheckCircle,
  XCircle, SkipForward, Database,
} from 'lucide-react';
import { toast } from 'sonner';

interface ImportLogDetail {
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
  user_id: string | null;
  details: Record<string, any> | null;
}

export default function ImportLogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const logId = params.id;

  const [log, setLog] = useState<ImportLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadLog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/import-logs/${logId}`);
      const data = await res.json();
      if (data.success) setLog(data.data);
      else { toast.error('日志不存在'); router.push('/admin/import-logs'); }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (logId) loadLog(); }, [logId]);

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/import-logs/${logId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('日志已删除'); router.push('/admin/import-logs'); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载日志详情...</span>
      </div>
    );
  }

  if (!log) return null;

  const successRate = log.total_count > 0 ? ((log.imported_count / log.total_count) * 100) : 0;
  const duration = log.duration_ms >= 1000 ? `${(log.duration_ms / 1000).toFixed(1)}s` : `${log.duration_ms}ms`;

  const StatItem = ({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) => (
    <div className="p-4 rounded-lg border text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">导入日志详情</h1>
            <p className="text-gray-500 text-sm">{log.file_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={log.status === 'completed' ? 'default' : 'destructive'} className={log.status === 'completed' ? 'bg-green-100 text-green-700' : ''}>
            {log.status === 'completed' ? '导入成功' : '导入失败'}
          </Badge>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <StatItem icon={Database} label="总记录数" value={log.total_count} color="text-blue-500" />
        <StatItem icon={CheckCircle} label="导入成功" value={log.imported_count} color="text-green-500" />
        <StatItem icon={SkipForward} label="重复跳过" value={log.skipped_count} color="text-yellow-500" />
        <StatItem icon={XCircle} label="导入失败" value={log.failed_count} color="text-red-500" />
        <StatItem icon={Clock} label="耗时" value={duration} color="text-gray-500" />
      </div>

      {/* 成功率 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导入结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">成功率</span>
            <span className="font-medium">{successRate.toFixed(1)}%</span>
          </div>
          <Progress value={successRate} className="h-3" />
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">成功 {log.imported_count}</span>
            <span className="text-yellow-600">跳过 {log.skipped_count}</span>
            <span className="text-red-600">失败 {log.failed_count}</span>
          </div>
        </CardContent>
      </Card>

      {/* 详细信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">日志信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">日志ID</span>
            <span className="font-mono text-xs">{log.id?.slice(0, 12)}...</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">文件名</span>
            <span className="font-medium">{log.file_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">文件类型</span>
            <Badge variant="outline">{log.file_type || '-'}</Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">导入时间</span>
            <span>{log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}</span>
          </div>
          {log.user_id && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">操作用户</span>
              <span className="font-mono text-xs">{log.user_id.slice(0, 8)}...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 错误详情 */}
      {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">错误详情</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* 删除对话框 */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !saving && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除此导入日志吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
