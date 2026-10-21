'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { CUSTOMER_LEVELS, CUSTOMER_STATUSES, type Customer, type UserOption } from './types';

interface CustomerFormProps {
  /** admin：管理后台（可指定所属用户，snake_case payload）；user：用户端（camelCase payload） */
  mode: 'admin' | 'user';
  customerId?: number;
  initialData?: Customer | null;
  /** admin 模式下所属用户下拉选项 */
  users?: UserOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface FormState {
  userId: string;
  company_name: string;
  project_name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  bank_name: string;
  bank_account: string;
  tax_number: string;
  payment_terms: string;
  credit_limit: string;
  notes: string;
  level: string;
  status: string;
  region: string;
  industry: string;
  tags: string;
}

const emptyForm: FormState = {
  userId: '',
  company_name: '',
  project_name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  bank_name: '',
  bank_account: '',
  tax_number: '',
  payment_terms: '',
  credit_limit: '',
  notes: '',
  level: '',
  status: 'active',
  region: '',
  industry: '',
  tags: '',
};

function buildInitialForm(data?: Customer | null): FormState {
  if (!data) return emptyForm;
  const m = data.metadata || {};
  return {
    userId: m.user_id || '',
    company_name: data.company_name || '',
    project_name: data.project_name || '',
    contact_person: data.contact_person || '',
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    bank_name: data.bank_name || '',
    bank_account: data.bank_account || '',
    tax_number: data.tax_number || '',
    payment_terms: data.payment_terms || '',
    credit_limit: data.credit_limit != null ? String(data.credit_limit) : '',
    notes: data.notes || '',
    level: m.level || '',
    status: m.status || 'active',
    region: m.region || '',
    industry: m.industry || '',
    tags: Array.isArray(m.tags) ? m.tags.join(', ') : '',
  };
}

const trim = (s: string) => s.trim();
const numOrNull = (s: string) => (s === '' ? null : Number(s));
const splitTags = (s: string) =>
  s
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);

