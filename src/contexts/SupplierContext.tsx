'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface DefaultSupplier {
  id: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
  taxNumber?: string;
}

interface SupplierContextType {
  defaultSupplier: DefaultSupplier | null;
  setDefaultSupplier: (supplier: DefaultSupplier | null) => void;
}

const SupplierContext = createContext<SupplierContextType | undefined>(undefined);

export function SupplierProvider({ children }: { children: React.ReactNode }) {
  const [defaultSupplier, setDefaultSupplierState] = useState<DefaultSupplier | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('defaultSupplier');
      if (saved) setDefaultSupplierState(JSON.parse(saved));
    } catch {}
  }, []);

  const setDefaultSupplier = useCallback((supplier: DefaultSupplier | null) => {
    setDefaultSupplierState(supplier);
    if (supplier) {
      localStorage.setItem('defaultSupplier', JSON.stringify(supplier));
      // 同步到 supplierInfo 供其他组件使用
      localStorage.setItem('supplierInfo', JSON.stringify(supplier));
      window.dispatchEvent(new CustomEvent('supplier-info-updated', { detail: supplier }));
    } else {
      localStorage.removeItem('defaultSupplier');
    }
  }, []);

  return (
    <SupplierContext.Provider value={{ defaultSupplier, setDefaultSupplier }}>
      {children}
    </SupplierContext.Provider>
  );
}

export const useSupplier = () => {
  const ctx = useContext(SupplierContext);
  if (!ctx) throw new Error('useSupplier must be used within SupplierProvider');
  return ctx;
};
