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
    companyName: '兴绿环境科技有限公司',
    contactPerson: '张经理',
    phone: '021-12345678',
    email: 'zhang@xinglv.com',
    address: '上海市浦东新区xx路123号',
    bankName: '中国建设银行上海分行',
    bankAccount: '3100 1234 5678 9012 345',
    taxNumber: '91310115MA1H123456'
  },
  customerInfo: {
    name: 'XX工程项目部',
    projectName: '污水处理设备采购项目',
    contactPerson: '李工',
    phone: '13912345678',
    email: 'ligong@example.com',
    address: '江苏省苏州市工业园区'
  },
  terms: {
    payment: '预付30%，发货前付清70%',
    warranty: '整机质保12个月',
    delivery: '合同签订后15个工作日内',
    validity: '15天',
    taxRate: 13,
    shipping: 0,
    installation: 0,
    otherFees: 0
  },
  products: [],
  quoteNumber: 'Q' + Date.now(),
  createdAt: new Date().toISOString()
};

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const [quoteData, setQuoteData] = useState<QuoteData>(defaultQuoteData);

  // 初始化时从数据库加载商务信息
  React.useEffect(() => {
    loadBusinessInfo();
  }, []);

  const loadBusinessInfo = async () => {
    try {
      const response = await fetch('/api/business-info?type=all');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const businessInfo = result.data;
          
          // 更新状态
          setQuoteData(prev => ({
            ...prev,
            supplierInfo: businessInfo.supplier || prev.supplierInfo,
            customerInfo: businessInfo.customer ? {
              name: businessInfo.customer.companyName || prev.customerInfo.name,
              projectName: businessInfo.customer.projectName || prev.customerInfo.projectName,
              contactPerson: businessInfo.customer.contactPerson || prev.customerInfo.contactPerson,
              phone: businessInfo.customer.phone || prev.customerInfo.phone,
              email: businessInfo.customer.email || prev.customerInfo.email,
              address: businessInfo.customer.address || prev.customerInfo.address,
            } : prev.customerInfo,
            terms: businessInfo.terms ? {
              payment: businessInfo.terms.paymentTerms || prev.terms.payment,
              warranty: businessInfo.terms.warrantyPeriod || prev.terms.warranty,
              delivery: businessInfo.terms.deliveryPeriod || prev.terms.delivery,
              validity: businessInfo.terms.validityPeriod || prev.terms.validity,
              taxRate: businessInfo.terms.taxRate ?? prev.terms.taxRate,
              shipping: businessInfo.terms.shipping ?? prev.terms.shipping,
              installation: businessInfo.terms.installation ?? prev.terms.installation,
              otherFees: businessInfo.terms.otherFees ?? prev.terms.otherFees,
            } : prev.terms,
          }));
        }
      }
    } catch (error) {
      console.error('加载商务信息失败:', error);
    }
  };

  const updateSupplierInfo = (info: SupplierInfo) => {
    setQuoteData(prev => ({ ...prev, supplierInfo: info }));
  };

  const updateCustomerInfo = (info: CustomerInfo) => {
    setQuoteData(prev => ({ ...prev, customerInfo: info }));
  };

  const updateTerms = async (terms: TermsInfo) => {
    // 更新状态
    setQuoteData(prev => ({ ...prev, terms }));
    
    // 保存到数据库
    try {
      const response = await fetch('/api/business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'terms',
          data: terms
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('商务条款保存成功:', result);
      } else {
        console.error('商务条款保存失败:', await response.text());
      }
    } catch (error) {
      console.error('保存商务条款时出错:', error);
    }
  };

  const updateProducts = (products: any[]) => {
    setQuoteData(prev => ({ ...prev, products }));
  };

  const resetQuote = () => {
    setQuoteData({
      ...defaultQuoteData,
      quoteNumber: 'Q' + Date.now(),
      createdAt: new Date().toISOString()
    });
  };

  return (
    <QuoteContext.Provider value={{
      quoteData,
      updateSupplierInfo,
      updateCustomerInfo,
      updateTerms,
      updateProducts,
      resetQuote
    }}>
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
