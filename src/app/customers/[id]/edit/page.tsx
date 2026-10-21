'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CustomerForm, type Customer } from '@/components/customers';

export default function UserCustomerEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/customers/${id}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setCustomer(json.data as Customer);
        } else {
          toast.error(json.error || '加载客户失败');
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('网络错误');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/customers/${id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回详情
        </Button>
        <div className="flex items-center gap-2">
          <Pencil className="h-5 w-5 text-green-500" />
          <h1 className="text-lg font-semibold">编辑客户</h1>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : customer ? (
          <CustomerForm
            mode="user"
            customerId={Number(id)}
            initialData={customer}
            onSuccess={() => router.push(`/customers/${id}`)}
            onCancel={() => router.push(`/customers/${id}`)}
          />
        ) : (
          <p className="text-muted-foreground">客户不存在或已被删除</p>
        )}
      </div>
    </div>
  );
}
