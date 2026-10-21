'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Save } from 'lucide-react';
import { LEVEL_BADGE_CLASSES } from '@/lib/member-permission-defs';
import type { BatchUpdateItem, MemberLevel } from './types';

export function BatchUpdateDialog({
  levels,
  open,
  onClose,
  onSuccess,
}: {
  levels: MemberLevel[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<BatchUpdateItem[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setItems(
        levels.map(level => ({
          level_code: level.level_code,
          level_name: level.level_name,
          enabled: true,
          daily_quota: level.daily_quota,
          max_files: level.max_files,
          max_chat_messages: level.max_chat_messages,
          field_permissions: Object.fromEntries(
            level.field_permissions.map(fp => [fp.field_key, fp.has_permission])
          ),
          module_permissions: Object.fromEntries(
            level.module_permissions.map(mp => [mp.module_key, mp.has_permission])
          ),
        }))
      );
    }
  }, [open, levels]);

  const patchItem = (levelCode: string, patch: Partial<BatchUpdateItem>) => {
    setItems(prev => prev.map(item => (item.level_code === levelCode ? { ...item, ...patch } : item)));
  };

  const handleResetDefaults = async () => {
    if (!await confirmDialog({ title: '确定恢复所有等级的默认权限配置吗？当前修改将全部覆盖。', destructive: true })) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/member-levels/reset-defaults', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '恢复失败');
      toast({ title: '已恢复默认配置' });
      onSuccess();
    } catch (err: any) {
      toast({ title: '恢复失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const selected = items.filter(i => i.enabled);
    if (selected.length === 0) {
      toast({ title: '请至少选择一个等级', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/member-levels/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map(item => ({
            level_code: item.level_code,
            daily_quota: item.daily_quota,
            max_files: item.max_files,
            max_chat_messages: item.max_chat_messages,
            field_permissions: Object.entries(item.field_permissions).map(([field_key, has_permission]) => ({
              field_key,
              has_permission,
            })),
            module_permissions: Object.entries(item.module_permissions).map(([module_key, has_permission]) => ({
              module_key,
              has_permission,
            })),
          })),
          reason: reason || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || (json.failed?.length ? `失败等级：${json.failed.join(', ')}` : '批量更新失败'));
      }
      toast({
        title: '批量更新成功',
        description: `已更新 ${json.updated ?? selected.length} 个等级`,
      });
      onSuccess();
    } catch (err: any) {
      toast({ title: '批量更新失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = items.filter(i => i.enabled).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批量更新等级权限</DialogTitle>
          <DialogDescription>
            勾选要更新的等级，统一配置配额、字段权限与模块权限（已勾选 {enabledCount}/{items.length} 个等级）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={handleResetDefaults} disabled={saving}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> 恢复默认配置
            </Button>
          </div>

          {items.map(item => (
            <div key={item.level_code} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={item.enabled}
                    onCheckedChange={v => patchItem(item.level_code, { enabled: !!v })}
                  />
                  <Badge className={LEVEL_BADGE_CLASSES[item.level_code] || 'bg-gray-500'}>
                    {item.level_code}
                  </Badge>
                  <span className="font-medium">{item.level_name}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">每日查询配额</Label>
                  <Input
                    type="number"
                    className="h-8"
                    disabled={!item.enabled}
                    value={item.daily_quota}
                    onChange={e => patchItem(item.level_code, { daily_quota: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">最大文件数量</Label>
                  <Input
                    type="number"
                    className="h-8"
                    disabled={!item.enabled}
                    value={item.max_files}
                    onChange={e => patchItem(item.level_code, { max_files: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">最大聊天消息数</Label>
                  <Input
                    type="number"
                    className="h-8"
                    disabled={!item.enabled}
                    value={item.max_chat_messages}
                    onChange={e => patchItem(item.level_code, { max_chat_messages: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">字段权限</div>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(item.field_permissions).map(([fieldKey, val]) => {
                      const label =
                        levels
                          .find(l => l.level_code === item.level_code)
                          ?.field_permissions.find(fp => fp.field_key === fieldKey)?.field_label || fieldKey;
                      return (
                        <div key={fieldKey} className="flex items-center justify-between text-xs">
                          <span>{label}</span>
                          <Switch
                            disabled={!item.enabled}
                            checked={val}
                            onCheckedChange={v =>
                              patchItem(item.level_code, {
                                field_permissions: { ...item.field_permissions, [fieldKey]: v },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">模块权限</div>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(item.module_permissions).map(([moduleKey, val]) => {
                      const label =
                        levels
                          .find(l => l.level_code === item.level_code)
                          ?.module_permissions.find(mp => mp.module_key === moduleKey)?.module_label || moduleKey;
                      return (
                        <div key={moduleKey} className="flex items-center justify-between text-xs">
                          <span>{label}</span>
                          <Switch
                            disabled={!item.enabled}
                            checked={val}
                            onCheckedChange={v =>
                              patchItem(item.level_code, {
                                module_permissions: { ...item.module_permissions, [moduleKey]: v },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Separator />
          <div className="space-y-1.5">
            <Label>修改原因（记录到变更历史）</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="如：统一调整各等级配额与字段可见性"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? '保存中…' : `确认批量更新（${enabledCount}）`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
