'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CustomerForm, type Customer, type UserOption } from '@/components/customers';

export default function AdminCustomerEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [users, setUsers] = useState<UserOption[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users?page=1&limit=200');
      const json = await res.json();
      if (json.success) {
        setUsers(
          (json.data || []).map((u: any) => ({
            id: u.id,
            name: u.full_name || u.username || u.name || u.email || u.id,
          }))
        );
      }
    } catch {
      // 用户列表加载失败不影响编辑
    }
  }, []);

  useEffect(() => {
    Promise.all([
      loadUsers(),
      fetch(`/api/admin/customers/${id}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) setCustomer(json.data);
          else toast.error(json.error || '加载客户信息失败');
        })
        .catch(() => toast.error('网络错误')),
    ]).finally(() => setLoading(false));
  }, [id, loadUsers]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>客户不存在或已被删除</p>
        <Button variant="outline" onClick={() => router.push('/admin/customers')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <CustomerForm
      mode="admin"
      customerId={customer.id}
      initialData={customer}
      users={users}
      onSuccess={() => router.push('/admin/customers')}
    />
  );
}
