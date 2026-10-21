'use client';

// 管理端：会员套餐管理（阶段二 #202608292500）
// API: GET/POST /api/admin/membership/plans, PUT/DELETE /api/admin/membership/plans/:id

import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, Plus, Pencil, Trash2, Crown } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { MEMBERSHIP_CODE_LABEL } from '@/lib/level-constants';

interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  duration_days: number;
  level_code: string;
  benefits: Record<string, any> | null;
  sort_order: number;
  is_active: boolean;
  is_popular: boolean;
  created_at: string;
}

// #202608302400 阶段1：等级名称统一来源（会员 / 黄金 / 白金）
const LEVEL_LABEL: Record<string, string> = MEMBERSHIP_CODE_LABEL;

const LEVEL_OPTIONS = [
  { value: 'vip', label: MEMBERSHIP_CODE_LABEL.vip },
  { value: 'premium', label: MEMBERSHIP_CODE_LABEL.premium },
  { value: 'enterprise', label: MEMBERSHIP_CODE_LABEL.enterprise },
];

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  price: '',
  original_price: '',
  duration_days: '30',
  level_code: 'vip',
  benefits: '',
  sort_order: '0',
  is_active: true,
  is_popular: false,
};

export const MembershipPlanManager: React.FC = () => {
  const { toast } = useToast();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MembershipPlan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/membership/plans', { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取套餐失败');
      setPlans(data.plans || []);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditingId(plan.id);
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description || '',
      price: String(plan.price),
      original_price: plan.original_price != null ? String(plan.original_price) : '',
      duration_days: String(plan.duration_days),
      level_code: plan.level_code,
      benefits: plan.benefits ? JSON.stringify(plan.benefits) : '',
      sort_order: String(plan.sort_order),
      is_active: plan.is_active,
      is_popular: plan.is_popular,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.price || !form.duration_days || !form.level_code) {
      toast({ title: '校验失败', description: '请填写 code/名称/价格/时长/等级', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let benefits: Record<string, any> | null = null;
      if (form.benefits.trim()) {
        try {
          benefits = JSON.parse(form.benefits);
        } catch {
          toast({ title: '校验失败', description: '权益 JSON 格式不正确', variant: 'destructive' });
          setSaving(false);
          return;
        }
      }
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : null,
        duration_days: Number(form.duration_days),
        level_code: form.level_code,
        benefits,
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active,
        is_popular: form.is_popular,
      };

      const url = editingId
        ? `/api/admin/membership/plans/${editingId}`
        : '/api/admin/membership/plans';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '保存失败');
      toast({ title: '保存成功', duration: 2000 });
      setFormOpen(false);
      loadPlans();
    } catch (e: any) {
      toast({ title: '保存失败', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/membership/plans/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '删除失败');
      toast({
        title: data.softDeleted ? '已下架' : '删除成功',
        description: data.softDeleted ? '存在订阅记录，套餐已软下架' : undefined,
        duration: 2500,
      });
      setDeleteTarget(null);
      loadPlans();
    } catch (e: any) {
      toast({ title: '删除失败', description: e?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-bold">会员套餐管理</h2>
          <span className="text-sm text-slate-400">({plans.length})</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadPlans}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />新增套餐
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">编码</th>
                <th className="px-4 py-3">等级</th>
                <th className="px-4 py-3">价格</th>
                <th className="px-4 py-3">原价</th>
                <th className="px-4 py-3">时长</th>
                <th className="px-4 py-3">排序</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && plans.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无套餐</td>
                </tr>
              )}
              {!loading && plans.map((plan) => (
                <tr key={plan.id} className="border-b hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{plan.name}</div>
                    {plan.description && <div className="text-xs text-slate-400 line-clamp-1">{plan.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{plan.code}</td>
                  <td className="px-4 py-3">
                    <Badge className="bg-purple-100 text-purple-700">{LEVEL_LABEL[plan.level_code] || plan.level_code}</Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold">¥{Number(plan.price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {plan.original_price != null ? `¥${Number(plan.original_price).toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3">{plan.duration_days}天</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{plan.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {plan.is_popular && <Badge className="bg-red-100 text-red-600">热门</Badge>}
                      <Badge className={plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {plan.is_active ? '上架' : '下架'}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(plan)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(plan)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 新增/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑套餐' : '新增套餐'}</DialogTitle>
            <DialogDescription>
              会员套餐通过微信支付销售，支付成功后自动开通/续费
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">编码 code</label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="monthly"
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">名称</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="月度会员" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">价格（元）</label>
              <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="29.90" type="number" step="0.01" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">原价（元，选填）</label>
              <Input value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} placeholder="39.90" type="number" step="0.01" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">时长（天）</label>
              <Input value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} type="number" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">对应会员等级</label>
              <Select value={form.level_code} onValueChange={(v) => setForm({ ...form, level_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">描述</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="会员专属权益说明" rows={2} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">权益 JSON（选填）</label>
              <Textarea value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} placeholder='{"discount_rate":0.9,"exclusive_content":true}' rows={2} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">排序</label>
              <Input value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} type="number" />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                上架
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <Switch checked={form.is_popular} onCheckedChange={(v) => setForm({ ...form, is_popular: v })} />
                热门
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除套餐</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTarget?.name}」吗？存在订阅记录的套餐将自动下架。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
