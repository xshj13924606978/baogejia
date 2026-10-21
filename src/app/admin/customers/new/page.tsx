'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CustomerForm, type UserOption } from '@/components/customers';

export default function AdminCustomerNewPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users?page=1&limit=200')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setUsers(
            (json.data || []).map((u: any) => ({
              id: u.id,
              name: u.full_name || u.username || u.name || u.email || u.id,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <CustomerForm
      mode="admin"
      users={users}
      onSuccess={() => router.push('/admin/customers')}
    />
  );
}
