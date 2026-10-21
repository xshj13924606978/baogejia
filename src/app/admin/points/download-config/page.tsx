'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  BookMarked,
  Image as ImageIcon,
  Ruler,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Save,
  X,
  BadgePercent,
  Coins,
  Download,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getClientAuthHeaders } from '@/lib/client-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DownloadConfig {
  id: string;
  resource_type: string;
  action_type: string;
  role: string | null;
  cost: number;
  is_enabled: boolean;
  description?: string | null;
}

const API_PATH = '/api/admin/points/download-config';

const RESOURCE_META: Record<string, { label: string; icon: LucideIcon; desc: string; gradient: string; badge: string }> = {
  document: {
    label: '技术文档',
    icon: FileText,
    desc: '产品文档与技术资料下载',
    gradient: 'from-blue-500 to-blue-600',
    badge: 'bg-blue-50 text-blue-700',
  },
  standard: {
    label: '标准规范',
    icon: BookMarked,
    desc: '行业标准与规范文件',
    gradient: 'from-emerald-500 to-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  drawing: {
    label: '图纸图片',
    icon: ImageIcon,
    desc: '工程图纸与图片素材',
    gradient: 'from-amber-500 to-orange-600',
    badge: 'bg-amber-50 text-amber-700',
  },
  quota: {
    label: '定额库',
    icon: Ruler,
    desc: '定额库数据查看与下载',
    gradient: 'from-violet-500 to-purple-600',
    badge: 'bg-violet-50 text-violet-700',
  },
};

const ACTION_LABELS: Record<string, string> = {
  download: '下载',
  view: '查看详情',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  vip: 'VIP',
  premium: '高级会员',
  free: '免费用户',
  contributor: '贡献者',
  enterprise_admin: '企业管理员',
};

const TYPE_ORDER = ['document', 'standard', 'drawing', 'quota'];

const inputCls =
  'h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900';
const labelCls = 'mb-1 block text-xs font-medium text-gray-500';

