'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerForm } from '@/components/customers';

export default function UserCustomerNewPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/customers')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回列表
        </Button>
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-green-500" />
          <h1 className="text-lg font-semibold">新增客户</h1>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <CustomerForm
          mode="user"
          onSuccess={() => router.push('/customers')}
          onCancel={() => router.push('/customers')}
        />
      </div>
    </div>
  );
}
