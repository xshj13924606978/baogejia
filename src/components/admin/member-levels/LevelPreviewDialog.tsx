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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
import { LEVEL_BADGE_CLASSES, LEVEL_CODE_TO_NUM } from '@/lib/member-permission-defs';
import type { MemberLevel } from './types';

export function LevelPreviewDialog({
  level,
  open,
  onClose,
}: {
  level: MemberLevel;
  open: boolean;
  onClose: () => void;
}) {
  const [affectedUsers, setAffectedUsers] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setAffectedUsers(null);

    const levelNum = LEVEL_CODE_TO_NUM[level.level_code];
    if (!levelNum) return;

    const changes: Record<string, boolean> = {};
    for (const fp of level.field_permissions) {
      changes[fp.field_key] = fp.has_permission;
    }

    fetch('/api/admin/permissions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: levelNum, changes }),
      cache: 'no-store',
    })
      .then(res => res.json())
      .then(json => {
        if (json.success && json.preview) setAffectedUsers(json.preview.affectedUsers ?? 0);
      })
      .catch(() => setAffectedUsers(null));
  }, [open, level]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={LEVEL_BADGE_CLASSES[level.level_code] || 'bg-gray-500'}>
              {level.level_code}
            </Badge>
            预览等级「{level.level_name}」
          </DialogTitle>
          <DialogDescription>该等级当前的完整权限配置</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <div className="text-xs text-muted-foreground">所需积分</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {level.required_points.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-xs text-muted-foreground">每日配额</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{level.daily_quota}</div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-xs text-muted-foreground">影响用户</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-lg font-semibold tabular-nums">
                {affectedUsers === null ? <Skeleton className="h-5 w-10" /> : affectedUsers}
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">字段权限（可见字段）</div>
            <div className="grid grid-cols-2 gap-2">
              {level.field_permissions.map(fp => (
                <div
                  key={fp.field_key}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{fp.field_label}</span>
                  <Badge variant={fp.has_permission ? 'default' : 'outline'} className={fp.has_permission ? 'bg-green-500' : ''}>
                    {fp.has_permission ? '✅ 可见' : '❌ 不可见'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2 text-sm font-medium">模块权限（可用功能）</div>
            <div className="grid grid-cols-2 gap-2">
              {level.module_permissions.map(mp => (
                <div
                  key={mp.module_key}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{mp.module_label}</span>
                  <Badge variant={mp.has_permission ? 'default' : 'outline'} className={mp.has_permission ? 'bg-green-500' : ''}>
                    {mp.has_permission ? '✅ 可用' : '❌ 禁用'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {level.description && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">{level.description}</p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
