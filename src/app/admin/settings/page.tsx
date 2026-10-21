'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Settings as SettingsIcon,
  Building2,
  Shield,
  Coins,
  Database,
  Plus,
  Save,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Download,
  ToggleLeft,
  Hash,
  Type,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface SiteConfigItem {
  key: string;
  config_key?: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'text';
  label: string;
  description: string;
  category: 'general' | 'security' | 'points' | 'storage';
  is_public?: boolean;
  is_editable?: boolean;
}

type ConfigType = 'string' | 'number' | 'boolean' | 'text';
type CategoryKey = SiteConfigItem['category'];

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; icon: React.ReactNode; color: string; description: string }
> = {
  general: {
    label: '基本设置',
    icon: <Building2 className="h-4 w-4" />,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    description: '站点、公司、报价等基础信息',
  },
  security: {
    label: '安全设置',
    icon: <Shield className="h-4 w-4" />,
    color: 'text-red-600 bg-red-50 border-red-200',
    description: '登录安全、注册控制、密码与会话策略',
  },
  points: {
    label: '积分设置',
    icon: <Coins className="h-4 w-4" />,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    description: '积分获取、消费、奖励规则与分成',
  },
  storage: {
    label: '存储设置',
    icon: <Database className="h-4 w-4" />,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    description: '文件类型、空间、上传限制',
  },
};

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function categorizeData(data: any): Record<CategoryKey, SiteConfigItem[]> {
  const empty: Record<CategoryKey, SiteConfigItem[]> = { general: [], security: [], points: [], storage: [] };
  const raw = data?.data;
  let list: any[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    (['general', 'security', 'points', 'storage'] as CategoryKey[]).forEach(k => {
      if (Array.isArray(raw[k])) empty[k] = raw[k];
      list = list.concat(raw[k]);
    });
  }
  // 如按 category 拆分后仍空（数据为扁平数组），按 category 字段再聚一次
  if (list.length > 0 && Object.values(empty).every(arr => arr.length === 0)) {
    list.forEach(item => {
      const cat = (item.category || 'general') as CategoryKey;
      if (empty[cat]) empty[cat].push(item);
    });
  }
  return empty;
}

