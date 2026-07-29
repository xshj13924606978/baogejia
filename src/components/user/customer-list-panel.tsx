'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  User,
  Download,
  Upload,
  FileText,
  DollarSign,
  CreditCard,
  Building2,
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

/** 数据库 snake_case → 前端 camelCase 转换 */
function toCustomer(row: any): Customer {
  return {
    id: String(row.id),
    companyName: row.company_name || row.companyName || '',
    projectName: row.project_name || row.projectName || '',
    contactPerson: row.contact_person || row.contactPerson || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    bankName: row.bank_name || row.bankName || '',
    bankAccount: row.bank_account || row.bankAccount || '',
    taxNumber: row.tax_number || row.taxNumber || '',
    creditLimit: row.credit_limit ?? row.creditLimit ?? 0,
    paymentTerms: row.payment_terms || row.paymentTerms || '',
    notes: row.notes || '',
  };
}

interface Customer {
  id: string;
  companyName: string;
  projectName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName?: string;
  bankAccount?: string;
  taxNumber?: string;
  creditLimit?: number;
  paymentTerms?: string;
  notes?: string;
}

interface CustomerTemplate {
  name: string;
  companyName: string;
  projectName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
  paymentTerms: string;
  notes: string;
}

export default function CustomerListPanel({
  onSelect,
  onClose,
}: {
  onSelect?: (customer: Customer) => void;
  onClose?: () => void;
}) {
  let updateCustomerInfo: Function = () => {};
  try {
    const quote = useQuote();
    if (quote?.updateCustomerInfo) updateCustomerInfo = quote.updateCustomerInfo;
  } catch {}
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templates, setTemplates] = useState<CustomerTemplate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 获取认证 headers（带 x-user-id）
  const getAuthHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.id) headers['x-user-id'] = user.id;
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {}
    return headers;
  };

  // 从localStorage加载模板
  useEffect(() => {
    const savedTemplates = localStorage.getItem('customerTemplates');
    if (savedTemplates) {
      setTemplates(JSON.parse(savedTemplates));
    }
  }, []);

  // 保存模板到localStorage
  const saveTemplates = (newTemplates: CustomerTemplate[]) => {
    localStorage.setItem('customerTemplates', JSON.stringify(newTemplates));
    setTemplates(newTemplates);
  };

  // 获取客户列表
  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const url = searchTerm
        ? `/api/customers?search=${encodeURIComponent(searchTerm)}`
        : '/api/customers';
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setCustomers((data.customers || []).map(toCustomer));
      }
    } catch (error) {
      console.error('获取客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [searchTerm]);

  // 添加新客户
  const handleAddCustomer = async (customerData: Omit<Customer, 'id'>) => {
    try {

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(customerData),
      });

      if (response.ok) {
        const data = await response.json();
        setCustomers([...customers, toCustomer(data.customer)]);
        setShowAddDialog(false);
        toast({
          title: '添加成功',
          description: '客户已添加到资料库',
        });
        return data.customer;
      } else {
        const errorData = await response.json();
        console.error('[CustomerListPanel] 添加失败:', errorData);
        toast({
          title: '添加失败',
          description: errorData.error || '添加客户失败，请重试',
          variant: 'destructive',
        });
        return null;
      }
    } catch (error) {
      console.error('[CustomerListPanel] 添加客户异常:', error);
      toast({
        title: '添加失败',
        description: error instanceof Error ? error.message : '添加客户失败，请重试',
        variant: 'destructive',
      });
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
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        setCustomers(customers.filter((c) => c.id !== customerToDelete.id));
        toast({
          title: '删除成功',
          description: '客户已删除',
        });
        if (selectedCustomer?.id === customerToDelete.id) {
          setSelectedCustomer(null);
        }
      }
    } catch (error) {
      console.error('删除客户失败:', error);
      toast({
        title: '删除失败',
        description: '删除客户失败，请重试',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
    }
  };

  // 更新客户
  const handleUpdateCustomer = async (data: Customer) => {
    try {
      const res = await fetch('/api/customers', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        setCustomers(customers.map(c => c.id === data.id ? toCustomer(result.customer) : c));
        if (selectedCustomer?.id === data.id) setSelectedCustomer(toCustomer(result.customer));
        setEditingCustomer(null);
        toast({ title: '更新成功', description: '客户信息已更新' });
      } else {
        const err = await res.json();
        toast({ title: '更新失败', description: err.error || '请重试', variant: 'destructive' });
      }
    } catch {
      toast({ title: '更新失败', description: '网络错误', variant: 'destructive' });
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
      bankName: customer.bankName || '',
      bankAccount: customer.bankAccount || '',
      taxNumber: customer.taxNumber || '',
      paymentTerms: customer.paymentTerms || '',
      creditLimit: customer.creditLimit || 0,
      notes: customer.notes || '',
    });

    // 触发选择回调并关闭弹窗
    if (onSelect) {
      onSelect(customer);
    }
    if (onClose) {
      onClose();
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === customers.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(customers.map(c => c.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${checkedIds.size} 个客户？`)) return;
    try {
      await Promise.all([...checkedIds].map(id =>
        fetch(`/api/customers?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      ));
      setCustomers(customers.filter(c => !checkedIds.has(c.id)));
      setCheckedIds(new Set());
      toast({ title: '批量删除成功', description: `已删除 ${checkedIds.size} 个客户` });
    } catch {
      toast({ title: '批量删除失败', variant: 'destructive' });
    }
  };

  // 下载客户列表
  const handleDownload = () => {
    const headers = [
      '公司名称',
      '项目名称',
      '联系人',
      '电话',
      '邮箱',
      '地址',
      '银行名称',
      '银行账号',
      '税号',
      '信用额度',
      '付款方式',
      '备注',
    ];

    const rows = customers.map((c) => [
      c.companyName,
      c.projectName,
      c.contactPerson,
      c.phone,
      c.email,
      c.address,
      c.bankName || '',
      c.bankAccount || '',
      c.taxNumber || '',
      c.creditLimit || '',
      c.paymentTerms || '',
      c.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `客户列表_${new Date().toLocaleDateString()}.csv`;
    link.click();

    toast({
      title: '下载成功',
      description: '客户列表已下载',
    });
  };

  // 批量导入客户
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').slice(1); // 跳过表头

      const importPromises = lines
        .filter((line) => line.trim())
        .map((line) => {
          const values = line.match(/"([^"]*)"/g)?.map((v) => v.slice(1, -1)) || [];

          if (values.length >= 3) {
            return fetch('/api/customers', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                companyName: values[0] || '',
                projectName: values[1] || '',
                contactPerson: values[2] || '',
                phone: values[3] || '',
                email: values[4] || '',
                address: values[5] || '',
                bankName: values[6] || '',
                bankAccount: values[7] || '',
                taxNumber: values[8] || '',
                creditLimit: parseFloat(values[9]) || 0,
                paymentTerms: values[10] || '',
                notes: values[11] || '',
              }),
            });
          }
          return Promise.resolve();
        });

      try {
        await Promise.all(importPromises);
        await fetchCustomers();
        toast({
          title: '导入成功',
          description: '客户已批量导入',
        });
      } catch (error) {
        console.error('批量导入失败:', error);
        toast({
          title: '导入失败',
          description: '批量导入失败，请检查文件格式',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
              <CardDescription>{customers.length} 个客户记录{checkedIds.size > 0 && ` · 已选 ${checkedIds.size} 个`}</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              {checkedIds.size > 0 && (
                <Button size="sm" variant="destructive" onClick={handleBatchDelete}>
                  删除选中 ({checkedIds.size})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowTemplateDialog(true)}>
                <FileText className="h-4 w-4 mr-2" />
                模板
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                导入
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                导出
              </Button>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                添加客户
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 批量导入隐藏输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
          />

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
            ) : customers.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchTerm ? '未找到匹配的客户' : '暂无客户记录'}
              </div>
            ) : (
              <div>
                {customers.length > 1 && (
                  <div className="flex items-center gap-2 px-1 pb-2 border-b mb-2">
                    <input type="checkbox" checked={checkedIds.size === customers.length} onChange={toggleAll} className="rounded border-gray-300" />
                    <span className="text-xs text-muted-foreground">全选</span>
                  </div>
                )}
                {customers.map((customer) => (
                  <div key={customer.id} className={`border rounded-lg p-4 hover:bg-gray-50 transition-colors ${selectedCustomer?.id === customer.id ? 'border-green-500 bg-green-50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1" onClick={() => handleSelectCustomer(customer)}>
                        <input type="checkbox" checked={checkedIds.has(customer.id)} onChange={() => toggleCheck(customer.id)} onClick={(e) => e.stopPropagation()} className="mt-1 rounded border-gray-300" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Building className="h-4 w-4 text-gray-500" />
                            <span className="font-semibold text-sm">{customer.companyName}</span>
                            {selectedCustomer?.id === customer.id && <Check className="h-4 w-4 text-green-500" />}
                          </div>
                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-2"><span className="font-medium">项目:</span><span>{customer.projectName}</span></div>
                            <div className="flex items-center gap-2"><User className="h-3 w-3" /><span>{customer.contactPerson}</span><Phone className="h-3 w-3 ml-2" /><span>{customer.phone}</span></div>
                            {customer.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" /><span className="truncate">{customer.email}</span></div>}
                            {customer.bankName && <div className="flex items-center gap-2 text-blue-600"><CreditCard className="h-3 w-3" /><span className="truncate">{customer.bankName}</span></div>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleSelectCustomer(customer); }}><Check className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); setEditingCustomer(customer); }}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(customer); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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

      {/* 编辑客户对话框 */}
      {editingCustomer && (
        <EditCustomerDialog
          open={!!editingCustomer}
          onOpenChange={(open) => { if (!open) setEditingCustomer(null); }}
          customer={editingCustomer}
          onSave={handleUpdateCustomer}
        />
      )}

      {/* 添加客户对话框 */}
      <AddCustomerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddCustomer}
        templates={templates}
      />

      {/* 模板管理对话框 */}
      <TemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        templates={templates}
        setTemplates={saveTemplates}
      />
    </>
  );
}

// 编辑客户对话框
function EditCustomerDialog({
  open, onOpenChange, customer, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  onSave: (data: Customer) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    companyName: customer.companyName,
    projectName: customer.projectName || '',
    contactPerson: customer.contactPerson || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    bankName: customer.bankName || '',
    bankAccount: customer.bankAccount || '',
    taxNumber: customer.taxNumber || '',
    paymentTerms: customer.paymentTerms || '',
    creditLimit: customer.creditLimit || 0,
    notes: customer.notes || '',
  });

  const handleSubmit = () => {
    if (!formData.companyName) { alert('请填写公司名称'); return; }
    onSave({ ...customer, ...formData });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑客户 - {customer.companyName}</DialogTitle>
          <DialogDescription>修改客户信息</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="financial">财务信息</TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">公司名称 <span className="text-red-500">*</span></Label>
                <Input value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">项目名称</Label>
                <Input value={formData.projectName} onChange={(e) => setFormData({ ...formData, projectName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">联系人 <span className="text-red-500">*</span></Label>
                <Input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">电话 <span className="text-red-500">*</span></Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">邮箱</Label>
                <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">地址</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="financial" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">银行名称</Label>
                <Input value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">银行账号</Label>
                <Input value={formData.bankAccount} onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">税号</Label>
                <Input value={formData.taxNumber} onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">付款方式</Label>
                <Input value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">备注</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit}>保存修改</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 添加客户对话框组件
function AddCustomerDialog({
  open,
  onOpenChange,
  onAdd,
  templates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  templates: CustomerTemplate[];
}) {
  const [formData, setFormData] = useState({
    companyName: '',
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
        bankName: '',
        bankAccount: '',
        taxNumber: '',
        paymentTerms: '',
        creditLimit: 0,
        notes: '',
      });
    }
  };

  // 应用模板
  const applyTemplate = (template: CustomerTemplate) => {
    setFormData({
      companyName: template.companyName,
      projectName: template.projectName,
      contactPerson: template.contactPerson,
      phone: template.phone,
      email: template.email,
      address: template.address,
      bankName: template.bankName,
      bankAccount: template.bankAccount,
      taxNumber: template.taxNumber,
      paymentTerms: template.paymentTerms,
      creditLimit: 0,
      notes: template.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加新客户</DialogTitle>
          <DialogDescription>填写客户信息，添加到客户资料库</DialogDescription>
        </DialogHeader>

        {templates.length > 0 && (
          <div className="space-y-2 pb-4 border-b">
            <Label className="text-xs font-medium">快速应用模板</Label>
            <div className="flex gap-2 flex-wrap">
              {templates.map((template, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => applyTemplate(template)}
                >
                  <FileText className="h-3 w-3 mr-1" />
                  {template.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="financial">财务信息</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">
                  公司名称 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
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
                <Label className="text-xs">
                  联系人 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="张经理"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  电话 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="13912345678"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">邮箱</Label>
                <Input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">地址</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="XX省XX市XX区XX路XX号"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 模板管理对话框
function TemplateDialog({
  open,
  onOpenChange,
  templates,
  setTemplates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: CustomerTemplate[];
  setTemplates: (templates: CustomerTemplate[]) => void;
}) {
  const [editingTemplate, setEditingTemplate] = useState<CustomerTemplate | null>(null);
  const [formData, setFormData] = useState<CustomerTemplate>({
    name: '',
    companyName: '',
    projectName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    bankName: '',
    bankAccount: '',
    taxNumber: '',
    paymentTerms: '',
    notes: '',
  });

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      alert('请输入模板名称');
      return;
    }

    if (editingTemplate) {
      // 更新模板
      const index = templates.findIndex((t) => t.name === editingTemplate.name);
      if (index !== -1) {
        const newTemplates = [...templates];
        newTemplates[index] = formData;
        setTemplates(newTemplates);
      }
    } else {
      // 添加新模板
      setTemplates([...templates, formData]);
    }

    setEditingTemplate(null);
    setFormData({
      name: '',
      companyName: '',
      projectName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      bankName: '',
      bankAccount: '',
      taxNumber: '',
      paymentTerms: '',
      notes: '',
    });
  };

  const handleEditTemplate = (template: CustomerTemplate) => {
    setEditingTemplate(template);
    setFormData(template);
  };

  const handleDeleteTemplate = (templateName: string) => {
    if (confirm(`确定要删除模板 "${templateName}" 吗？`)) {
      setTemplates(templates.filter((t) => t.name !== templateName));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>客户信息模板</DialogTitle>
          <DialogDescription>管理客户信息模板，快速填充常用信息</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 模板列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">现有模板</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingTemplate(null);
                  setFormData({
                    name: '',
                    companyName: '',
                    projectName: '',
                    contactPerson: '',
                    phone: '',
                    email: '',
                    address: '',
                    bankName: '',
                    bankAccount: '',
                    taxNumber: '',
                    paymentTerms: '',
                    notes: '',
                  });
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                新建模板
              </Button>
            </div>

            {templates.length === 0 ? (
              <div className="text-center text-gray-500 py-4 border rounded-lg">
                暂无模板，点击"新建模板"创建
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {templates.map((template, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleEditTemplate(template)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{template.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template.name);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>{template.companyName}</div>
                      <div>
                        {template.contactPerson} - {template.phone}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 编辑/新建模板 */}
          <div className="border-t pt-4 space-y-4">
            <h3 className="font-medium text-sm">{editingTemplate ? '编辑模板' : '新建模板'}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">
                  模板名称 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：政府客户模板"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">公司名称</Label>
                <Input
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
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
                <Label className="text-xs">联系人</Label>
                <Input
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="张经理"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">电话</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="13912345678"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">邮箱</Label>
                <Input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@example.com"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label className="text-xs">地址</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="XX省XX市XX区XX路XX号"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">银行名称</Label>
                <Input
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="中国建设银行XX分行"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">银行账号</Label>
                <Input
                  value={formData.bankAccount}
                  onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                  placeholder="6222 0000 0000 0000"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">税号</Label>
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

              <div className="space-y-2 col-span-2">
                <Label className="text-xs">备注</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="其他备注信息..."
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingTemplate(null);
                  setFormData({
                    name: '',
                    companyName: '',
                    projectName: '',
                    contactPerson: '',
                    phone: '',
                    email: '',
                    address: '',
                    bankName: '',
                    bankAccount: '',
                    taxNumber: '',
                    paymentTerms: '',
                    notes: '',
                  });
                }}
              >
                取消
              </Button>
              <Button onClick={handleSaveTemplate}>保存模板</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
