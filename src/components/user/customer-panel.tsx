'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  Building,
  Edit2,
  Save,
  X,
  User,
  FolderOpen
} from 'lucide-react';
import { useQuote } from '@/contexts/QuoteContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import CustomerListPanel from './customer-list-panel';

export default function CustomerPanel() {
  const { quoteData, updateCustomerInfo } = useQuote();
  const [editing, setEditing] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(quoteData?.customerInfo || {
    name: 'XX工程项目部',
    projectName: '污水处理设备采购项目',
    contactPerson: '李工',
    phone: '13912345678',
    email: 'ligong@example.com',
    address: '江苏省苏州市工业园区'
  });

  // 从数据库加载客户信息
  useEffect(() => {
    loadCustomers();
  }, []);

  // 当quoteData更新时，同步更新表单数据
  useEffect(() => {
    if (quoteData?.customerInfo) {
      setFormData(quoteData.customerInfo);
    }
  }, [quoteData?.customerInfo]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
        
        // 如果有客户，自动选择第一个
        if (data.customers && data.customers.length > 0) {
          const firstCustomer = data.customers[0];
          const customerInfo = {
            name: firstCustomer.companyName,
            projectName: firstCustomer.projectName,
            contactPerson: firstCustomer.contactPerson,
            phone: firstCustomer.phone,
            email: firstCustomer.email,
            address: firstCustomer.address,
          };
          setFormData(customerInfo);
          updateCustomerInfo(customerInfo);
        }
      }
    } catch (error) {
      console.error('加载客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    updateCustomerInfo(formData);
    setEditing(false);
  };

  // 从客户列表中选择客户
  const handleSelectCustomer = (customer: any) => {
    const customerInfo = {
      name: customer.companyName,
      projectName: customer.projectName,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    };
    setFormData(customerInfo);
    updateCustomerInfo(customerInfo);
    setShowCustomerList(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              客户信息
            </CardTitle>
            <CardDescription>管理您的客户资料</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowCustomerList(true)}
            >
              <FolderOpen className="h-3 w-3 mr-2" />
              管理客户
            </Button>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit2 className="h-3 w-3 mr-2" />
                编辑
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X className="h-3 w-3 mr-2" />
                  取消
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-3 w-3 mr-2" />
                  保存
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Building className="h-3 w-3" /> 客户名称
            </Label>
            {editing ? (
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm font-medium p-2 bg-gray-50 rounded">{formData.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">项目名称</Label>
            {editing ? (
              <Input 
                value={formData.projectName} 
                onChange={(e) => setFormData({...formData, projectName: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.projectName}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <User className="h-3 w-3" /> 联系人
            </Label>
            {editing ? (
              <Input 
                value={formData.contactPerson} 
                onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.contactPerson}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Phone className="h-3 w-3" /> 电话
            </Label>
            {editing ? (
              <Input 
                value={formData.phone} 
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.phone}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" /> 邮箱
            </Label>
            {editing ? (
              <Input 
                value={formData.email} 
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.email}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="h-3 w-3" /> 地址
            </Label>
            {editing ? (
              <Input 
                value={formData.address} 
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.address}</p>
            )}
          </div>
        </div>
      </CardContent>

      {/* 客户列表对话框 */}
      <Dialog open={showCustomerList} onOpenChange={setShowCustomerList}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              客户资料管理
            </DialogTitle>
            <DialogDescription>
              选择已有客户或添加新客户
            </DialogDescription>
          </DialogHeader>
          <CustomerListPanel />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
