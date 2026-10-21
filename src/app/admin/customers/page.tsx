'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import {
  CustomerStats,
  CustomerList,
  type CustomerStatsData,
  type UserOption,
} from '@/components/customers';

export default function AdminCustomersPage() {
  const router = useRouter();
  const [stats, setStats] = useState<CustomerStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);

  // 加载所属用户下拉
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
      .catch(() => {});
  }, []);

  // 加载统计
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/customers/stats');
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch {
      // 统计失败不影响主列表
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">客户管理</h1>
          <p className="text-sm text-muted-foreground">查看和管理所有用户创建的客户资料</p>
        </div>
        <Button onClick={() => router.push('/admin/customers/new')}>
          <UserPlus className="mr-1 h-4 w-4" />
          新增客户
        </Button>
      </div>

      <CustomerStats data={stats} loading={statsLoading} />

      <CustomerList
        apiEndpoint="/api/admin/customers"
        mode="admin"
        showUserFilter
        users={users}
        onView={(c) => router.push(`/admin/customers/${c.id}`)}
        onEdit={(c) => router.push(`/admin/customers/${c.id}/edit`)}
      />
    </div>
  );
}
