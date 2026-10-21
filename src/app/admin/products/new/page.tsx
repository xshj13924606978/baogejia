'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const FORM_FIELDS = [
  { key: 'name', label: '产品名称', required: true, type: 'text', placeholder: '如：工业离心泵 IS150-125-250' },
  { key: 'category', label: '分类', type: 'text', placeholder: '如：泵类、阀门、电机' },
  { key: 'model', label: '规格型号', type: 'text', placeholder: '如：IS150-125-250' },
  { key: 'brand', label: '品牌', type: 'text', placeholder: '如：上海水泵' },
  { key: 'unit', label: '单位', type: 'text', placeholder: '如：台、套、个' },
  { key: 'price', label: '指导价', required: true, type: 'number', placeholder: '0.00' },
  { key: 'cost_price', label: '成本价', type: 'number', placeholder: '0.00' },
  { key: 'min_price', label: '最低售价', type: 'number', placeholder: '0.00' },
  { key: 'stock', label: '库存', type: 'number', placeholder: '0' },
  { key: 'supplier', label: '供应商', type: 'text', placeholder: '如：格兰富中国' },
  { key: 'contact_person', label: '联系人', type: 'text', placeholder: '如：张三' },
  { key: 'contact_phone', label: '联系电话', type: 'text', placeholder: '如：13800138000' },
  { key: 'image_url', label: '产品图片URL', type: 'text', placeholder: 'https://example.com/image.jpg' },
];

interface FormData {
  [key: string]: string;
}

const emptyForm: FormData = {
  name: '', category: '', model: '', brand: '', unit: '',
  price: '', cost_price: '', min_price: '', stock: '',
  supplier: '', contact_person: '', contact_phone: '', image_url: '',
  parameter_description: '',
};

export default function ProductNewPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('请输入产品名称');
      return;
    }
    if (!form.price || parseFloat(form.price) < 0) {
      toast.error('请输入有效的指导价');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, any> = { name: form.name.trim() };
      FORM_FIELDS.forEach(f => {
        if (f.type === 'number' && form[f.key]) body[f.key] = parseFloat(form[f.key]);
        else if (form[f.key]) body[f.key] = form[f.key].trim();
      });

      const res = await fetch('/api/tables/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('产品创建成功');
        router.push('/admin/products');
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({ ...emptyForm });
  };

  const hasChanges = FORM_FIELDS.some(f => form[f.key] !== '');

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">新增产品</h1>
            <p className="text-gray-500">创建新的产品信息</p>
          </div>
        </div>
      </div>

      {/* 表单 */}
      <Card>
        <CardHeader>
          <CardTitle>产品信息</CardTitle>
          <CardDescription>带 * 为必填字段</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* 产品名称 - 跨两列 */}
            <div className="md:col-span-2">
              <Label>产品名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="如：工业离心泵 IS150-125-250"
              />
            </div>

            {/* 基本信息 */}
            <div>
              <Label>分类</Label>
              <Input value={form.category} onChange={(e) => updateField('category', e.target.value)} placeholder="如：泵类、阀门" />
            </div>
            <div>
              <Label>规格型号</Label>
              <Input value={form.model} onChange={(e) => updateField('model', e.target.value)} placeholder="如：IS150-125-250" />
            </div>
            <div>
              <Label>品牌</Label>
              <Input value={form.brand} onChange={(e) => updateField('brand', e.target.value)} placeholder="如：上海水泵" />
            </div>
            <div>
              <Label>单位</Label>
              <Input value={form.unit} onChange={(e) => updateField('unit', e.target.value)} placeholder="如：台、套" />
            </div>

            {/* 价格信息 */}
            <div>
              <Label>指导价 *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => updateField('price', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>成本价</Label>
              <Input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => updateField('cost_price', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>最低售价</Label>
              <Input type="number" step="0.01" min="0" value={form.min_price} onChange={(e) => updateField('min_price', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>库存</Label>
              <Input type="number" min="0" value={form.stock} onChange={(e) => updateField('stock', e.target.value)} placeholder="0" />
            </div>

            {/* 供应商信息 */}
            <div>
              <Label>供应商</Label>
              <Input value={form.supplier} onChange={(e) => updateField('supplier', e.target.value)} placeholder="如：格兰富中国" />
            </div>
            <div>
              <Label>联系人</Label>
              <Input value={form.contact_person} onChange={(e) => updateField('contact_person', e.target.value)} placeholder="如：张三" />
            </div>
            <div>
              <Label>联系电话</Label>
              <Input value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} placeholder="如：13800138000" />
            </div>
            <div>
              <Label>产品图片URL</Label>
              <Input value={form.image_url} onChange={(e) => updateField('image_url', e.target.value)} placeholder="https://example.com/image.jpg" />
            </div>

            {/* 参数描述 - 跨两列 */}
            <div className="md:col-span-2">
              <Label>参数描述</Label>
              <Textarea
                value={form.parameter_description}
                onChange={(e) => updateField('parameter_description', e.target.value)}
                placeholder="如：流量200m³/h 扬程20m 功率37kW 380V"
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleReset} disabled={submitting || !hasChanges}>
          <RotateCcw className="h-4 w-4 mr-2" />
          重置
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/products')} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            创建产品
          </Button>
        </div>
      </div>
    </div>
  );
}
