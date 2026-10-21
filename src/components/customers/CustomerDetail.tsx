'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Customer } from './types';

interface CustomerDetailProps {
  customer: Customer;
}

const levelColors: Record<string, string> = {
  A: 'bg-red-100 text-red-700',
  B: 'bg-orange-100 text-orange-700',
  C: 'bg-blue-100 text-blue-700',
  D: 'bg-gray-100 text-gray-700',
};

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium">{value ?? '—'}</p>
    </div>
  );
}

function getOwnerName(c: Customer) {
  if (!c.owner) return '未分配';
  return c.owner.full_name || c.owner.username || c.owner.email || '未命名用户';
}

export function CustomerDetail({ customer }: CustomerDetailProps) {
  const m = customer.metadata || {};
  const tags: string[] = Array.isArray(m.tags) ? m.tags : [];
  const level = m.level as string | undefined;
  const status = m.status as string | undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="公司名称" value={customer.company_name} />
          <Field label="项目名称" value={customer.project_name} />
          <Field label="联系人" value={customer.contact_person} />
          <Field label="手机号" value={customer.phone} />
          <Field label="邮箱" value={customer.email} />
          <Field label="地址" value={customer.address} />
          <Field label="所属用户" value={getOwnerName(customer)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>财务信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="开户行" value={customer.bank_name} />
          <Field label="银行账号" value={customer.bank_account} />
          <Field label="税号" value={customer.tax_number} />
          <Field label="付款方式" value={customer.payment_terms} />
          <Field
            label="信用额度"
            value={
              customer.credit_limit !== null && customer.credit_limit !== undefined
                ? `¥ ${Number(customer.credit_limit).toLocaleString('zh-CN')}`
                : undefined
            }
          />
          <Field label="备注" value={customer.notes} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>扩展信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">客户等级</p>
            <p className="mt-0.5">
              {level ? (
                <Badge
                  variant="outline"
                  className={levelColors[level] || 'bg-gray-100 text-gray-700'}
                >
                  {level} 级
                </Badge>
              ) : (
                <span className="text-sm font-medium">—</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">状态</p>
            <p className="mt-0.5">
              {status === 'disabled' ? (
                <Badge variant="secondary">停用</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">启用</Badge>
              )}
            </p>
          </div>
          <Field label="行业" value={m.industry} />
          <Field label="地区" value={m.region} />
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-sm text-muted-foreground">标签</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.length === 0 ? (
                <span className="text-sm">—</span>
              ) : (
                tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm text-muted-foreground">创建时间</p>
            <p className="mt-0.5 text-sm font-medium">
              {customer.created_at
                ? new Date(customer.created_at).toLocaleString('zh-CN')
                : '—'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm text-muted-foreground">更新时间</p>
            <p className="mt-0.5 text-sm font-medium">
              {customer.updated_at
                ? new Date(customer.updated_at).toLocaleString('zh-CN')
                : '—'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
