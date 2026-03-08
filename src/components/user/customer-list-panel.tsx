'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  Phone,
  Mail,
  MapPin,
  Building,
  User
} from 'lucide-react';
import { useQuote } from '@/contexts/QuoteContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Customer {
  id: string;
  companyName: string;
  projectName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
}

export default function CustomerListPanel() {
  const { quoteData, updateCustomerInfo } = useQuote();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // 获取客户列表
  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // 添加新客户
  const handleAddCustomer = async (customerData: Omit<Customer, 'id'>) => {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerData),
      });

      if (response.ok) {
        const data = await response.json();
        setCustomers([...customers, data.customer]);
        setShowAddDialog(false);
        return data.customer;
      }
    } catch (error) {
      console.error('添加客户失败:', error);
      return null;
    }
  };

  // 删除客户
  const handleDeleteCustomer = async (customer: Customer) => {
    setCustomerToDelete(customer);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      const response = await fetch(`/api/customers?id=${customerToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCustomers(customers.filter(c => c.id !== customerToDelete.id));
        // 如果删除的是当前选中的客户，重置选中状态
        if (selectedCustomer?.id === customerToDelete.id) {
          setSelectedCustomer(null);
        }
      }
    } catch (error) {
      console.error('删除客户失败:', error);
    } finally {
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
    }
  };

  // 选择客户
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    updateCustomerInfo({
      name: customer.companyName,
      projectName: customer.projectName,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    });
  };

  // 过滤客户
  const filteredCustomers = customers.filter(customer => 
    customer.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                客户资料库
              </CardTitle>
              <CardDescription>
                {customers.length} 个客户记录
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              添加客户
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索客户名称、项目名称、联系人或电话..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* 客户列表 */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="text-center text-gray-500 py-8">加载中...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchTerm ? '未找到匹配的客户' : '暂无客户记录'}
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className={`border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    selectedCustomer?.id === customer.id ? 'border-green-500 bg-green-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1" onClick={() => handleSelectCustomer(customer)}>
                      <div className="flex items-center gap-2 mb-2">
                        <Building className="h-4 w-4 text-gray-500" />
                        <span className="font-semibold text-sm">{customer.companyName}</span>
                        {selectedCustomer?.id === customer.id && (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">项目:</span>
                          <span>{customer.projectName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          <span>{customer.contactPerson}</span>
                          <Phone className="h-3 w-3 ml-2" />
                          <span>{customer.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{customer.address}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-1 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleSelectCustomer(customer)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteCustomer(customer)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 当前选中的客户信息 */}
          {selectedCustomer && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm font-medium text-blue-900 mb-2">
                当前选中客户
              </div>
              <div className="text-xs text-blue-700 space-y-1">
                <div><span className="font-medium">公司:</span> {selectedCustomer.companyName}</div>
                <div><span className="font-medium">项目:</span> {selectedCustomer.projectName}</div>
                <div><span className="font-medium">联系人:</span> {selectedCustomer.contactPerson}</div>
                <div><span className="font-medium">电话:</span> {selectedCustomer.phone}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除客户 "{customerToDelete?.companyName}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加客户对话框 */}
      <AddCustomerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddCustomer}
      />
    </>
  );
}

// 添加客户对话框组件
function AddCustomerDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
}) {
  const [formData, setFormData] = useState({
    companyName: '',
    projectName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
  });

  const handleSubmit = async () => {
    if (!formData.companyName || !formData.contactPerson || !formData.phone) {
      alert('请填写必填信息（公司名称、联系人、电话）');
      return;
    }

    const result = await onAdd(formData);
    if (result) {
      setFormData({
        companyName: '',
        projectName: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加新客户</DialogTitle>
          <DialogDescription>
            填写客户信息，添加到客户资料库
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs">公司名称 <span className="text-red-500">*</span></Label>
            <Input
              value={formData.companyName}
              onChange={(e) => setFormData({...formData, companyName: e.target.value})}
              placeholder="XX工程有限公司"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">项目名称</Label>
            <Input
              value={formData.projectName}
              onChange={(e) => setFormData({...formData, projectName: e.target.value})}
              placeholder="污水处理设备采购项目"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">联系人 <span className="text-red-500">*</span></Label>
            <Input
              value={formData.contactPerson}
              onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
              placeholder="张经理"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">电话 <span className="text-red-500">*</span></Label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              placeholder="13912345678"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">邮箱</Label>
            <Input
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="contact@example.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">地址</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              placeholder="XX省XX市XX区XX路XX号"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
