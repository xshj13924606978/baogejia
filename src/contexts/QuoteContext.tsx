'use client';

import React, { createContext, useContext, useState } from 'react';

interface SupplierInfo {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
}

interface CustomerInfo {
  name: string;
  projectName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName?: string;
  bankAccount?: string;
  taxNumber?: string;
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
}

interface TermsInfo {
  payment: string;
  warranty: string;
  delivery: string;
  validity: string;
  taxRate: number;
  shipping: number;
  installation: number;
  otherFees: number;
}

interface QuoteData {
  supplierInfo: SupplierInfo;
  customerInfo: CustomerInfo;
  terms: TermsInfo;
  products: any[];
  quoteNumber?: string;
  createdAt?: string;
}

interface QuoteContextType {
  quoteData: QuoteData | null;
  updateSupplierInfo: (info: SupplierInfo) => void;
  updateCustomerInfo: (info: CustomerInfo) => void;
  updateTerms: (terms: TermsInfo) => void;
  updateProducts: (products: any[]) => void;
  resetQuote: () => void;
}

const defaultQuoteData: QuoteData = {
  supplierInfo: {
    companyName: '请填写公司名称',
    contactPerson: '',
    phone: '',
    email: '',
    address: '请填写公司地址',
    bankName: '',
    bankAccount: '',
    taxNumber: '',
  },
  customerInfo: {
    name: '请选择客户',
    projectName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '请填写客户地址',
  },
  terms: {
    payment: '预付30%，发货前付清70%',
    warranty: '整机质保12个月',
    delivery: '合同签订后15个工作日内',
    validity: '15天',
    taxRate: 13,
    shipping: 0,
    installation: 0,
    otherFees: 0,
  },
  products: [],
  quoteNumber: 'Q' + Date.now(),
  createdAt: new Date().toISOString(),
};

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const [quoteData, setQuoteData] = useState<QuoteData>(defaultQuoteData);

  // 初始化时从数据库加载商务信息
  React.useEffect(() => {
    loadBusinessInfo();
  }, []);

  // 监听其他组件的供应方信息更新事件，保持同步
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setQuoteData((prev) => ({
          ...prev,
          supplierInfo: {
            companyName: detail.companyName || '',
            contactPerson: detail.contactPerson || '',
            phone: detail.phone || '',
            email: detail.email || '',
            address: detail.address || '',
            bankName: detail.bankName || '',
            bankAccount: detail.bankAccount || '',
            taxNumber: detail.taxNumber || '',
          },
        }));
      }
    };
    window.addEventListener('supplier-info-updated', handler);
    return () => window.removeEventListener('supplier-info-updated', handler);
  }, []);

  const loadBusinessInfo = async () => {
    try {
      const response = await fetch('/api/suppliers');
      if (response.ok) {
        const result = await response.json();
        // 兼容新旧接口：优先从列表中找默认供应方，否则取第一条
        const suppliers = result.suppliers || (result.supplier ? [result.supplier] : []);
        const defaultOne = suppliers.find((s: any) => s.isDefault) || suppliers[0];
        if (defaultOne) {
          const s = defaultOne;
          setQuoteData((prev) => ({
            ...prev,
            supplierInfo: {
              companyName: s.companyName || '',
              contactPerson: s.contactPerson || '',
              phone: s.phone || '',
              email: s.email || '',
              address: s.address || '',
              bankName: s.bankName || '',
              bankAccount: s.bankAccount || '',
              taxNumber: s.taxNumber || s.taxId || '',
            },
          }));
        }
      }
    } catch (_error) {
      console.warn('[QuoteContext] 商务信息 API 不可用，使用默认值');
    }
  };

  const updateSupplierInfo = async (info: SupplierInfo) => {
    // 更新状态
    setQuoteData((prev) => ({ ...prev, supplierInfo: info }));

    // 保存到数据库
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      });

      if (response.ok) {
        // 同步到 localStorage
        localStorage.setItem('supplierInfo', JSON.stringify(info));
        // 通知其他组件刷新
        window.dispatchEvent(new CustomEvent('supplier-info-updated', { detail: info }));
      } else {
        console.warn('[QuoteContext] 供应商信息保存失败');
      }
    } catch (_error) {
      console.warn('[QuoteContext] 商务信息 API 不可用，未保存到数据库');
    }
  };

  const updateCustomerInfo = async (info: CustomerInfo) => {
    // 更新状态
    setQuoteData((prev) => ({ ...prev, customerInfo: info }));

    // 保存到数据库（如果 API 可用）
    try {
      const response = await fetch('/api/business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'customer',
          data: {
            companyName: info.name,
            projectName: info.projectName,
            contactPerson: info.contactPerson,
            phone: info.phone,
            email: info.email,
            address: info.address,
          },
        }),
      });

      if (response.ok) {
      } else {
        console.warn('[QuoteContext] 客户信息保存失败，API 返回错误');
      }
    } catch (_error) {
      // API 不可用时静默失败，不影响用户体验
      console.warn('[QuoteContext] 商务信息 API 不可用，未保存到数据库');
    }
  };

  const updateTerms = async (terms: TermsInfo) => {
    // 更新状态
    setQuoteData((prev) => ({ ...prev, terms }));

    // 保存到数据库（如果 API 可用）
    try {
      const response = await fetch('/api/business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'terms',
          data: terms,
        }),
      });

      if (response.ok) {
        const _result = await response.json();
      } else {
        console.warn('[QuoteContext] 商务条款保存失败，API 返回错误');
      }
    } catch (_error) {
      // API 不可用时静默失败，不影响用户体验
      console.warn('[QuoteContext] 商务信息 API 不可用，未保存到数据库');
    }
  };

  const updateProducts = (products: any[]) => {
    setQuoteData((prev) => ({ ...prev, products }));
  };

  const resetQuote = () => {
    setQuoteData({
      ...defaultQuoteData,
      quoteNumber: 'Q' + Date.now(),
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <QuoteContext.Provider
      value={{
        quoteData,
        updateSupplierInfo,
        updateCustomerInfo,
        updateTerms,
        updateProducts,
        resetQuote,
      }}
    >
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuote() {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error('useQuote must be used within a QuoteProvider');
  }
  return context;
}
