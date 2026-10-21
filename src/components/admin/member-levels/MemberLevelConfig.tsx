'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Plus, RefreshCw, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  FIELD_PERMISSION_DEFS,
  MODULE_PERMISSION_DEFS,
  LEVEL_BADGE_CLASSES,
  getDefaultModulePermission,
} from '@/lib/member-permission-defs';
import type { MemberLevel } from './types';
import { LevelEditDialog } from './LevelEditDialog';
import { LevelHistoryDialog } from './LevelHistoryDialog';
import { LevelPreviewDialog } from './LevelPreviewDialog';
import { BatchUpdateDialog } from './BatchUpdateDialog';

/** 行内可编辑的「所需积分」 */
function EditablePoints({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (v: number) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));

  useEffect(() => {
    setVal(String(value));
  }, [value]);

  const commit = () => {
    setEditing(false);
    const num = parseInt(val, 10);
    if (!Number.isNaN(num) && num !== value) onSave(num);
    else setVal(String(value));
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-flex min-w-[64px] cursor-pointer items-center justify-center rounded-md px-2 py-1 text-sm font-medium tabular-nums hover:bg-muted"
        title="点击编辑所需积分"
        onClick={() => setEditing(true)}
        disabled={disabled}
      >
        {value.toLocaleString()} <span className="ml-1 text-xs text-muted-foreground">积分</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-7 w-24 text-right tabular-nums"
        type="number"
        value={val}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setVal(String(value));
            setEditing(false);
          }
        }}
      />
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={commit}>
        <Save className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** 权限开关组（字段权限 / 模块权限） */
