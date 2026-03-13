'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Save,
  RefreshCw,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  DollarSign,
  FileText,
} from 'lucide-react';
import { useQuote } from '@/contexts/QuoteContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CustomerListPanel from './customer-list-panel';
import { useToast } from '@/components/ui/use-toast';

export default function CustomerPanel() {
  const { quoteData, updateCustomerInfo } = useQuote();
  const { toast } = useToast();
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [_loading,_setLoadingg] = useState(false);

  // 本地状态 - 确保所有字段都初始化为空字符串
  const customerInfo = quoteData?.customerInfo;
  const [formData, setFormData] = useState({
    name: customerInfo?.name ?? '',
    projectName: customerInfo?.projectName ?? '',
    contactPerson: customerInfo?.contactPerson ?? '',
    phone: customerInfo?.phone ?? '',
    email: customerInfo?.email ?? '',
    address: customerInfo?.address ?? '',
    bankName: customerInfo?.bankName ?? '',
    bankAccount: customerInfo?.bankAccount ?? '',
    taxNumber: customerInfo?.taxNumber ?? '',
    paymentTerms: customerInfo?.paymentTerms ?? '',
    creditLimit: customerInfo?.creditLimit ?? 0,
    notes: customerInfo?.notes ?? '',
  });

  // 同步quoteData到本地状态
  useEffect(() => {
    const info = quoteData?.customerInfo;
    setFormData({
      name: info?.name ?? '',
      projectName: info?.projectName ?? '',
      contactPerson: info?.contactPerson ?? '',
      phone: info?.phone ?? '',
      email: info?.email ?? '',
      address: info?.address ?? '',
      bankName: info?.bankName ?? '',
      bankAccount: info?.bankAccount ?? '',
      taxNumber: info?.taxNumber ?? '',
      paymentTerms: info?.paymentTerms ?? '',
      creditLimit: info?.creditLimit ?? 0,
      notes: info?.notes ?? '',
    });
  }, [quoteData?.customerInfo]);

  // 保存客户信息到报价单
  const handleSave = () => {
    try {
      console.log('[CustomerPanel] 保存客户信息:', formData);

      updateCustomerInfo({
        name: formData.name,
        projectName: formData.projectName,
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        bankName: formData.bankName,
        bankAccount: formData.bankAccount,
        taxNumber: formData.taxNumber,
        paymentTerms: formData.paymentTerms,
        creditLimit: formData.creditLimit,
        notes: formData.notes,
      });

      toast({
        title: '保存成功',
        description: '客户信息已更新到报价单',
      });

      console.log('[CustomerPanel] 保存成功');
    } catch (error) {
      console.error('[CustomerPanel] 保存失败:', error);
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  // 清空表单
  const handleClear = () => {
    setFormData({
      name: '',
      projectName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      bankName: '',
      bankAccount: '',
      taxNumber: '',
      paymentTerms: '',
      creditLimit: 0,
      notes: '',
    });

    toast({
      title: '已清空',
      description: '客户信息已清空',
    });
  };

  // 从资料库选择客户
  const handleSelectFromLibrary = () => {
    setShowCustomerList(true);
  };

  // 客户选择后的回调
  const handleCustomerSelected = (customer: any) => {
    setFormData({
      name: customer.companyName,
      projectName: customer.projectName,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      bankName: customer.bankName || '',
      bankAccount: customer.bankAccount || '',
      taxNumber: customer.taxNumber || '',
      paymentTerms: customer.paymentTerms || '',
      creditLimit: customer.creditLimit || 0,
      notes: customer.notes || '',
    });

    toast({
      title: '已加载客户信息',
      description: `${customer.companyName} 的信息已加载`,
    });
  };

  return (
    <div className="space-y-4">
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          保存信息
        </Button>
        <Button size="sm" variant="outline" onClick={handleSelectFromLibrary}>
          <Users className="h-4 w-4 mr-2" />
          从资料库选择
        </Button>
        <Button size="sm" variant="outline" onClick={handleClear}>
          <RefreshCw className="h-4 w-4 mr-2" />
          清空
        </Button>
      </div>

      {/* 客户信息表单 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building className="h-5 w-5 text-green-500" />
            客户信息
          </CardTitle>
          <CardDescription>填写客户基本信息和财务信息</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="financial">财务信息</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <Building className="h-3 w-3" />
                    公司名称
                  </Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="XX工程有限公司"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">项目名称</Label>
                  <Input
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    placeholder="污水处理设备采购项目"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <User className="h-3 w-3" />
                    联系人
                  </Label>
                  <Input
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="张经理"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    电话
                  </Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="13912345678"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    邮箱
                  </Label>
                  <Input
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    地址
                  </Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="XX省XX市XX区XX路XX号"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <CreditCard className="h-3 w-3" />
                    银行名称
                  </Label>
                  <Input
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    placeholder="中国建设银行XX分行"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <DollarSign className="h-3 w-3" />
                    银行账号
                  </Label>
                  <Input
                    value={formData.bankAccount}
                    onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                    placeholder="6222 0000 0000 0000"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    税号
                  </Label>
                  <Input
                    value={formData.taxNumber}
                    onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                    placeholder="91310000XXXXXXXXXX"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">付款方式</Label>
                  <Input
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    placeholder="月结30天"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">信用额度</Label>
                  <Input
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) =>
                      setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="100000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">备注</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="其他备注信息..."
                  rows={3}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 客户资料库面板 */}
      {showCustomerList && (
        <CustomerListPanel
          onSelect={handleCustomerSelected}
          onClose={() => setShowCustomerList(false)}
        />
      )}
    </div>
  );
}
