'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CustomerStats,
  CustomerList,
  type Customer,
  type CustomerStatsData,
} from '@/components/customers';
import { useCustomer } from '@/contexts/CustomerContext';

export default function CustomersPage() {
  const router = useRouter();
  const { currentCustomer, setCurrentCustomer } = useCustomer();

  const [stats, setStats] = useState<CustomerStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/customers/stats')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setStats(json.data as CustomerStatsData);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleView = (c: Customer) => {
    setCurrentCustomer({
      id: String(c.id),
      companyName: c.company_name,
      contactPerson: c.contact_person || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
    });
    router.push(`/customers/${c.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回对话
        </Button>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-green-500" />
          <h1 className="text-lg font-semibold">客户资料库</h1>
        </div>
        {currentCustomer && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">
            当前客户：{currentCustomer.companyName}
          </span>
        )}
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <CustomerStats data={stats} loading={statsLoading} />
        <CustomerList
          apiEndpoint="/api/customers"
          mode="user"
          onView={handleView}
          onCreate={() => router.push('/customers/new')}
        />
      </div>
    </div>
  );
}
