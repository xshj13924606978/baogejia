'use client';

// 管理端：积分商城管理
// - 商品管理（创建/编辑/删除/上下架）
// - 兑换记录（发货/发放）

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2, RefreshCw, Plus, Pencil, Trash2, Package, Truck, CheckCircle2,
} from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';

interface MallProduct {
  id: string;
  name: string;
  description: string | null;
  category: 'vip' | 'rank' | 'gift' | 'template' | 'physical' | 'custom';
  points_price: number;
  cash_price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  is_virtual: boolean;
  sort_order: number;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface ExchangeRecord {
  id: string;
  exchange_no: string;
  user_id: string;
  product_name: string;
  category: string;
  points_used: number;
  cash_paid: number;
  quantity: number;
  pay_method: 'points' | 'cash';
  status: 'pending' | 'completed' | 'shipped' | 'cancelled' | 'refunded';
  delivery_info: Record<string, any> | null;
  remark: string | null;
  created_at: string;
  user?: { id: string; username?: string; email?: string; phone?: string } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  vip: '会员', rank: '推广', gift: '礼品', template: '模板', physical: '实物', custom: '定制',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL);

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  completed: '已完成',
  shipped: '已发货',
  cancelled: '已取消',
  refunded: '已退款',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  shipped: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500',
  refunded: 'bg-red-100 text-red-700',
};

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'gift' as MallProduct['category'],
  points_price: '0',
  cash_price: '0',
  stock: '-1',
  image_url: '',
  is_virtual: true,
  sort_order: '0',
  metadata: '',
};

