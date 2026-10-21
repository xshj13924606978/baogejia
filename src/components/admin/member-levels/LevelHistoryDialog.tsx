'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { LEVEL_BADGE_CLASSES } from '@/lib/member-permission-defs';
import type { ChangeLogEntry, MemberLevel } from './types';

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  create: { label: '创建', cls: 'bg-green-500' },
  update: { label: '更新', cls: 'bg-blue-500' },
  delete: { label: '删除', cls: 'bg-red-500' },
  batch: { label: '批量', cls: 'bg-purple-500' },
  reset: { label: '恢复默认', cls: 'bg-amber-500' },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function LevelHistoryDialog({
  level,
  open,
  onClose,
}: {
  level: MemberLevel;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/member-levels/${level.level_code}/history`, { cache: 'no-store' })
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || '加载失败');
        setLogs(json.data || []);
      })
      .catch((err: any) => {
        toast({ title: '加载历史失败', description: err.message, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [open, level, toast]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={LEVEL_BADGE_CLASSES[level.level_code] || 'bg-gray-500'}>
              {level.level_code}
            </Badge>
            变更历史 · {level.level_name}
          </DialogTitle>
          <DialogDescription>该等级权限配置的完整变更记录</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              暂无变更记录
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map(log => {
                const meta = ACTION_LABELS[log.action] || { label: log.action, cls: 'bg-gray-500' };
                return (
                  <div key={log.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Badge className={meta.cls}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{formatTime(log.created_at)}</span>
                    </div>
                    {log.change_summary && (
                      <p className="mt-2 text-sm">{log.change_summary}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      操作人：{log.changed_by || '未知'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
