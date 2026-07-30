'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface CustomerInfo {
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

interface CustomerContextType {
  currentCustomer: CustomerInfo | null;
  setCurrentCustomer: (customer: CustomerInfo | null) => void;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [currentCustomer, setCurrentCustomerState] = useState<CustomerInfo | null>(null);

  // 从 localStorage 恢复
  useEffect(() => {
    try {
      const saved = localStorage.getItem('currentCustomer');
      if (saved) setCurrentCustomerState(JSON.parse(saved));
    } catch (err) {
      console.error('[CustomerContext] 读取 localStorage currentCustomer 失败:', err);
    }
  }, []);

  const setCurrentCustomer = useCallback((customer: CustomerInfo | null) => {
    setCurrentCustomerState(customer);
    if (customer) {
      localStorage.setItem('currentCustomer', JSON.stringify(customer));
      localStorage.setItem('selectedCustomerId', customer.id);
    } else {
      localStorage.removeItem('currentCustomer');
      localStorage.removeItem('selectedCustomerId');
    }
  }, []);

  return (
    <CustomerContext.Provider value={{ currentCustomer, setCurrentCustomer }}>
      {children}
    </CustomerContext.Provider>
  );
}

export const useCustomer = () => {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer must be used within CustomerProvider');
  return ctx;
};
