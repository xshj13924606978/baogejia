'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, Users, FileText, Save, Plus, Settings, Type, ExternalLink } from 'lucide-react';

interface SupplierInfo {
  companyName: string;
  logoUrl?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
}

interface CustomerInfo {
  id?: number;
  companyName: string;
  projectName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
}

interface QuoteTerms {
  id?: number;
  name: string;
  paymentTerms: string;
  warrantyPeriod: number;
  deliveryPeriod: number;
  validityPeriod: number;
  remarks: string;
  isDefault: boolean;
}

export default function InfoPanel() {
  const [supplierInfo, setSupplierInfo] = useState<SupplierInfo>({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    bankName: '',
    bankAccount: '',
    taxNumber: '',
  });

  const [customers, setCustomers] = useState<CustomerInfo[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [currentCustomer, setCurrentCustomer] = useState<CustomerInfo>({
    companyName: '',
    projectName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
  });

  const [termsList, setTermsList] = useState<QuoteTerms[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const [currentTerm, setCurrentTerm] = useState<QuoteTerms>({
    name: '默认条款',
    paymentTerms: '预付30%，发货前付清',
    warrantyPeriod: 12,
    deliveryPeriod: 7,
    validityPeriod: 15,
    remarks: '',
    isDefault: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  // 将 supplierInfo 同步到 localStorage
  useEffect(() => {
    if (supplierInfo && supplierInfo.companyName) {
      localStorage.setItem('supplierInfo', JSON.stringify(supplierInfo));
    }
  }, [supplierInfo]);

  const loadData = async () => {
    try {
      // 加载供应方信息
      const supplierRes = await fetch('/api/suppliers');
      if (supplierRes.ok) {
        const data = await supplierRes.json();
        if (data.supplier) {
          setSupplierInfo(data.supplier);
          // 保存到 localStorage
          localStorage.setItem('supplierInfo', JSON.stringify(data.supplier));
        }
      }

      // 加载客户列表
      const customersRes = await fetch('/api/customers');
      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.customers || []);
      }

      // 加载商务条款
      const termsRes = await fetch('/api/terms');
      if (termsRes.ok) {
        const data = await termsRes.json();
        setTermsList(data.terms || []);
        const defaultTerm = data.terms?.find((t: QuoteTerms) => t.isDefault);
        if (defaultTerm) {
          setCurrentTerm(defaultTerm);
          setSelectedTermId(defaultTerm.id);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleSaveSupplier = async () => {
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierInfo),
      });
      if (response.ok) {
        alert('供应方信息保存成功');
        // 通知其他组件刷新供应方信息
        window.dispatchEvent(new CustomEvent('supplier-info-updated', { detail: supplierInfo }));
      }
    } catch (error) {
      console.error('Failed to save supplier:', error);
      alert('保存失败');
    }
  };

  const handleSaveCustomer = async () => {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentCustomer),
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentCustomer({
          ...currentCustomer,
          id: data.customer.id,
        });
        setSelectedCustomerId(data.customer.id);
        alert('客户信息保存成功');
        loadData();
      }
    } catch (error) {
      console.error('Failed to save customer:', error);
      alert('保存失败');
    }
  };

  const handleSelectCustomer = (customerId: number) => {
    setSelectedCustomerId(customerId);
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      setCurrentCustomer(customer);
    }
  };

  const handleSaveTerm = async () => {
    try {
      const response = await fetch('/api/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentTerm),
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentTerm({
          ...currentTerm,
          id: data.term.id,
        });
        setSelectedTermId(data.term.id);
        alert('商务条款保存成功');
        loadData();
      }
    } catch (error) {
      console.error('Failed to save term:', error);
      alert('保存失败');
    }
  };

  const handleSelectTerm = (termId: number) => {
    setSelectedTermId(termId);
    const term = termsList.find((t) => t.id === termId);
    if (term) {
      setCurrentTerm(term);
    }
  };

  return (
    <div className="h-full">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
              <Settings className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">信息管理</h2>
          </div>

          <Tabs defaultValue="supplier" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
              <TabsTrigger
                value="supplier"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:shadow-sm transition-all"
              >
                <Building2 className="h-4 w-4 mr-2" />
                供应方
              </TabsTrigger>
              <TabsTrigger
                value="customer"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:shadow-sm transition-all"
              >
                <Users className="h-4 w-4 mr-2" />
                客户
              </TabsTrigger>
              <TabsTrigger
                value="terms"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:shadow-sm transition-all"
              >
                <FileText className="h-4 w-4 mr-2" />
                条款
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:shadow-sm transition-all"
              >
                <Settings className="h-4 w-4 mr-2" />
                设置
              </TabsTrigger>
            </TabsList>

            {/* 供应方信息 */}
            <TabsContent value="supplier" className="space-y-4 mt-4">
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Building2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    供应方信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name" className="text-sm font-medium">
                      公司名称 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="company-name"
                      value={supplierInfo.companyName}
                      onChange={(e) =>
                        setSupplierInfo({ ...supplierInfo, companyName: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入公司名称"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-person" className="text-sm font-medium">
                      联系人 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="contact-person"
                      value={supplierInfo.contactPerson}
                      onChange={(e) =>
                        setSupplierInfo({ ...supplierInfo, contactPerson: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入联系人"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      电话 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      value={supplierInfo.phone}
                      onChange={(e) => setSupplierInfo({ ...supplierInfo, phone: e.target.value })}
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入电话"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      邮箱
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={supplierInfo.email}
                      onChange={(e) => setSupplierInfo({ ...supplierInfo, email: e.target.value })}
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入邮箱"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-sm font-medium">
                      地址
                    </Label>
                    <Textarea
                      id="address"
                      value={supplierInfo.address}
                      onChange={(e) =>
                        setSupplierInfo({ ...supplierInfo, address: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入地址"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank-name" className="text-sm font-medium">
                      开户行
                    </Label>
                    <Input
                      id="bank-name"
                      value={supplierInfo.bankName}
                      onChange={(e) =>
                        setSupplierInfo({ ...supplierInfo, bankName: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入开户行"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank-account" className="text-sm font-medium">
                      账号
                    </Label>
                    <Input
                      id="bank-account"
                      value={supplierInfo.bankAccount}
                      onChange={(e) =>
                        setSupplierInfo({ ...supplierInfo, bankAccount: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入账号"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-number" className="text-sm font-medium">
                      税号
                    </Label>
                    <Input
                      id="tax-number"
                      value={supplierInfo.taxNumber}
                      onChange={(e) =>
                        setSupplierInfo({ ...supplierInfo, taxNumber: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500"
                      placeholder="请输入税号"
                    />
                  </div>
                  <Button
                    onClick={handleSaveSupplier}
                    className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90 text-white shadow-md shadow-brand-primary/20 transition-all duration-200"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    保存供应方信息
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 客户信息 */}
            <TabsContent value="customer" className="space-y-4 mt-4">
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Users className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    选择客户
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={selectedCustomerId?.toString() || ''}
                    onValueChange={(value) => handleSelectCustomer(parseInt(value))}
                  >
                    <SelectTrigger className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500">
                      <SelectValue placeholder="选择历史客户" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id!.toString()}>
                          {customer.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Users className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      客户信息
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCurrentCustomer({
                          companyName: '',
                          projectName: '',
                          contactPerson: '',
                          phone: '',
                          email: '',
                          address: '',
                        });
                        setSelectedCustomerId(null);
                      }}
                      className="h-8 w-8 text-slate-600 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-company" className="text-sm font-medium">
                      客户名称 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="customer-company"
                      value={currentCustomer.companyName}
                      onChange={(e) =>
                        setCurrentCustomer({ ...currentCustomer, companyName: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500"
                      placeholder="请输入客户名称"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-name" className="text-sm font-medium">
                      项目名称
                    </Label>
                    <Input
                      id="project-name"
                      value={currentCustomer.projectName}
                      onChange={(e) =>
                        setCurrentCustomer({ ...currentCustomer, projectName: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500"
                      placeholder="请输入项目名称"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-contact" className="text-sm font-medium">
                      联系人
                    </Label>
                    <Input
                      id="customer-contact"
                      value={currentCustomer.contactPerson}
                      onChange={(e) =>
                        setCurrentCustomer({ ...currentCustomer, contactPerson: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500"
                      placeholder="请输入联系人"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-phone" className="text-sm font-medium">
                      电话
                    </Label>
                    <Input
                      id="customer-phone"
                      value={currentCustomer.phone}
                      onChange={(e) =>
                        setCurrentCustomer({ ...currentCustomer, phone: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500"
                      placeholder="请输入电话"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-email" className="text-sm font-medium">
                      邮箱
                    </Label>
                    <Input
                      id="customer-email"
                      type="email"
                      value={currentCustomer.email}
                      onChange={(e) =>
                        setCurrentCustomer({ ...currentCustomer, email: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500"
                      placeholder="请输入邮箱"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-address" className="text-sm font-medium">
                      地址
                    </Label>
                    <Textarea
                      id="customer-address"
                      value={currentCustomer.address}
                      onChange={(e) =>
                        setCurrentCustomer({ ...currentCustomer, address: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500"
                      placeholder="请输入地址"
                      rows={2}
                    />
                  </div>
                  <Button
                    onClick={handleSaveCustomer}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md shadow-emerald-500/20 transition-all duration-200"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    保存客户信息
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 商务条款 */}
            <TabsContent value="terms" className="space-y-4 mt-4">
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <FileText className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                    </div>
                    选择条款模板
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={selectedTermId?.toString() || ''}
                    onValueChange={(value) => handleSelectTerm(parseInt(value))}
                  >
                    <SelectTrigger className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500">
                      <SelectValue placeholder="选择条款模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {termsList.map((term) => (
                        <SelectItem key={term.id} value={term.id!.toString()}>
                          {term.name} {term.isDefault && '(默认)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <FileText className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                      </div>
                      商务条款
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCurrentTerm({
                          name: '新条款',
                          paymentTerms: '预付30%，发货前付清',
                          warrantyPeriod: 12,
                          deliveryPeriod: 7,
                          validityPeriod: 15,
                          remarks: '',
                          isDefault: false,
                        });
                        setSelectedTermId(null);
                      }}
                      className="h-8 w-8 text-slate-600 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="term-name" className="text-sm font-medium">
                      条款名称
                    </Label>
                    <Input
                      id="term-name"
                      value={currentTerm.name}
                      onChange={(e) => setCurrentTerm({ ...currentTerm, name: e.target.value })}
                      className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500"
                      placeholder="请输入条款名称"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-terms" className="text-sm font-medium">
                      付款方式
                    </Label>
                    <Input
                      id="payment-terms"
                      value={currentTerm.paymentTerms}
                      onChange={(e) =>
                        setCurrentTerm({ ...currentTerm, paymentTerms: e.target.value })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500"
                      placeholder="请输入付款方式，如：预付30%，发货前付清"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      常见方式：预付30%，发货前付清 | 月结30天 | 预付50%，发货前付清 | 货到付款
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="warranty-period" className="text-sm font-medium">
                      质保期（月）
                    </Label>
                    <Input
                      id="warranty-period"
                      type="number"
                      value={currentTerm.warrantyPeriod}
                      onChange={(e) =>
                        setCurrentTerm({
                          ...currentTerm,
                          warrantyPeriod: parseInt(e.target.value) || 0,
                        })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery-period" className="text-sm font-medium">
                      交货期（工作日）
                    </Label>
                    <Input
                      id="delivery-period"
                      type="number"
                      value={currentTerm.deliveryPeriod}
                      onChange={(e) =>
                        setCurrentTerm({
                          ...currentTerm,
                          deliveryPeriod: parseInt(e.target.value) || 0,
                        })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="validity-period" className="text-sm font-medium">
                      报价有效期（天）
                    </Label>
                    <Input
                      id="validity-period"
                      type="number"
                      value={currentTerm.validityPeriod}
                      onChange={(e) =>
                        setCurrentTerm({
                          ...currentTerm,
                          validityPeriod: parseInt(e.target.value) || 0,
                        })
                      }
                      className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="remarks" className="text-sm font-medium">
                      备注
                    </Label>
                    <Textarea
                      id="remarks"
                      value={currentTerm.remarks}
                      onChange={(e) => setCurrentTerm({ ...currentTerm, remarks: e.target.value })}
                      className="border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500"
                      placeholder="请输入备注"
                      rows={2}
                    />
                  </div>
                  <Button
                    onClick={handleSaveTerm}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md shadow-purple-500/20 transition-all duration-200"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    保存商务条款
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 设置 */}
            <TabsContent value="settings" className="space-y-4 mt-4">
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center">
                      <Type className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                    </div>
                    字体样式
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">🎨</div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          字体样式参考
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          查看多种"报个价"标题的字体风格选择，当前已应用加宽字间距（tracking-widest）。
                        </p>
                      </div>
                    </div>
                  </div>

                  <Link href="/font-styles" target="_blank" rel="noopener noreferrer">
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      打开字体样式参考页面
                    </Button>
                  </Link>

                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      当前样式：
                    </p>
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-4">
                      <h1 className="text-2xl font-black tracking-widest text-white text-center">
                        报个价
                      </h1>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      Tailwind CSS: font-black tracking-widest
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
