'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Pencil, Trash2, Loader2, Package, DollarSign,
  Building2, User, Phone, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  model?: string;
  brand?: string;
  category?: string;
  price: number;
  unit?: string;
  parameter_description?: string;
  supplier?: string;
  contact_person?: string;
  contact_phone?: string;
  cost_price?: number;
  min_price?: number;
  stock?: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const loadProduct = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products?id=${productId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setProduct(data.data);
      } else {
        toast.error('产品不存在');
        router.push('/admin/products');
      }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (productId) loadProduct(); }, [productId]);

  const openEdit = () => {
    if (!product) return;
    setEditForm({
      name: product.name, category: product.category || '', model: product.model || '',
      brand: product.brand || '', unit: product.unit || '',
      price: String(product.price), cost_price: String(product.cost_price || ''),
      min_price: String(product.min_price || ''), stock: String(product.stock || 0),
      supplier: product.supplier || '', contact_person: product.contact_person || '',
      contact_phone: product.contact_phone || '', image_url: product.image_url || '',
      parameter_description: product.parameter_description || '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) { toast.error('产品名称不能为空'); return; }
    setSaving(true);
    try {
      const body: Record<string, any> = { name: editForm.name.trim() };
      const numFields = ['price', 'cost_price', 'min_price', 'stock'];
      const strFields = ['category', 'model', 'brand', 'unit', 'supplier', 'contact_person', 'contact_phone', 'image_url', 'parameter_description'];
      numFields.forEach(k => { if (editForm[k] !== '') body[k] = parseFloat(editForm[k]); });
      strFields.forEach(k => { if (editForm[k]) body[k] = editForm[k].trim(); });

      const res = await fetch(`/api/tables/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { toast.success('产品已更新'); setEditOpen(false); loadProduct(); }
      else toast.error(data.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tables/products/${productId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('产品已删除'); router.push('/admin/products'); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载产品详情...</span>
      </div>
    );
  }

  if (!product) return null;

  const InfoRow = ({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-gray-400 shrink-0" />}
      <span className="text-sm text-gray-500 w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <p className="text-gray-500">ID: {product.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            编辑
          </Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
        </div>
      </div>

      {/* 产品图片 */}
      {product.image_url && (
        <Card>
          <CardContent className="p-4 flex justify-center">
            <img src={product.image_url} alt={product.name} className="max-h-48 rounded-lg border object-contain" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Package} label="分类" value={product.category ? <Badge variant="outline">{product.category}</Badge> : null} />
            <InfoRow icon={BarChart3} label="规格型号" value={product.model} />
            <InfoRow label="品牌" value={product.brand} />
            <InfoRow label="单位" value={product.unit} />
            <InfoRow label="参数描述" value={product.parameter_description} />
          </CardContent>
        </Card>

        {/* 价格信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">价格信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={DollarSign} label="指导价" value={<span className="text-green-600 font-bold">¥{Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>} />
            <InfoRow icon={DollarSign} label="成本价" value={product.cost_price ? <span className="text-red-600">¥{Number(product.cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : null} />
            <InfoRow icon={DollarSign} label="最低售价" value={product.min_price ? <span className="text-orange-600">¥{Number(product.min_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : null} />
            <InfoRow label="库存" value={product.stock !== undefined ? `${product.stock} ${product.unit || '件'}` : null} />
          </CardContent>
        </Card>

        {/* 供应商信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">供应商信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Building2} label="供应商" value={product.supplier} />
            <InfoRow icon={User} label="联系人" value={product.contact_person} />
            <InfoRow icon={Phone} label="联系电话" value={product.contact_phone} />
          </CardContent>
        </Card>

        {/* 时间信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">其他信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="产品ID" value={product.id} />
            <InfoRow label="创建时间" value={product.created_at ? new Date(product.created_at).toLocaleString('zh-CN') : '-'} />
            <InfoRow label="更新时间" value={product.updated_at ? new Date(product.updated_at).toLocaleString('zh-CN') : '-'} />
          </CardContent>
        </Card>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={editOpen} onOpenChange={(o) => !saving && setEditOpen(o)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑产品</DialogTitle>
            <DialogDescription>修改「{product.name}」的信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2 py-2">
            <div className="md:col-span-2">
              <Label>产品名称 *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>分类</Label>
              <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
            </div>
            <div>
              <Label>规格型号</Label>
              <Input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} />
            </div>
            <div>
              <Label>品牌</Label>
              <Input value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} />
            </div>
            <div>
              <Label>单位</Label>
              <Input value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} />
            </div>
            <div>
              <Label>指导价 *</Label>
              <Input type="number" step="0.01" min="0" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} />
            </div>
            <div>
              <Label>成本价</Label>
              <Input type="number" step="0.01" min="0" value={editForm.cost_price} onChange={(e) => setEditForm({ ...editForm, cost_price: e.target.value })} />
            </div>
            <div>
              <Label>最低售价</Label>
              <Input type="number" step="0.01" min="0" value={editForm.min_price} onChange={(e) => setEditForm({ ...editForm, min_price: e.target.value })} />
            </div>
            <div>
              <Label>库存</Label>
              <Input type="number" min="0" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })} />
            </div>
            <div>
              <Label>供应商</Label>
              <Input value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} />
            </div>
            <div>
              <Label>联系人</Label>
              <Input value={editForm.contact_person} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })} />
            </div>
            <div>
              <Label>联系电话</Label>
              <Input value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
            </div>
            <div>
              <Label>产品图片URL</Label>
              <Input value={editForm.image_url} onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>参数描述</Label>
              <Textarea value={editForm.parameter_description} onChange={(e) => setEditForm({ ...editForm, parameter_description: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除对话框 */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !saving && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除产品「{product.name}」(ID: {product.id})吗？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