export const MallManagement: React.FC = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('products');

  // 商品
  const [products, setProducts] = useState<MallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MallProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 兑换记录
  const [exchanges, setExchanges] = useState<ExchangeRecord[]>([]);
  const [exchangeTotal, setExchangeTotal] = useState(0);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeFilter, setExchangeFilter] = useState('all');
  const [exchangePage, setExchangePage] = useState(1);
  const [deliverTarget, setDeliverTarget] = useState<ExchangeRecord | null>(null);
  const [deliverInfo, setDeliverInfo] = useState('');
  const [delivering, setDelivering] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mall/products', { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取商品失败');
      setProducts(data.products || []);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadExchanges = useCallback(async () => {
    setExchangeLoading(true);
    try {
      const res = await fetch(`/api/admin/mall/exchanges?status=${exchangeFilter}&page=${exchangePage}&pageSize=20`, {
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取兑换记录失败');
      setExchanges(data.records || []);
      setExchangeTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message, variant: 'destructive' });
    } finally {
      setExchangeLoading(false);
    }
  }, [exchangeFilter, exchangePage, toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (tab === 'exchanges') loadExchanges();
  }, [tab, loadExchanges]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (p: MallProduct) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description || '',
      category: p.category,
      points_price: String(p.points_price),
      cash_price: String(p.cash_price),
      stock: String(p.stock),
      image_url: p.image_url || '',
      is_virtual: p.is_virtual,
      sort_order: String(p.sort_order),
      metadata: p.metadata ? JSON.stringify(p.metadata) : '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: '校验失败', description: '商品名称不能为空', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      category: form.category,
      points_price: Number(form.points_price) || 0,
      cash_price: Number(form.cash_price) || 0,
      stock: form.stock === '' ? -1 : Number(form.stock),
      image_url: form.image_url || null,
      is_virtual: form.is_virtual,
      sort_order: Number(form.sort_order) || 0,
      metadata: form.metadata ? (() => {
        try { return JSON.parse(form.metadata); } catch { return null; }
      })() : null,
    };
    try {
      const res = await fetch(editingId ? `/api/admin/mall/products/${editingId}` : '/api/admin/mall/products', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '保存失败');
      toast({ title: '保存成功' });
      setFormOpen(false);
      loadProducts();
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
      const res = await fetch(`/api/admin/mall/products/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '删除失败');
      toast({ title: data.softDeleted ? '已下架' : '已删除', description: data.message });
      setDeleteTarget(null);
      loadProducts();
    } catch (e: any) {
      toast({ title: '删除失败', description: e?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (p: MallProduct) => {
    try {
      const res = await fetch(`/api/admin/mall/products/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      toast({ title: p.is_active ? '已下架' : '已上架' });
      loadProducts();
    } catch (e: any) {
      toast({ title: '操作失败', description: e?.message, variant: 'destructive' });
    }
  };

  const handleDeliver = async () => {
    if (!deliverTarget) return;
    setDelivering(true);
    try {
      const res = await fetch(`/api/admin/mall/exchanges/${deliverTarget.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ deliveryInfo: deliverInfo ? { tracking_no: deliverInfo } : {} }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      toast({ title: '操作成功', description: deliverTarget.category === 'physical' ? '已标记为已发货' : '已发放权益' });
      setDeliverTarget(null);
      setDeliverInfo('');
      loadExchanges();
    } catch (e: any) {
      toast({ title: '操作失败', description: e?.message, variant: 'destructive' });
    } finally {
      setDelivering(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(exchangeTotal / 20));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">积分商城管理</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="products" className="flex items-center gap-1">
            <Package className="h-4 w-4" />商品管理
          </TabsTrigger>
          <TabsTrigger value="exchanges" className="flex items-center gap-1">
            <Truck className="h-4 w-4" />兑换记录
          </TabsTrigger>
        </TabsList>

        {/* 商品管理 */}
        <TabsContent value="products">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-500">共 {products.length} 个商品</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadProducts}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
              </Button>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />新增商品
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-slate-400">暂无商品</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {products.map((p) => (
                <Card key={p.id} className={`p-4 ${!p.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.name}</span>
                        {!p.is_active && <Badge className="bg-gray-100 text-gray-500">已下架</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 line-clamp-2">{p.description || '暂无描述'}</div>
                    </div>
                    <Badge className="bg-violet-100 text-violet-700 shrink-0">{CATEGORY_LABEL[p.category] || p.category}</Badge>
                  </div>

                  <div className="flex items-center gap-3 text-sm my-2">
                    {p.points_price > 0 && <span className="font-bold text-orange-600">{p.points_price}积分</span>}
                    {p.cash_price > 0 && <span className="font-semibold text-slate-600">¥{p.cash_price}</span>}
                    <Badge className={p.is_virtual ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                      {p.is_virtual ? '虚拟' : '实物'}
                    </Badge>
                    <Badge className={p.stock === -1 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                      {p.stock === -1 ? '无限库存' : `库存 ${p.stock}`}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t pt-2">
                    <Button size="sm" variant="ghost" onClick={() => handleToggleActive(p)}>
                      {p.is_active ? '下架' : '上架'}
                    </Button>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />编辑
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setDeleteTarget(p)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />删除
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 兑换记录 */}
        <TabsContent value="exchanges">
          <div className="flex items-center justify-between mb-4">
            <Select value={exchangeFilter} onValueChange={(v) => { setExchangePage(1); setExchangeFilter(v); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="pending">待处理</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="shipped">已发货</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
                <SelectItem value="refunded">已退款</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadExchanges}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
            </Button>
          </div>

          {exchangeLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
            </div>
          ) : exchanges.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-slate-400">暂无兑换记录</div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 dark:bg-slate-800/50 text-left">
                      <th className="px-4 py-2 font-medium">单号</th>
                      <th className="px-4 py-2 font-medium">用户</th>
                      <th className="px-4 py-2 font-medium">商品</th>
                      <th className="px-4 py-2 font-medium">支付</th>
                      <th className="px-4 py-2 font-medium">状态</th>
                      <th className="px-4 py-2 font-medium">时间</th>
                      <th className="px-4 py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchanges.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-xs text-slate-500">{r.exchange_no}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.user?.username || r.user?.phone || r.user?.email || '未知'}</div>
                          <div className="text-xs text-slate-400">{r.user?.phone || r.user?.email || r.user_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.product_name}</div>
                          <div className="text-xs text-slate-400">×{r.quantity} {CATEGORY_LABEL[r.category] || r.category}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-orange-600">
                            {r.pay_method === 'points' ? `${r.points_used}积分` : `¥${r.cash_paid}`}
                          </div>
                          <div className="text-xs text-slate-400">{r.pay_method === 'points' ? '积分兑换' : '现金购买'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {new Date(r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          {(r.status === 'pending' || r.status === 'completed') && (
                            <Button size="sm" className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-700"
                              onClick={() => { setDeliverTarget(r); setDeliverInfo(''); }}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              {r.status === 'pending' ? (r.category === 'physical' ? '发货' : '发放') : '重新发放'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
                <span className="text-slate-400">共 {exchangeTotal} 条</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={exchangePage <= 1} onClick={() => setExchangePage(exchangePage - 1)}>上一页</Button>
                  <span className="flex items-center text-xs text-slate-500">第 {exchangePage} / {totalPages} 页</span>
                  <Button size="sm" variant="outline" disabled={exchangePage >= totalPages} onClick={() => setExchangePage(exchangePage + 1)}>下一页</Button>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 商品表单弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑商品' : '新增商品'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">商品名称 *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="商品名称" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">商品描述</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="商品描述" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">分类</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">商品类型</label>
                <Select value={form.is_virtual ? 'virtual' : 'physical'} onValueChange={(v) => setForm({ ...form, is_virtual: v === 'virtual' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virtual">虚拟商品（自动发放）</SelectItem>
                    <SelectItem value="physical">实物商品（人工发货）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">积分价格</label>
                <Input type="number" min={0} value={form.points_price} onChange={(e) => setForm({ ...form, points_price: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">现金价格(¥)</label>
                <Input type="number" min={0} step="0.01" value={form.cash_price} onChange={(e) => setForm({ ...form, cash_price: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">库存(-1无限)</label>
                <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">图片 URL</label>
                <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">排序</label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">扩展元数据(JSON)</label>
              <Input value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} placeholder='{"vipDays":30}' />
            </div>
            <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />保存中...</> : '保存商品'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除商品</DialogTitle>
            <DialogDescription>
              确认删除「{deleteTarget?.name}」？如有兑换记录将自动转为下架。
            </DialogDescription>
          </DialogHeader>
          <Button variant="destructive" className="w-full" onClick={handleDelete} disabled={deleting}>
            {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />删除中...</> : '确认删除'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* 发货弹窗 */}
      <Dialog open={!!deliverTarget} onOpenChange={(v) => { if (!v) setDeliverTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deliverTarget?.category === 'physical' ? '确认发货' : '确认发放'}</DialogTitle>
            <DialogDescription>
              {deliverTarget?.product_name} × {deliverTarget?.quantity}
              {deliverTarget?.category === 'physical' ? '（实物商品，发货后用户可确认收货）' : '（虚拟商品，将标记为已完成）'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {deliverTarget?.category === 'physical' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">物流单号（可选）</label>
                <Input value={deliverInfo} onChange={(e) => setDeliverInfo(e.target.value)} placeholder="快递单号" />
              </div>
            )}
            <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={handleDeliver} disabled={delivering}>
              {delivering ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : '确认'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