export function CustomerForm({
  mode,
  customerId,
  initialData,
  users = [],
  onSuccess,
  onCancel,
}: CustomerFormProps) {
  const router = useRouter();
  const isAdmin = mode === 'admin';
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initialData));
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): string | null => {
    if (!form.company_name.trim()) return '公司名称不能为空';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return '邮箱格式不正确';
    if (form.phone && !/^[\d+\-\s()]{5,20}$/.test(form.phone)) return '手机号格式不正确';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ variant: 'destructive', description: err });
      return;
    }

    const basic = {
      company_name: trim(form.company_name),
      project_name: trim(form.project_name) || null,
      contact_person: trim(form.contact_person) || null,
      phone: trim(form.phone) || null,
      email: trim(form.email) || null,
      address: trim(form.address) || null,
      bank_name: trim(form.bank_name) || null,
      bank_account: trim(form.bank_account) || null,
      tax_number: trim(form.tax_number) || null,
      payment_terms: trim(form.payment_terms) || null,
      credit_limit: numOrNull(form.credit_limit),
      notes: trim(form.notes) || null,
    };

    const metadata: Record<string, unknown> = {};
    if (form.level) metadata.level = form.level;
    if (form.status) metadata.status = form.status;
    if (form.region.trim()) metadata.region = form.region.trim();
    if (form.industry.trim()) metadata.industry = form.industry.trim();
    const tags = splitTags(form.tags);
    if (tags.length) metadata.tags = tags;

    let payload: Record<string, unknown>;
    let url: string;
    let method: string;

    if (isAdmin) {
      if (form.userId) metadata.user_id = form.userId;
      url = customerId
        ? `/api/admin/customers/${customerId}`
        : '/api/admin/customers';
      method = customerId ? 'PUT' : 'POST';
      payload = { ...basic, ...metadata };
    } else {
      url = '/api/customers';
      if (customerId) {
        method = 'PUT';
        payload = {
          id: customerId,
          companyName: basic.company_name,
          projectName: basic.project_name,
          contactPerson: basic.contact_person,
          phone: basic.phone,
          email: basic.email,
          address: basic.address,
          bankName: basic.bank_name,
          bankAccount: basic.bank_account,
          taxNumber: basic.tax_number,
          paymentTerms: basic.payment_terms,
          creditLimit: basic.credit_limit,
          notes: basic.notes,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        };
      } else {
        method = 'POST';
        payload = {
          companyName: basic.company_name,
          projectName: basic.project_name,
          contactPerson: basic.contact_person,
          phone: basic.phone,
          email: basic.email,
          address: basic.address,
          bankName: basic.bank_name,
          bankAccount: basic.bank_account,
          taxNumber: basic.tax_number,
          paymentTerms: basic.payment_terms,
          creditLimit: basic.credit_limit,
          notes: basic.notes,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        };
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      const ok = isAdmin
        ? data.success
        : !!(data.customer || data.success);
      if (ok) {
        // ✅ #[20260827-1807-1] 客户信息保存后，跨窗口/跨组件广播同步事件：
        //   - 当前页面窗口：用 CustomEvent（dispatchEvent）
        //   - 跨标签页/窗口：用 localStorage 'storage' 事件（其他标签的报价单可即时刷新）
        //   - 字段命名与 QuoteTable 的 customerInfo 对齐：companyName → name（渲染用的是 customerInfo.name）
        //   - 字段命名与供应商库对齐：bank_name → bankName, bank_account → bankAccount, tax_number → taxNumber（统一语义）
        const customerIdForEvent = customerId ?? (data?.customer?.id) ?? null;
        try {
          const detail = {
            id: customerIdForEvent,
            name: basic.company_name,
            companyName: basic.company_name,
            projectName: basic.project_name,
            contactPerson: basic.contact_person,
            phone: basic.phone,
            email: basic.email,
            address: basic.address,
            bankName: basic.bank_name,
            bankAccount: basic.bank_account,
            taxNumber: basic.tax_number,
            updatedAt: Date.now(),
          };
          window.dispatchEvent(new CustomEvent('customer-info-updated', { detail }));
          try {
            localStorage.setItem(
              'customer-info-updated-event',
              JSON.stringify(detail)
            );
            localStorage.removeItem('customer-info-updated-event');
            // ✅ #[20260827-1807-2] 写一个长期保留的 cache key，QuoteTable 挂载时读取并应用
            //   解决"客户编辑页保存 → 跳走 → QuoteTable 重新挂载时不知道之前的最新值"问题
            localStorage.setItem('customer-info-updated-cache', JSON.stringify(detail));
          } catch (_e) { /* localStorage 不可用，忽略 */ }
        } catch (_err) { /* noop */ }
        toast({ description: customerId ? '客户更新成功' : '客户创建成功' });
        if (onSuccess) onSuccess();
        else router.push(isAdmin ? '/admin/customers' : '/customers');
      } else {
        toast({ variant: 'destructive', description: data.error || (customerId ? '更新失败' : '创建失败') });
      }
    } catch {
      toast({ variant: 'destructive', description: '网络错误' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.back();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{customerId ? '编辑客户' : '新增客户'}</h1>
          <p className="text-sm text-muted-foreground">
            {customerId ? '修改客户资料与扩展信息' : '创建新的客户资料'}
          </p>
        </div>
        <Button variant="outline" onClick={handleCancel}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>
              公司名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
              placeholder="请输入公司名称"
            />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label>所属用户</Label>
              <Select
                value={form.userId || 'none'}
                onValueChange={(v) => set('userId', v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择归属用户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分配</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>项目名称</Label>
            <Input
              value={form.project_name}
              onChange={(e) => set('project_name', e.target.value)}
              placeholder="关联项目名称"
            />
          </div>
          <div className="space-y-2">
            <Label>联系人</Label>
            <Input
              value={form.contact_person}
              onChange={(e) => set('contact_person', e.target.value)}
              placeholder="联系人姓名"
            />
          </div>
          <div className="space-y-2">
            <Label>手机号</Label>
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="手机号码"
            />
          </div>
          <div className="space-y-2">
            <Label>邮箱</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="邮箱地址"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>地址</Label>
            <Input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="联系地址"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>财务信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>开户行</Label>
            <Input
              value={form.bank_name}
              onChange={(e) => set('bank_name', e.target.value)}
              placeholder="开户行名称"
            />
          </div>
          <div className="space-y-2">
            <Label>银行账号</Label>
            <Input
              value={form.bank_account}
              onChange={(e) => set('bank_account', e.target.value)}
              placeholder="银行账号"
            />
          </div>
          <div className="space-y-2">
            <Label>税号</Label>
            <Input
              value={form.tax_number}
              onChange={(e) => set('tax_number', e.target.value)}
              placeholder="纳税人识别号"
            />
          </div>
          <div className="space-y-2">
            <Label>付款方式</Label>
            <Input
              value={form.payment_terms}
              onChange={(e) => set('payment_terms', e.target.value)}
              placeholder="如：月结30天"
            />
          </div>
          <div className="space-y-2">
            <Label>信用额度</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.credit_limit}
              onChange={(e) => set('credit_limit', e.target.value)}
              placeholder="信用额度（元）"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>扩展信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>客户等级</Label>
            <Select
              value={form.level || 'none'}
              onValueChange={(v) => set('level', v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择等级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未设置</SelectItem>
                {CUSTOMER_LEVELS.map((lv) => (
                  <SelectItem key={lv} value={lv}>
                    {lv} 级
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>状态</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>地区</Label>
            <Input
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              placeholder="如：广东省深圳市"
            />
          </div>
          <div className="space-y-2">
            <Label>行业</Label>
            <Input
              value={form.industry}
              onChange={(e) => set('industry', e.target.value)}
              placeholder="如：环保工程"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>标签</Label>
            <Input
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="多个标签用逗号分隔，如：重点客户, 长期合作"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>备注</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="其他备注信息"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleCancel} disabled={submitting}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {customerId ? '保存修改' : '创建客户'}
        </Button>
      </div>
    </div>
  );
}
