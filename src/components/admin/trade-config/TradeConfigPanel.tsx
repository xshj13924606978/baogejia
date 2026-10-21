'use client';

// 管理端：交易配置中心（#202608292700-阶段四：统一订单）
// API:
//   GET  /api/admin/trade/config?category=&page=&pageSize=
//   PUT  /api/admin/trade/config/[key]
//   POST /api/admin/trade/config

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { TRADE_CONFIG_LABELS, TRADE_CONFIG_FIELD_LABELS } from '@/lib/trade-config-labels';
import { CONFIG_SCHEMAS } from '@/lib/trade-config-schemas';
import { Loader2, RefreshCw, Plus, Save } from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: 'all', label: '全部分类' },
  { value: 'system', label: '系统' },
  { value: 'payment', label: '支付' },
  { value: 'membership', label: '会员' },
  { value: 'token', label: 'Token' },
  { value: 'brand', label: '品牌' },
  { value: 'mall', label: '商城' },
  { value: 'withdraw', label: '提现' },
];

// #[20260830-1110] 全局汉化：DB trade_config.config_type CHECK 约束固定 5 种（string/number/boolean/json/array），
// 这里是 UI 中文→DB 英文枚举的硬编码映射，与 DB schema 对齐，避免硬编码 DOM 用字符串死值
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'json', label: 'JSON对象' },
  { value: 'number', label: '数字' },
  { value: 'string', label: '字符串' },
  { value: 'boolean', label: '布尔值' },
  { value: 'array', label: '数组' },
];

const getTypeLabel = (value: string) => TYPE_OPTIONS.find((o) => o.value === value)?.label || value;

