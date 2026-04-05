'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CustomerListPanel from '@/components/user/customer-list-panel';
import { useCustomer } from '@/contexts/CustomerContext';

export default function CustomersPage() {
  const router = useRouter();
  const { currentCustomer, setCurrentCustomer } = useCustomer();

  const handleSelectAsCurrent = (customer: any) => {
    setCurrentCustomer({
      id: customer.id,
      companyName: customer.companyName,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回对话
        </Button>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-green-500" />
          <h1 className="text-lg font-semibold">客户资料库</h1>
        </div>
        {currentCustomer && (
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            当前客户：{currentCustomer.companyName}
          </span>
        )}
      </div>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <CustomerListPanel onSelect={handleSelectAsCurrent} />
      </div>
    </div>
  );
}