export default function PointsDownloadConfigPage() {
  const [configs, setConfigs] = useState<DownloadConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // 分成比例
  const [split, setSplit] = useState({ creator_rate: '0.7', platform_rate: '0.3' });
  const [editCreatorRate, setEditCreatorRate] = useState('0.7');
  const [savingSplit, setSavingSplit] = useState(false);

  // 行内编辑
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState('');

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<DownloadConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 新增弹窗
  const [addOpen, setAddOpen] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [newForm, setNewForm] = useState({
    resource_type: 'document',
    action_type: 'download',
    role: '',
    cost: '10',
    description: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(API_PATH, { headers: { ...getClientAuthHeaders() } });
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data || []);
        if (data.split) {
          setSplit({
            creator_rate: String(data.split.creator_rate),
            platform_rate: String(data.split.platform_rate),
          });
          setEditCreatorRate(String(data.split.creator_rate));
        }
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 平台比例自动联动：只读，始终 = 1 - 上传者比例
  const parsedCreator = parseFloat(editCreatorRate);
  const displayPlatform =
    !Number.isNaN(parsedCreator) && parsedCreator >= 0 && parsedCreator <= 1
      ? (1 - parsedCreator).toFixed(2)
      : '';

  const handleUpdateCost = useCallback(
    async (item: DownloadConfig, cost: number) => {
      setSavingId(item.id);
      try {
        const res = await fetch(API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
          body: JSON.stringify({ id: item.id, cost }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success('已更新，配置实时生效');
          await load();
          return true;
        }
        toast.error(data.error || '保存失败');
        return false;
      } catch {
        toast.error('网络错误');
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [load]
  );

  const handleToggle = async (item: DownloadConfig) => {
    setSavingId(item.id);
    try {
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ id: item.id, is_enabled: !item.is_enabled }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(item.is_enabled ? '已停用' : '已启用');
        await load();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveSplit = async () => {
    const c = parseFloat(editCreatorRate);
    if (Number.isNaN(c) || c < 0 || c > 1) {
      toast.error('上传者比例需在 0~1 之间');
      return;
    }
    setSavingSplit(true);
    try {
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        // 只传上传者比例，平台比例由后端自动联动计算
        body: JSON.stringify({ action: 'update_split', creator_rate: String(c) }),
      });
      const data = await res.json();
      if (data.success) {
        setSplit({ creator_rate: String(c), platform_rate: displayPlatform });
        toast.success('分成比例已更新，实时生效');
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSavingSplit(false);
    }
  };

  // 行内编辑
  const startEdit = (item: DownloadConfig) => {
    setEditingId(item.id);
    setEditCost(String(item.cost));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditCost('');
  };
  const saveEdit = async () => {
    const item = configs.find((c) => c.id === editingId);
    if (!item) return;
    const v = Math.max(0, Math.floor(parseInt(editCost, 10) || 0));
    if (v === item.cost) {
      cancelEdit();
      return;
    }
    const ok = await handleUpdateCost(item, v);
    if (ok) cancelEdit();
  };

  // 删除
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_PATH}?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
        headers: { ...getClientAuthHeaders() },
      });
      const data = await res.json();
      if (data.success) {
        toast.success('配置已删除');
        setDeleteTarget(null);
        await load();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleting(false);
    }
  };

  // 新增
  const handleAdd = async () => {
    const cost = Math.floor(parseInt(newForm.cost, 10) || 0);
    if (cost < 0) {
      toast.error('积分数不能为负数');
      return;
    }
    setSubmittingAdd(true);
    try {
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          resource_type: newForm.resource_type,
          action_type: newForm.action_type,
          role: newForm.role || null,
          cost,
          description: newForm.description.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('新增配置成功');
        setAddOpen(false);
        setNewForm({ resource_type: 'document', action_type: 'download', role: '', cost: '10', description: '' });
        await load();
      } else {
        toast.error(data.error || '新增失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // 按类型分组展示（固定 4 种类型，空组也展示占位）
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: configs.filter((c) => c.resource_type === type),
  }));

  return (
    <div className="space-y-5">
      {/* ===== 头部：标题 + 说明 + 操作按钮 ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-6 py-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-14 right-28 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[260px]">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <BadgePercent className="h-5 w-5" />
              积分扣费配置
            </h2>
            <p className="mt-1 text-sm text-blue-100">
              配置资料中心下载/查看详情所需积分数，保存后实时生效；角色留空表示所有角色通用，可对特定角色单独覆盖。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={load}
              disabled={loading}
              className="border-0 bg-white/15 text-white hover:bg-white/25"
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '加载中' : '刷新'}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="bg-white text-blue-700 shadow-sm hover:bg-blue-50">
              <Plus className="mr-1 h-4 w-4" />
              新增配置
            </Button>
          </div>
        </div>
      </div>

      {/* ===== 积分分成比例 ===== */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Coins className="h-4 w-4 text-amber-500" />
              积分分成比例
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">下载者扣费后按比例分配给上传者与平台，保存后实时生效</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            当前生效：上传者 {split.creator_rate} / 平台 {split.platform_rate}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 py-4">
          <div>
            <label className={labelCls}>上传者分成比例</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={editCreatorRate}
              onChange={(e) => setEditCreatorRate(e.target.value)}
              className={`${inputCls} w-32`}
            />
          </div>
          <div className="flex items-end gap-1 pb-0.5 text-lg text-gray-300">+</div>
          <div>
            <label className={labelCls}>平台分成比例（自动计算）</label>
            <div className="flex h-9 w-32 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
              {displayPlatform || '—'}
            </div>
          </div>
          <Button size="sm" disabled={savingSplit} onClick={handleSaveSplit}>
            {savingSplit ? '保存中...' : '保存分成比例'}
          </Button>
        </div>
      </div>

      {/* ===== 各资料类型扣费配置卡片 ===== */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {grouped.map(({ type, items }) => {
            const meta = RESOURCE_META[type];
            const Icon = meta.icon;
            return (
              <div key={type} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800">
                <div className={`flex items-center gap-3 bg-gradient-to-r ${meta.gradient} px-4 py-3 text-white`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{meta.label}</h3>
                    <p className="truncate text-xs text-white/80">{meta.desc}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}>
                    {items.length} 条
                  </span>
                </div>
                <div className="overflow-x-auto">
                  {items.length === 0 ? (
                    <div className="px-4 py-10 text-center text-xs text-gray-400">
                      暂无该类型配置，点击右上角「新增配置」添加
                    </div>
                  ) : (
                    <table className="w-full min-w-[540px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/80 text-left dark:border-gray-800 dark:bg-gray-800/40">
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500">动作</th>
                          <th className="px-4 py-2.5 text-xs font-medium text-gray-500">适用角色</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">积分数</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">启用</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const isEditing = editingId === item.id;
                          const busy = savingId === item.id;
                          return (
                            <tr key={item.id} className="border-b border-gray-50 transition-colors last:border-b-0 hover:bg-gray-50/60 dark:border-gray-800/50 dark:hover:bg-gray-800/30">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5" title={item.description || undefined}>
                                  {item.action_type === 'download' ? (
                                    <Download className="h-3.5 w-3.5 text-blue-500" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5 text-violet-500" />
                                  )}
                                  <span>{ACTION_LABELS[item.action_type] || item.action_type}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                {item.role ? (
                                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                    {ROLE_LABELS[item.role] || item.role}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                    所有角色
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    autoFocus
                                    value={editCost}
                                    onChange={(e) => setEditCost(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit();
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    className={`${inputCls} mx-auto w-24 text-center`}
                                  />
                                ) : (
                                  <span className="inline-flex items-baseline gap-0.5 font-medium tabular-nums">
                                    {item.cost}
                                    <span className="text-xs text-gray-400">积分</span>
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <Switch
                                  checked={item.is_enabled}
                                  disabled={busy}
                                  onCheckedChange={() => handleToggle(item)}
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={saveEdit}
                                        disabled={busy}
                                        className="h-8 gap-1 px-2 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                                      >
                                        <Save className="h-3.5 w-3.5" />
                                        保存
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={cancelEdit}
                                        className="h-8 gap-1 px-2 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                        取消
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => startEdit(item)}
                                        className="h-8 gap-1 px-2 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        编辑
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setDeleteTarget(item)}
                                        className="h-8 gap-1 px-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        删除
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 新增配置弹窗 ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增扣费配置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>资料类型</label>
                <select
                  value={newForm.resource_type}
                  onChange={(e) => setNewForm((f) => ({ ...f, resource_type: e.target.value }))}
                  className={inputCls}
                >
                  {TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {RESOURCE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>动作</label>
                <select
                  value={newForm.action_type}
                  onChange={(e) => setNewForm((f) => ({ ...f, action_type: e.target.value }))}
                  className={inputCls}
                >
                  <option value="download">下载</option>
                  <option value="view">查看详情</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>适用角色</label>
                <select
                  value={newForm.role}
                  onChange={(e) => setNewForm((f) => ({ ...f, role: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">所有角色</option>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>积分数</label>
                <input
                  type="number"
                  min="0"
                  value={newForm.cost}
                  onChange={(e) => setNewForm((f) => ({ ...f, cost: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>备注说明（可选）</label>
              <input
                value={newForm.description}
                onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="例如：PDF 文档下载扣费"
                className={inputCls}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={submittingAdd}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={submittingAdd}>
              {submittingAdd ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 删除二次确认 ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该扣费配置？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除「
              {deleteTarget
                ? `${RESOURCE_META[deleteTarget.resource_type]?.label || deleteTarget.resource_type} / ${
                    ACTION_LABELS[deleteTarget.action_type] || deleteTarget.action_type
                  } / ${deleteTarget.role ? ROLE_LABELS[deleteTarget.role] : '所有角色'}（${deleteTarget.cost} 积分）`
                : ''}
              」的扣费规则，删除后立即生效且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
