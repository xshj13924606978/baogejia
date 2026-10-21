'use client';

// 管理端：品牌推广套餐管理（阶段三 #202608292600-厂商付费推广）
// API: GET/POST /api/admin/brand/packages, PUT/DELETE /api/admin/brand/packages/:id

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Loader2, RefreshCw, Plus, Pencil, Trash2, Store } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';

interface BrandPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  priority_level: number;
  duration_days: number;
  boost_score: number;
  match_boost: number;
  is_verified: boolean;
  sort_order: number;
  is_active: boolean;
  is_popular: boolean;
  created_at: string;
}

const LEVEL_LABEL: Record<number, string> = { 1: '白银', 2: '黄金', 3: '铂金' };
const LEVEL_STYLE: Record<number, string> = {
  1: 'bg-slate-200 text-slate-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white',
};

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  price: '',
  original_price: '',
  priority_level: '1',
  duration_days: '30',
  boost_score: '100',
  match_boost: '20',
  is_verified: false,
  sort_order: '0',
  is_active: true,
  is_popular: false,
};

export const BrandPackageManagement: React.FC = () => {
  const { toast } = useToast();
  const [packages, setPackages] = useState<BrandPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BrandPackage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/brand/packages', { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取套餐失败');
      setPackages(data.packages || []);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (pkg: BrandPackage) => {
    setEditingId(pkg.id);
    setForm({
      code: pkg.code,
      name: pkg.name,
      description: pkg.description || '',
      price: String(pkg.price),
      original_price: pkg.original_price != null ? String(pkg.original_price) : '',
      priority_level: String(pkg.priority_level),
      duration_days: String(pkg.duration_days),
      boost_score: String(pkg.boost_score),
      match_boost: String(pkg.match_boost),
      is_verified: pkg.is_verified,
      sort_order: String(pkg.sort_order),
      is_active: pkg.is_active,
      is_popular: pkg.is_popular,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.price || !form.duration_days) {
      toast({ title: '提示', description: '请填写必填字段（编码/名称/价格/时长）', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description || undefined,
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : undefined,
        priority_level: Number(form.priority_level),
        duration_days: Number(form.duration_days),
        boost_score: Number(form.boost_score || 0),
        match_boost: Number(form.match_boost || 0),
        is_verified: form.is_verified,
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active,
        is_popular: form.is_popular,
      };
      const url = editingId ? `/api/admin/brand/packages/${editingId}` : '/api/admin/brand/packages';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '保存失败');
      toast({ title: '保存成功' });
      setFormOpen(false);
      loadPackages();
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
      const res = await fetch(`/api/admin/brand/packages/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '删除失败');
      toast({ title: '删除成功', description: data.softDeleted ? '该套餐存在付费记录，已下架' : undefined });
      setDeleteTarget(null);
      loadPackages();
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
          <Store className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-slate-500">共 {packages.length} 个套餐</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadPackages}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />新增套餐
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : packages.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-slate-400">暂无套餐，点击右上角新增</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <Card key={pkg.id} className={`hover:shadow-md transition-shadow ${!pkg.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base">{pkg.name}</span>
                      {pkg.is_popular && <Badge className="bg-blue-500 text-white">热门</Badge>}
                      {!pkg.is_active && <Badge variant="outline">已下架</Badge>}
                    </div>
                    <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_STYLE[pkg.priority_level] || 'bg-gray-100 text-gray-600'}`}>
                      {LEVEL_LABEL[pkg.priority_level] || `等级${pkg.priority_level}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">¥{Number(pkg.price).toFixed(2)}</div>
                    {pkg.original_price && Number(pkg.original_price) > Number(pkg.price) && (
                      <div className="text-xs text-gray-400 line-through">¥{Number(pkg.original_price).toFixed(2)}</div>
                    )}
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500">{pkg.description || '暂无描述'}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-slate-400">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{pkg.duration_days}天</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">权重+{pkg.boost_score}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">匹配+{pkg.match_boost}%</span>
                  {pkg.is_verified && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700">认证</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(pkg)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />编辑
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => setDeleteTarget(pkg)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) setFormOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑套餐' : '新增套餐'}</DialogTitle>
            <DialogDescription>配置品牌推广套餐与权益</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">套餐编码 *</label>
              <Input value={form.code} placeholder="如 silver / gold / platinum" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">套餐名称 *</label>
              <Input value={form.name} placeholder="如 白银推广" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">价格（元）*</label>
              <Input type="number" value={form.price} placeholder="199.00" onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">原价（元）</label>
              <Input type="number" value={form.original_price} placeholder="299.00" onChange={(e) => setForm((f) => ({ ...f, original_price: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">优先等级 *</label>
              <Select value={form.priority_level} onValueChange={(v) => setForm((f) => ({ ...f, priority_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">白银（1）</SelectItem>
                  <SelectItem value="2">黄金（2）</SelectItem>
                  <SelectItem value="3">铂金（3）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">有效期（天）*</label>
              <Input type="number" value={form.duration_days} onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">排行权重加分</label>
              <Input type="number" value={form.boost_score} onChange={(e) => setForm((f) => ({ ...f, boost_score: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">匹配加成（%）</label>
              <Input type="number" value={form.match_boost} onChange={(e) => setForm((f) => ({ ...f, match_boost: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">排序</label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">描述</label>
              <Textarea rows={2} value={form.description} placeholder="套餐权益描述" onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                上架
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_popular} onCheckedChange={(v) => setForm((f) => ({ ...f, is_popular: v }))} />
                热门
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_verified} onCheckedChange={(v) => setForm((f) => ({ ...f, is_verified: v }))} />
                含认证标识
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除套餐</DialogTitle>
            <DialogDescription>删除后不可恢复，存在付费记录的套餐将自动下架</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">确定删除「{deleteTarget?.name}」吗？</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