function PermSwitchGroup({
  title,
  items,
  saving,
  onToggle,
}: {
  title: string;
  items: { key: string; label: string; has_permission: boolean }[];
  saving: boolean;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-muted-foreground">{title}</div>
      {items.map(item => (
        <div key={item.key} className="flex items-center justify-between gap-2">
          <span className="text-xs">{item.label}</span>
          <Switch
            checked={item.has_permission}
            disabled={saving}
            onCheckedChange={v => onToggle(item.key, v)}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * 按 MODULE_PERMISSION_DEFS 全量渲染模块开关（#202608302500）
 *
 * 背景：member_module_permissions 表只有 5 个模块的种子行，
 *   接口直接回传 DB 行 → 页面只显示 5 个模块开关，阶段2 新增的
 *   方案增强 / 资料下载 / 数据导出 / 客户管理 无法配置。
 * 这里做兜底合并：DB 有行以 DB 为准，缺行取模块默认矩阵值
 *   （与运行时拦截网关判定一致，避免"后台显示关闭但实际放行"）。
 */
function mergeModuleItems(level: MemberLevel): { key: string; label: string; has_permission: boolean }[] {
  return MODULE_PERMISSION_DEFS.map(def => {
    const row = level.module_permissions.find(mp => mp.module_key === def.module_key);
    return {
      key: def.module_key,
      label: row?.module_label || def.module_label,
      has_permission: row
        ? row.has_permission
        : getDefaultModulePermission(def.module_key, level.level_code),
    };
  });
}

export function MemberLevelConfig() {
  const { toast } = useToast();
  const [levels, setLevels] = useState<MemberLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 弹窗状态
  const [editLevel, setEditLevel] = useState<MemberLevel | null>(null);
  const [historyLevel, setHistoryLevel] = useState<MemberLevel | null>(null);
  const [previewLevel, setPreviewLevel] = useState<MemberLevel | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const loadLevels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/member-levels', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '加载失败');
      setLevels(json.data || []);
    } catch (err: any) {
      setError(err.message || '加载等级配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLevels();
  }, [loadLevels]);

  const updatePoints = async (level: MemberLevel, points: number) => {
    setSavingKey(`${level.level_code}:points`);
    try {
      const res = await fetch(`/api/admin/member-levels/${level.level_code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ required_points: points }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '保存失败');
      setLevels(prev =>
        prev.map(l => (l.level_code === level.level_code ? { ...l, required_points: points } : l))
      );
      toast({ title: '已保存', description: `${level.level_name} 所需积分已更新为 ${points}` });
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const toggleFieldPermission = async (level: MemberLevel, fieldKey: string, value: boolean) => {
    setSavingKey(`${level.level_code}:field:${fieldKey}`);
    try {
      const updated = level.field_permissions.map(fp =>
        fp.field_key === fieldKey ? { ...fp, has_permission: value } : fp
      );
      const res = await fetch(`/api/admin/member-levels/${level.level_code}/field-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: updated.map(fp => ({ field_key: fp.field_key, has_permission: fp.has_permission })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '保存失败');
      setLevels(prev =>
        prev.map(l =>
          l.level_code === level.level_code
            ? { ...l, field_permissions: l.field_permissions.map(fp => (fp.field_key === fieldKey ? { ...fp, has_permission: value } : fp)) }
            : l
        )
      );
      const label = FIELD_PERMISSION_DEFS.find(f => f.field_key === fieldKey)?.field_label || fieldKey;
      toast({ title: '已保存', description: `${level.level_name} · ${label} ${value ? '✅' : '❌'}` });
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const toggleModulePermission = async (level: MemberLevel, moduleKey: string, value: boolean) => {
    setSavingKey(`${level.level_code}:module:${moduleKey}`);
    try {
      // #202608302500：基于补齐后的 9 个模块回写，确保新增模块能被持久化
      const updated = mergeModuleItems(level).map(mp =>
        mp.key === moduleKey ? { ...mp, has_permission: value } : mp
      );
      const res = await fetch(`/api/admin/member-levels/${level.level_code}/module-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: updated.map(mp => ({ module_key: mp.key, has_permission: mp.has_permission })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '保存失败');
      setLevels(prev =>
        prev.map(l =>
          l.level_code === level.level_code
            ? {
                ...l,
                module_permissions: mergeModuleItems(l).map(mp => ({
                  module_key: mp.key,
                  module_label: mp.label,
                  has_permission: mp.key === moduleKey ? value : mp.has_permission,
                  sort_order: l.module_permissions.find(x => x.module_key === mp.key)?.sort_order ?? 0,
                })),
              }
            : l
        )
      );
      const label = MODULE_PERMISSION_DEFS.find(m => m.module_key === moduleKey)?.module_label || moduleKey;
      toast({ title: '已保存', description: `${level.level_name} · ${label} ${value ? '✅' : '❌'}` });
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetDefaults = async () => {
    if (!await confirmDialog({ title: '确定恢复所有等级的默认权限配置吗？当前修改将全部覆盖。', destructive: true })) return;
    try {
      const res = await fetch('/api/admin/member-levels/reset-defaults', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '恢复失败');
      toast({ title: '已恢复默认配置' });
      await loadLevels();
    } catch (err: any) {
      toast({ title: '恢复失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleCreateLevel = async () => {
    const name = prompt('请输入新等级名称（如：钻石）');
    if (!name) return;
    const points = prompt('请输入所需积分（数字）：', '5000');
    const pts = parseInt(points || '0', 10);
    try {
      const res = await fetch('/api/admin/member-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_name: name, required_points: Number.isNaN(pts) ? 0 : pts }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '创建失败');
      toast({ title: '已创建', description: `等级「${name}」创建成功` });
      await loadLevels();
    } catch (err: any) {
      toast({ title: '创建失败', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>等级权限配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>等级权限配置</CardTitle>
          <CardDescription>
            会员等级、所需积分、字段权限与模块权限统一管理，修改实时生效
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCreateLevel}>
            <Plus className="mr-1 h-4 w-4" /> 新增等级
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetDefaults}>
            <RefreshCw className="mr-1 h-4 w-4" /> 恢复默认
          </Button>
          <Button size="sm" onClick={() => setBatchOpen(true)}>
            批量更新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">等级</TableHead>
              <TableHead className="w-[120px]">所需积分</TableHead>
              <TableHead className="w-[240px]">字段权限</TableHead>
              <TableHead className="w-[240px]">模块权限</TableHead>
              <TableHead className="w-[160px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {levels.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  暂无等级配置，点击右上角「新增等级」创建
                </TableCell>
              </TableRow>
            )}
            {levels.map(level => (
              <TableRow key={level.level_code}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge className={LEVEL_BADGE_CLASSES[level.level_code] || 'bg-gray-500'}>
                      {level.level_code}
                    </Badge>
                    <div>
                      <div className="font-medium">{level.level_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {level.is_default ? '默认等级' : `#${level.sort_order}`}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <EditablePoints
                    value={level.required_points}
                    disabled={savingKey === `${level.level_code}:points`}
                    onSave={v => updatePoints(level, v)}
                  />
                </TableCell>
                <TableCell>
                  <PermSwitchGroup
                    title="可见字段"
                    items={level.field_permissions.map(fp => ({
                      key: fp.field_key,
                      label: fp.field_label,
                      has_permission: fp.has_permission,
                    }))}
                    saving={savingKey?.startsWith(`${level.level_code}:field:`) === true}
                    onToggle={(k, v) => toggleFieldPermission(level, k, v)}
                  />
                </TableCell>
                <TableCell>
                  <PermSwitchGroup
                    title={`可用模块（${MODULE_PERMISSION_DEFS.length}）`}
                    items={mergeModuleItems(level)}
                    saving={savingKey?.startsWith(`${level.level_code}:module:`) === true}
                    onToggle={(k, v) => toggleModulePermission(level, k, v)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditLevel(level)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryLevel(level)}>
                      历史
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreviewLevel(level)}>
                      预览
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>
            字段：{FIELD_PERMISSION_DEFS.map(f => f.field_label).join(' / ')}
          </span>
          <span>
            模块：{MODULE_PERMISSION_DEFS.map(m => m.module_label).join(' / ')}
          </span>
        </div>
      </CardContent>

      {editLevel && (
        <LevelEditDialog
          level={editLevel}
          open
          onClose={() => setEditLevel(null)}
          onSaved={async updated => {
            setLevels(prev => prev.map(l => (l.level_code === updated.level_code ? updated : l)));
            setEditLevel(null);
            toast({ title: '已保存', description: `等级「${updated.level_name}」已更新` });
          }}
        />
      )}
      {historyLevel && (
        <LevelHistoryDialog
          level={historyLevel}
          open
          onClose={() => setHistoryLevel(null)}
        />
      )}
      {previewLevel && (
        <LevelPreviewDialog
          level={previewLevel}
          open
          onClose={() => setPreviewLevel(null)}
        />
      )}
      <BatchUpdateDialog
        levels={levels}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onSuccess={async () => {
          setBatchOpen(false);
          await loadLevels();
          toast({ title: '批量更新成功', description: '所有等级配置已保存' });
        }}
      />
    </Card>
  );
}
