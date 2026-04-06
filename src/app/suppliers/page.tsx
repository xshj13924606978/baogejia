'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SupplierListPanel from '@/components/user/supplier-list-panel';
import { useSupplier } from '@/contexts/SupplierContext';

export default function SuppliersPage() {
  const router = useRouter();
  const { defaultSupplier, setDefaultSupplier } = useSupplier();

  const handleSelectAsDefault = (supplier: any) => {
    setDefaultSupplier({
      id: supplier.id,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      bankName: supplier.bankName,
      bankAccount: supplier.bankAccount,
      taxNumber: supplier.taxNumber,
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
          <Building2 className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">供应方资料库</h1>
        </div>
        {defaultSupplier && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            当前供应方：{defaultSupplier.companyName}
          </span>
        )}
      </div>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <SupplierListPanel onSelect={handleSelectAsDefault} />
      </div>
    </div>
  );
}