// #[202608301900] 字段说明表格：解析当前配置值的 JSON 顶层字段，配合 TRADE_CONFIG_FIELD_LABELS 显示中文说明。
// 仅做 UI 层展示，绝不改写存储的 JSON 键名。JSON 非法或非对象时不渲染。
const FieldHelpTable: React.FC<{ configKey: string; valueText: string }> = ({ configKey, valueText }) => {
  let parsed: any;
  try {
    parsed = JSON.parse(valueText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const fields = Object.keys(parsed);
  if (fields.length === 0) return null;
  const fieldLabels = TRADE_CONFIG_FIELD_LABELS[configKey] || {};
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="text-xs font-medium text-gray-600 mb-1.5">字段说明</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-1 pr-3 font-medium w-2/5">字段名</th>
            <th className="py-1 font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f} className="border-b last:border-0">
              <td className="py-1 pr-3 font-mono text-gray-700 break-all">{f}</td>
              <td className="py-1 text-gray-600">{fieldLabels[f] || '未定义说明'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface ConfigRecord {
  id: string;
  config_key: string;
  config_value: any;
  config_type: string;
  description: string | null;
  category: string;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  updater?: { id: string; username: string | null; email: string | null } | null;
}

export const TradeConfigPanel: React.FC = () => {
  const { toast } = useToast();
  const [records, setRecords] = useState<ConfigRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [editing, setEditing] = useState<ConfigRecord | null>(null);
  const [editValue, setEditValue] = useState('');
  // #[202608302000] 表格模式：按 Schema 拆解后的字段值（编辑中的草稿）
  const [editFields, setEditFields] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ config_key: '', config_value: '', config_type: 'json', description: '', category: 'system' });
  // #20260829-2343 全局汉化：分类中文标签（DB 驱动 + 5s 缓存）
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});

  const getCategoryLabel = (code: string) => categoryLabels[code] || code;

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category, page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/admin/trade/config?${params.toString()}`, { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '加载配置失败');
      setRecords(data.records || []);
      setTotal(data.total || 0);
      // #20260829-2343 全局汉化：把后端返回的分类中文标签存到 state（DB 驱动，下一次切换分类不丢）
      if (data.category_labels && typeof data.category_labels === 'object') {
        setCategoryLabels((prev) => ({ ...prev, ...data.category_labels }));
      }
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [category, page, toast]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const openEdit = (record: ConfigRecord) => {
    setEditing(record);
    setEditValue(JSON.stringify(record.config_value, null, 2));
    // #[202608302000] 表格模式：有 Schema 且配置值是对象时，按字段拆解成可编辑草稿
    const schema = CONFIG_SCHEMAS[record.config_key];
    if (schema && record.config_value && typeof record.config_value === 'object' && !Array.isArray(record.config_value)) {
      setEditFields(
        schema.fields.reduce((acc, f) => {
          const raw = record.config_value[f.key];
          acc[f.key] = raw ?? (f.type === 'boolean' ? false : '');
          return acc;
        }, {} as Record<string, any>)
      );
    } else {
      setEditFields(null);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      let config_value: any;
      const schema = CONFIG_SCHEMAS[editing.config_key];
      if (schema && editFields) {
        // 表格模式：数值字段校验 + 按 Schema 字段顺序重建 JSON 对象
        for (const f of schema.fields) {
          if (f.type === 'number') {
            const v = editFields[f.key];
            if (v === '' || v === null || v === undefined || Number.isNaN(Number(v))) {
              toast({ title: `${f.label} 请输入有效数值`, variant: 'destructive' });
              setSaving(false);
              return;
            }
          }
        }
        config_value = schema.fields.reduce((acc, f) => {
          acc[f.key] = f.type === 'number' ? Number(editFields[f.key]) : editFields[f.key];
          return acc;
        }, {} as Record<string, any>);
      } else {
        // JSON 回退模式
        try {
          config_value = JSON.parse(editValue);
        } catch {
          toast({ title: 'JSON格式错误，请检查后重试', variant: 'destructive' });
          setSaving(false);
          return;
        }
      }
      const res = await fetch(`/api/admin/trade/config/${editing.config_key}`, {
        method: 'PUT',
        headers: getClientAuthHeaders(),
        body: JSON.stringify({ config_value }),
      });
      const data = await res.json();
      if (!data.success) {
        toast({ title: '保存失败', description: data.error || '请稍后重试', variant: 'destructive' });
        return;
      }
      toast({ title: '保存成功', description: `${editing.config_key} 已更新并实时生效` });
      setEditing(null);
      loadConfigs();
    } catch (e: any) {
      toast({ title: '保存失败', description: e?.message || '网络异常', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newForm.config_key.trim()) {
      toast({ title: '请输入配置Key', variant: 'destructive' });
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(newForm.config_value || '""');
    } catch {
      toast({ title: 'JSON格式错误，请检查后重试', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/trade/config', {
        method: 'POST',
        headers: getClientAuthHeaders(),
        body: JSON.stringify({
          config_key: newForm.config_key.trim(),
          config_value: parsed,
          config_type: newForm.config_type,
          description: newForm.description || null,
          category: newForm.category,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast({ title: '创建失败', description: data.error || '请稍后重试', variant: 'destructive' });
        return;
      }
      toast({ title: '创建成功' });
      setCreating(false);
      setNewForm({ config_key: '', config_value: '', config_type: 'json', description: '', category: 'system' });
      loadConfigs();
    } catch (e: any) {
      toast({ title: '创建失败', description: e?.message || '网络异常', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[140px]">
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={loadConfigs}>
            <RefreshCw className="h-4 w-4 mr-1" /> 刷新
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> 新增配置
          </Button>
          <span className="ml-auto text-xs text-gray-500">共 {total} 条配置</span>
        </CardContent>
      </Card>

      {/* 配置列表 */}
      <Card>
        <CardContent className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> 加载中...
            </div>
          )}
          {!loading && records.length === 0 && <div className="py-10 text-center text-gray-400">暂无配置</div>}

          {!loading && records.length > 0 && (
            <div className="space-y-2.5">
              {records.map((record) => {
                // #[202608301500] 配置Key中文显示：映射优先 → DB description 兜底 → 原始 key
                const configLabel = TRADE_CONFIG_LABELS[record.config_key];
                const displayName = configLabel?.name || record.description || record.config_key;
                const displayDesc = configLabel?.description || record.description;
                return (
                <div key={record.id} className="flex items-center justify-between rounded-lg border p-3.5 hover:border-blue-300 transition-colors">
                  <div className="min-w-0 flex-1 mr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* #[202608301800] 名称行只放配置名+类型，分类 Badge 移到描述行，避免「品牌匹配权重+品牌」视觉连读 */}
                      <span className="text-sm font-semibold">{displayName}</span>
                      {/* #[202608301500] 类型列中文显示 */}
                      <Badge className="bg-blue-50 text-blue-600">{getTypeLabel(record.config_type)}</Badge>
                      {!record.is_active && <Badge className="bg-red-100 text-red-600">已停用</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {/* #20260829-2343 全局汉化：Badge 显示中文分类名（DB 驱动，找不到则回退到英文 code） */}
                      <Badge className="bg-gray-100 text-gray-600">{getCategoryLabel(record.category)}</Badge>
                      {displayDesc && <span className="text-sm text-gray-500">{displayDesc}</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 font-mono break-all">Key: {record.config_key}</div>
                    <div className="text-xs text-gray-400 mt-1 font-mono break-all line-clamp-1">
                      {JSON.stringify(record.config_value)}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(record)}>
                    <Save className="h-3.5 w-3.5 mr-1" /> 编辑
                  </Button>
                </div>
                );
              })}
            </div>
          )}

          {!loading && total > pageSize && (
            <div className="flex items-center justify-end mt-4 gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
              <span className="px-2 py-1 text-xs text-gray-500">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            {/* #[202608301500] 编辑弹窗标题显示中文名，Key 作为辅助信息 */}
            <DialogTitle>编辑配置：{editing ? (TRADE_CONFIG_LABELS[editing.config_key]?.name || editing.config_key) : ''}</DialogTitle>
            <DialogDescription>
              {editing && CONFIG_SCHEMAS[editing.config_key]
                ? `${CONFIG_SCHEMAS[editing.config_key].description}。修改后立即生效，所有引用该配置的模块实时读取最新值。`
                : '修改后立即生效，所有引用该配置的模块实时读取最新值。'}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            (() => {
              const schema = CONFIG_SCHEMAS[editing.config_key];
              // #[202608302000] 表格模式：有 Schema 时按字段表格展示，字段名中文、值独立编辑、带修改效果说明
              if (schema && editFields) {
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="text-gray-500">配置Key：</span>
                        <span className="font-mono text-xs break-all">{editing.config_key}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">类型：</span>
                        {getTypeLabel(editing.config_type)}
                      </div>
                      <div>
                        <span className="text-gray-500">分类：</span>
                        {getCategoryLabel(editing.category)}
                      </div>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-gray-500">
                            <th className="px-4 py-2 font-medium w-2/6">字段名</th>
                            <th className="px-4 py-2 font-medium w-2/6">当前值</th>
                            <th className="px-4 py-2 font-medium">修改效果说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schema.fields.map((field) => (
                            <tr key={field.key} className="border-t">
                              <td className="px-4 py-3 font-medium">{field.label}</td>
                              <td className="px-4 py-3">
                                {field.type === 'boolean' ? (
                                  <Switch
                                    checked={!!editFields[field.key]}
                                    onCheckedChange={(checked) => setEditFields((prev) => ({ ...prev, [field.key]: checked }))}
                                  />
                                ) : field.type === 'select' ? (
                                  <Select
                                    value={String(editFields[field.key] ?? '')}
                                    onValueChange={(val) => setEditFields((prev) => ({ ...prev, [field.key]: val }))}
                                  >
                                    <SelectTrigger className="w-48">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {field.options?.map((opt) => (
                                        <SelectItem key={opt} value={opt}>{field.optionLabels?.[opt] || opt}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : field.type === 'string' ? (
                                  <Input
                                    value={String(editFields[field.key] ?? '')}
                                    onChange={(e) => setEditFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    className="w-48"
                                  />
                                ) : (
                                  <Input
                                    type="number"
                                    value={editFields[field.key] ?? ''}
                                    onChange={(e) => setEditFields((prev) => ({ ...prev, [field.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                    className="w-32"
                                  />
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">{field.hint}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">{schema.globalHint}</div>
                  </div>
                );
              }
              // JSON 回退模式：未登记 Schema 的自定义配置仍用 JSON 文本编辑 + 字段说明
              return (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">配置Key</div>
                    <Input value={editing.config_key} readOnly className="font-mono text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">类型</div>
                      <Input value={getTypeLabel(editing.config_type)} readOnly className="text-xs" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">分类</div>
                      <Input value={getCategoryLabel(editing.category)} readOnly className="text-xs" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">配置值</div>
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-48 font-mono text-xs"
                      spellCheck={false}
                    />
                    {/* #[202608301900] 字段说明表格：JSON 键名保持英文可解析，UI 层补充中文说明 */}
                    <div className="mt-2">
                      <FieldHelpTable configKey={editing.config_key} valueText={editValue} />
                    </div>
                  </div>
                </div>
              );
            })()
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增弹窗 */}
      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增配置</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">配置Key</div>
              <Input value={newForm.config_key} onChange={(e) => setNewForm({ ...newForm, config_key: e.target.value })} placeholder="请输入配置Key" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">分类</div>
                <Select value={newForm.category} onValueChange={(v) => setNewForm({ ...newForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">类型</div>
                <Select value={newForm.config_type} onValueChange={(v) => setNewForm({ ...newForm, config_type: v })}>
                  <SelectTrigger><SelectValue>{getTypeLabel(newForm.config_type)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">配置值</div>
              <Textarea
                value={newForm.config_value}
                onChange={(e) => setNewForm({ ...newForm, config_value: e.target.value })}
                className="h-24 font-mono text-xs"
                placeholder='{"key": "value"}'
                spellCheck={false}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">描述</div>
              <Input value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} placeholder="请输入描述" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>取消</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