export default function SystemSettingsPage() {
  const [grouped, setGrouped] = useState<Record<CategoryKey, SiteConfigItem[]>>({
    general: [],
    security: [],
    points: [],
    storage: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<CategoryKey, boolean>>({
    general: false,
    security: false,
    points: false,
    storage: false,
  });

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) {
        setGrouped(categorizeData(data));
      } else {
        toast.error(data.error || '加载设置失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleSaveCategory = async (category: CategoryKey) => {
    const list = grouped[category];
    setSaving(prev => ({ ...prev, [category]: true }));
    try {
      const settings = list.map(c => ({
        key: c.config_key || c.key,
        value: asString(c.value),
        description: c.description,
      }));
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${CATEGORY_META[category].label}保存成功`);
        loadConfigs();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(prev => ({ ...prev, [category]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载系统设置...</span>
      </div>
    );
  }

  const categories: CategoryKey[] = ['general', 'security', 'points', 'storage'];
  const totalCount = categories.reduce((s, c) => s + grouped[c].length, 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* 顶部标题与全局刷新/初始化 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <SettingsIcon className="h-6 w-6 text-gray-700" />
            系统设置
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理站点的基本、安全、积分与存储配置；保存后立即生效
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InitButton onDone={loadConfigs} />
          <AddConfigButton existing={grouped} onDone={loadConfigs} />
          <Button variant="outline" size="sm" onClick={loadConfigs}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            全部刷新
          </Button>
        </div>
      </div>

      {/* 全局概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map(cat => {
          const items = grouped[cat];
          return (
            <Card key={cat} className={`border-l-4 ${CATEGORY_META[cat].color.split(' ').slice(-1)[0].replace('border-', 'border-l-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {CATEGORY_META[cat].icon}
                      <span>{CATEGORY_META[cat].label}</span>
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{items.length}</p>
                    <p className="text-[10px] text-muted-foreground">{CATEGORY_META[cat].description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground">共 {totalCount} 项配置</div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="gap-1.5 text-xs sm:text-sm">
              {CATEGORY_META[cat].icon}
              {CATEGORY_META[cat].label}
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">{grouped[cat].length}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(cat => (
          <TabsContent key={cat} value={cat} className="space-y-4">
            <CategoryPanel
              category={cat}
              items={grouped[cat]}
              onChange={(items: SiteConfigItem[]) => setGrouped(prev => ({ ...prev, [cat]: items }))}
              saving={saving[cat]}
              onSave={() => handleSaveCategory(cat)}
              onRefresh={loadConfigs}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---------- 单个分类面板 ----------

interface CategoryPanelProps {
  category: CategoryKey;
  items: SiteConfigItem[];
  onChange: (items: SiteConfigItem[]) => void;
  saving: boolean;
  onSave: () => void;
  onRefresh: () => void;
}

function CategoryPanel({ category, items, onChange, saving, onSave, onRefresh }: CategoryPanelProps) {
  const meta = CATEGORY_META[category];
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ConfigType | 'all'>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const updateItem = (idx: number, patch: Partial<SiteConfigItem>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const isChanged = useMemo(() => {
    return items.some((c, i) => {
      // 已加载时的"原始值"与当前 UI 内不可简单对比（PUT 时整体提交），简化处理：保留 change 字段或提示即可
      return (c as any).__dirty;
    });
  }, [items]);

  // 过滤
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (!q) return true;
      return (
        (c.config_key || c.key).toLowerCase().includes(q) ||
        c.label?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
      );
    });
  }, [items, search, typeFilter]);

  // 概览
  const overview = useMemo(() => {
    const total = items.length;
    const shown = filtered.length;
    const typeCount = (t: ConfigType) => items.filter(c => c.type === t).length;
    const enabled = items.filter(c => c.type === 'boolean' && asString(c.value) === 'true').length;
    return {
      total,
      shown,
      booleanTotal: typeCount('boolean'),
      numberTotal: typeCount('number'),
      stringTotal: typeCount('string'),
      textTotal: typeCount('text'),
      enabled,
    };
  }, [items, filtered]);

  // 多选
  const toggle = (key: string, val: boolean) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (val) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const visibleKeys = filtered.map(c => c.config_key || c.key);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedKeys.has(k));
  const someSelected = visibleKeys.some(k => selectedKeys.has(k)) && !allSelected;

  const selectedBooleans = items.filter(c => c.type === 'boolean' && selectedKeys.has(c.config_key || c.key));

  const bulkSetBoolean = (val: 'true' | 'false') => {
    const next = items.map(c => {
      if (c.type === 'boolean' && selectedKeys.has(c.config_key || c.key)) {
        return { ...c, value: val };
      }
      return c;
    });
    onChange(next);
    toast.success(`已${val === 'true' ? '启用' : '禁用'} ${selectedBooleans.length} 个开关`);
  };

  const bulkResetSelected = () => {
    // 仅对已绑定 server_default 的项进行重置，缺乏原始值时给出提示
    toast.info('未绑定默认值，请逐项编辑后保存');
  };

  const resetAllInCategory = () => {
    onChange(items.map(c => ({ ...c, value: '' })));
    toast.success(`已清空 ${meta.label} 全部取值（未保存）`);
  };

  const exportCategory = (onlySelected: boolean) => {
    const list = onlySelected
      ? items.filter(c => selectedKeys.has(c.config_key || c.key))
      : items;
    const header = 'category,key,label,type,value,description';
    const rows = list.map(c => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        c.category,
        c.config_key || c.key,
        esc(c.label || ''),
        c.type,
        asString(c.value),
        esc(c.description || ''),
      ].join(',');
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.label}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${list.length} 项`);
  };

  return (
    <div className="space-y-4">
      {/* 概览条 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <MiniStat icon={<ToggleLeft className="h-3.5 w-3.5" />} label="已启用/布尔" value={`${overview.enabled}/${overview.booleanTotal}`} />
        <MiniStat icon={<Hash className="h-3.5 w-3.5" />} label="数值类" value={overview.numberTotal} />
        <MiniStat icon={<Type className="h-3.5 w-3.5" />} label="字符类" value={overview.stringTotal} />
        <MiniStat icon={<Type className="h-3.5 w-3.5" />} label="文本类" value={overview.textTotal} />
        <MiniStat icon={<Search className="h-3.5 w-3.5" />} label="可见/总数" value={`${overview.shown}/${overview.total}`} />
        <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="已选" value={selectedKeys.size} />
      </div>

      {/* 工具栏 */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索 key / 标签 / 描述..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'boolean', 'number', 'string', 'text'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    typeFilter === t
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t === 'all' ? '全部' : t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCategory(selectedKeys.size > 0)}>
              <Download className="mr-1.5 h-4 w-4" />
              导出{selectedKeys.size > 0 ? `选中 (${selectedKeys.size})` : '全部'}
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              保存{meta.label}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作栏（选中才出现） */}
      {selectedKeys.size > 0 && (
        <Card className="border-blue-300 bg-blue-50/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected}
                onCheckedChange={c => {
                  setSelectedKeys(prev => {
                    const next = new Set(prev);
                    if (c) visibleKeys.forEach(k => next.add(k));
                    else visibleKeys.forEach(k => next.delete(k));
                    return next;
                  });
                }}
                aria-label="全选可见"
                className={someSelected ? 'data-[state=checked]:bg-blue-500' : ''}
              />
              <span className="font-medium">已选 {selectedKeys.size} 项</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedKeys(new Set())}
              >
                清除
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedBooleans.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => bulkSetBoolean('true')}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                    批量启用 ({selectedBooleans.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetBoolean('false')}>
                    <XCircle className="mr-1.5 h-4 w-4 text-gray-500" />
                    批量禁用
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={bulkResetSelected}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                批量重置
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 设置项列表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {meta.icon}
            {meta.label}
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
              {filtered.length}
              {filtered.length !== items.length ? ` / ${items.length}` : ''}
            </span>
          </CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              没有匹配的配置项
            </div>
          ) : (
            filtered.map((c, idx) => {
              const realIdx = items.indexOf(c);
              const key = c.config_key || c.key;
              const isSelected = selectedKeys.has(key);
              return (
                <ConfigRow
                  key={`${key}-${idx}`}
                  item={c}
                  isSelected={isSelected}
                  onSelectChange={v => toggle(key, v)}
                  onChange={patch => updateItem(realIdx, patch)}
                />
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 底部批量清理 */}
      {items.length > 0 && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <RotateCcw className="mr-1.5 h-4 w-4" />
                清空本类所有值（仅未保存）
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认清空 {meta.label} 所有值？</AlertDialogTitle>
                <AlertDialogDescription>仅清空当前编辑框内值，不会自动保存到数据库。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={resetAllInCategory}>确认清空</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ---------- 单行配置项 ----------

interface ConfigRowProps {
  item: SiteConfigItem;
  isSelected: boolean;
  onSelectChange: (c: boolean) => void;
  onChange: (patch: Partial<SiteConfigItem>) => void;
}

function ConfigRow({ item, isSelected, onSelectChange, onChange }: ConfigRowProps) {
  const inputId = `cfg-${item.config_key || item.key}`;
  const typeBadge: Record<ConfigType, { text: string; cls: string }> = {
    boolean: { text: '开关', cls: 'bg-purple-100 text-purple-700' },
    number: { text: '数字', cls: 'bg-blue-100 text-blue-700' },
    string: { text: '文本', cls: 'bg-emerald-100 text-emerald-700' },
    text: { text: '长文本', cls: 'bg-amber-100 text-amber-700' },
  };
  const badge = typeBadge[item.type] || typeBadge.string;
  const valueStr = asString(item.value);

  return (
    <div
      className={`flex flex-col gap-3 px-6 py-3.5 sm:flex-row sm:items-start sm:gap-4 ${
        isSelected ? 'bg-blue-50/40' : ''
      }`}
    >
      <div className="flex items-start gap-3 sm:w-1/2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={c => onSelectChange(!!c)}
          aria-label={`选择 ${item.label}`}
          className="mt-1 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Label htmlFor={inputId} className="text-sm font-medium">
              {item.label || item.config_key || item.key}
            </Label>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.text}</span>
            {item.is_public && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">公开</span>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          )}
          <code className="mt-1 inline-block max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {item.config_key || item.key}
          </code>
        </div>
      </div>
      <div className="sm:w-1/2">
        {item.type === 'boolean' ? (
          <button
            type="button"
            id={inputId}
            onClick={() => onChange({ value: valueStr === 'true' ? 'false' : 'true' })}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
              valueStr === 'true'
                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <span
              className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
                valueStr === 'true' ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  valueStr === 'true' ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            <span className="font-medium">{valueStr === 'true' ? '已启用' : '已禁用'}</span>
          </button>
        ) : item.type === 'number' ? (
          <Input
            id={inputId}
            type="number"
            value={valueStr}
            onChange={e => onChange({ value: e.target.value })}
            className="h-9 max-w-xs"
          />
        ) : item.type === 'text' ? (
          <textarea
            id={inputId}
            value={valueStr}
            onChange={e => onChange({ value: e.target.value })}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        ) : (
          <Input
            id={inputId}
            type="text"
            value={valueStr}
            onChange={e => onChange({ value: e.target.value })}
            className="h-9"
          />
        )}
      </div>
    </div>
  );
}

// ---------- Mini 概览单元 ----------
function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="mt-0.5 text-lg font-semibold leading-none">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------- 初始化默认配置按钮 ----------
function InitButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleInit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/migrate/site-config', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('默认配置已重新加载');
        onDone();
        setOpen(false);
      } else {
        toast.error(data.error || '初始化失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw className="mr-1.5 h-4 w-4" />
          初始化默认配置
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>初始化默认配置？</AlertDialogTitle>
          <AlertDialogDescription>
            将以迁移脚本中的默认值覆盖当前所有 site_config 行。可在下一步操作中重新编辑。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleInit} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            确认初始化
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- 新增配置项按钮 ----------
function AddConfigButton({
  existing,
  onDone,
}: {
  existing: Record<CategoryKey, SiteConfigItem[]>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CategoryKey>('general');
  const [type, setType] = useState<ConfigType>('string');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const allKeys = useMemo(() => {
    const s = new Set<string>();
    Object.values(existing).forEach(arr => arr.forEach(c => s.add(c.config_key || c.key)));
    return s;
  }, [existing]);

  const reset = () => {
    setKey('');
    setLabel('');
    setDescription('');
    setCategory('general');
    setType('string');
    setValue('');
  };

  const submit = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      toast.error('key 不能为空');
      return;
    }
    if (allKeys.has(trimmed)) {
      toast.error('该 key 已存在，请勿重复添加');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [{ key: trimmed, value, description: description || label }],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('配置项已提交');
        reset();
        setOpen(false);
        onDone();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          新增配置项
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增 site_config 配置项</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Key（英文唯一标识）</Label>
            <Input value={key} onChange={e => setKey(e.target.value)} placeholder="例：my_custom_flag" />
            {key && allKeys.has(key.trim()) && (
              <p className="text-xs text-red-500">该 key 已存在</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>分类</Label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as CategoryKey)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {(['general', 'security', 'points', 'storage'] as CategoryKey[]).map(c => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>类型</Label>
              <select
                value={type}
                onChange={e => setType(e.target.value as ConfigType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="string">string（单行）</option>
                <option value="text">text（长文本）</option>
                <option value="number">number（数字）</option>
                <option value="boolean">boolean（开关）</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>标签</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="显示在管理后台的标题" />
          </div>
          <div className="grid gap-1.5">
            <Label>描述</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="选填，鼠标悬停提示" />
          </div>
          <div className="grid gap-1.5">
            <Label>默认值</Label>
            {type === 'boolean' ? (
              <select
                value={value || 'false'}
                onChange={e => setValue(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="false">false（禁用）</option>
                <option value="true">true（启用）</option>
              </select>
            ) : type === 'number' ? (
              <Input type="number" value={value} onChange={e => setValue(e.target.value)} />
            ) : (
              <Input type="text" value={value} onChange={e => setValue(e.target.value)} />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={submit} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
