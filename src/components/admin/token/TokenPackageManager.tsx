'use client';

// 管理端：Token 套餐管理（阶段二 #202608292500）
// API: GET/POST /api/admin/token/packages, PUT/DELETE /api/admin/token/packages/:id

import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, Plus, Pencil, Trash2, Zap } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';

interface TokenPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  token_amount: number;
  price: number;
  original_price: number | null;
  bonus_token: number;
  sort_order: number;
  is_active: boolean;
  is_popular: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  token_amount: '',
  price: '',
  original_price: '',
  bonus_token: '0',
  sort_order: '0',
  is_active: true,
  is_popular: false,
};

export const TokenPackageManager: React.FC = () => {
  const { toast } = useToast();
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TokenPackage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/token/packages', { headers: getClientAuthHeaders() });
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

  const openEdit = (pkg: TokenPackage) => {
    setEditingId(pkg.id);
    setForm({
      code: pkg.code,
      name: pkg.name,
      description: pkg.description || '',
      token_amount: String(pkg.token_amount),
      price: String(pkg.price),
      original_price: pkg.original_price != null ? String(pkg.original_price) : '',
      bonus_token: String(pkg.bonus_token || 0),
      sort_order: String(pkg.sort_order),
      is_active: pkg.is_active,
      is_popular: pkg.is_popular,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.token_amount || !form.price) {
      toast({ title: '校验失败', description: '请填写 code/名称/Token数/价格', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        token_amount: Number(form.token_amount),
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : null,
        bonus_token: Number(form.bonus_token || 0),
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active,
        is_popular: form.is_popular,
      };

      const url = editingId
        ? `/api/admin/token/packages/${editingId}`
        : '/api/admin/token/packages';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '保存失败');
      toast({ title: '保存成功', duration: 2000 });
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
      const res = await fetch(`/api/admin/token/packages/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '删除失败');
      toast({
        title: data.softDeleted ? '已下架' : '删除成功',
        description: data.softDeleted ? '存在购买记录，套餐已软下架' : undefined,
        duration: 2500,
      });
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
          <Zap className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold">Token 套餐管理</h2>
          <span className="text-sm text-slate-400">({packages.length})</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadPackages}>
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
                <th className="px-4 py-3">Token数</th>
                <th className="px-4 py-3">赠送</th>
                <th className="px-4 py-3">价格</th>
                <th className="px-4 py-3">原价</th>
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
              {!loading && packages.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无套餐</td>
                </tr>
              )}
              {!loading && packages.map((pkg) => (
                <tr key={pkg.id} className="border-b hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{pkg.name}</div>
                    {pkg.description && <div className="text-xs text-slate-400 line-clamp-1">{pkg.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{pkg.code}</td>
                  <td className="px-4 py-3 font-semibold">{pkg.token_amount}</td>
                  <td className="px-4 py-3">
                    {pkg.bonus_token > 0 ? (
                      <Badge className="bg-green-100 text-green-700">+{pkg.bonus_token}</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">¥{Number(pkg.price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {pkg.original_price != null ? `¥${Number(pkg.original_price).toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{pkg.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {pkg.is_popular && <Badge className="bg-red-100 text-red-600">热门</Badge>}
                      <Badge className={pkg.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {pkg.is_active ? '上架' : '下架'}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pkg)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(pkg)}>
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
              Token 套餐通过微信支付销售，支付成功后自动到账
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">编码 code</label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="starter"
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">名称</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="体验包" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Token 数量</label>
              <Input value={form.token_amount} onChange={(e) => setForm({ ...form, token_amount: e.target.value })} type="number" placeholder="100" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">赠送 Token</label>
              <Input value={form.bonus_token} onChange={(e) => setForm({ ...form, bonus_token: e.target.value })} type="number" placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">价格（元）</label>
              <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} type="number" step="0.01" placeholder="9.90" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">原价（元，选填）</label>
              <Input value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} type="number" step="0.01" placeholder="19.90" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-500">描述</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="套餐适用场景说明" rows={2} />
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
              确定删除「{deleteTarget?.name}」吗？存在购买记录的套餐将自动下架。
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
