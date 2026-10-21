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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { LEVEL_BADGE_CLASSES } from '@/lib/member-permission-defs';
import type { MemberLevel } from './types';

export function LevelEditDialog({
  level,
  open,
  onClose,
  onSaved,
}: {
  level: MemberLevel;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: MemberLevel) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(level.level_name);
  const [points, setPoints] = useState(String(level.required_points));
  const [dailyQuota, setDailyQuota] = useState(String(level.daily_quota));
  const [maxFiles, setMaxFiles] = useState(String(level.max_files));
  const [maxChat, setMaxChat] = useState(String(level.max_chat_messages));
  const [desc, setDesc] = useState(level.description || '');
  const [reason, setReason] = useState('');
  const [fieldPerms, setFieldPerms] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(level.field_permissions.map(fp => [fp.field_key, fp.has_permission]))
  );
  const [modulePerms, setModulePerms] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(level.module_permissions.map(mp => [mp.module_key, mp.has_permission]))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(level.level_name);
      setPoints(String(level.required_points));
      setDailyQuota(String(level.daily_quota));
      setMaxFiles(String(level.max_files));
      setMaxChat(String(level.max_chat_messages));
      setDesc(level.description || '');
      setReason('');
      setFieldPerms(Object.fromEntries(level.field_permissions.map(fp => [fp.field_key, fp.has_permission])));
      setModulePerms(Object.fromEntries(level.module_permissions.map(mp => [mp.module_key, mp.has_permission])));
    }
  }, [open, level]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: '等级名称不能为空', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const baseRes = await fetch(`/api/admin/member-levels/${level.level_code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level_name: name.trim(),
          required_points: parseInt(points, 10) || 0,
          daily_quota: parseInt(dailyQuota, 10) || 0,
          max_files: parseInt(maxFiles, 10) || 0,
          max_chat_messages: parseInt(maxChat, 10) || 0,
          description: desc.trim() || null,
        }),
      });
      const baseJson = await baseRes.json();
      if (!baseRes.ok || !baseJson.success) throw new Error(baseJson.error || '保存失败');

      const changedFields = level.field_permissions.some(fp => fieldPerms[fp.field_key] !== fp.has_permission);
      const changedModules = level.module_permissions.some(mp => modulePerms[mp.module_key] !== mp.has_permission);

      if (changedFields) {
        const res = await fetch(`/api/admin/member-levels/${level.level_code}/field-permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissions: level.field_permissions.map(fp => ({
              field_key: fp.field_key,
              has_permission: fieldPerms[fp.field_key] ?? false,
            })),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || '字段权限保存失败');
      }

      if (changedModules) {
        const res = await fetch(`/api/admin/member-levels/${level.level_code}/module-permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissions: level.module_permissions.map(mp => ({
              module_key: mp.module_key,
              has_permission: modulePerms[mp.module_key] ?? false,
            })),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || '模块权限保存失败');
      }

      const detailRes = await fetch(`/api/admin/member-levels/${level.level_code}`, { cache: 'no-store' });
      const detailJson = await detailRes.json();
      onSaved(detailJson.data);
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={LEVEL_BADGE_CLASSES[level.level_code] || 'bg-gray-500'}>
              {level.level_code}
            </Badge>
            编辑等级「{level.level_name}」
          </DialogTitle>
          <DialogDescription>修改等级名称、所需积分、配额与权限配置</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>等级名称</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：钻石" />
            </div>
            <div className="space-y-1.5">
              <Label>所需积分</Label>
              <Input
                type="number"
                value={points}
                onChange={e => setPoints(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2 text-sm font-medium">配额设置</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>每日查询配额</Label>
                <Input type="number" value={dailyQuota} onChange={e => setDailyQuota(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>最大文件数量</Label>
                <Input type="number" value={maxFiles} onChange={e => setMaxFiles(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>最大聊天消息数</Label>
                <Input type="number" value={maxChat} onChange={e => setMaxChat(e.target.value)} />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2 text-sm font-medium">字段权限</div>
            <div className="grid grid-cols-2 gap-2">
              {level.field_permissions.map(fp => (
                <div key={fp.field_key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{fp.field_label}</span>
                  <Switch
                    checked={fieldPerms[fp.field_key] ?? false}
                    onCheckedChange={v => setFieldPerms(prev => ({ ...prev, [fp.field_key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">模块权限</div>
            <div className="grid grid-cols-2 gap-2">
              {level.module_permissions.map(mp => (
                <div key={mp.module_key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{mp.module_label}</span>
                  <Switch
                    checked={modulePerms[mp.module_key] ?? false}
                    onCheckedChange={v => setModulePerms(prev => ({ ...prev, [mp.module_key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>等级描述</Label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>修改说明（记录到变更历史）</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="如：调整黄金等级所需积分" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
