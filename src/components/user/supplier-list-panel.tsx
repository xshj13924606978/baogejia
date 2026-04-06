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
  Building2,
  Star,
  Download,
  Upload,
  Globe,
  Banknote,
  Receipt,
  FileText,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

/** 数据库 snake_case → 前端 camelCase 转换 */
function toSupplier(row: any): Supplier {
  return {
    id: String(row.id),
    companyName: row.company_name || row.companyName || '',
    contactPerson: row.contact_person || row.contactPerson || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    bankName: row.bank_name || row.bankName || '',
    bankAccount: row.bank_account || row.bankAccount || '',
    taxNumber: row.tax_number || row.taxNumber || '',
    website: row.website || '',
    isDefault: !!(row.metadata?.is_default),
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
  };
}

interface Supplier {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
  website: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function SupplierListPanel({
  onSelect,
  onClose,
}: {
  onSelect?: (supplier: Supplier) => void;
  onClose?: () => void;
}) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
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

  // 获取供应方列表
  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const url = searchTerm
        ? `/api/suppliers?search=${encodeURIComponent(searchTerm)}`
        : '/api/suppliers';
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setSuppliers((data.suppliers || []).map(toSupplier));
      }
    } catch (error) {
      console.error('获取供应方列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [searchTerm]);

  // 添加新供应方
  const handleAddSupplier = async (supplierData: Omit<Supplier, 'id' | 'isDefault' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(supplierData),
      });

      if (response.ok) {
        const data = await response.json();
        setSuppliers([...suppliers, toSupplier(data.supplier)]);
        setShowAddDialog(false);
        toast({
          title: '添加成功',
          description: '供应方已添加到资料库',
        });
        return data.supplier;
      } else {
        const errorData = await response.json();
        toast({
          title: '添加失败',
          description: errorData.error || '添加供应方失败，请重试',
          variant: 'destructive',
        });
        return null;
      }
    } catch (error) {
      toast({
        title: '添加失败',
        description: error instanceof Error ? error.message : '添加供应方失败，请重试',
        variant: 'destructive',
      });
      return null;
    }
  };

  // 删除供应方
  const handleDeleteSupplier = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!supplierToDelete) return;

    try {
      const response = await fetch(`/api/suppliers?id=${supplierToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        setSuppliers(suppliers.filter((s) => s.id !== supplierToDelete.id));
        toast({
          title: '删除成功',
          description: '供应方已删除',
        });
        if (selectedSupplier?.id === supplierToDelete.id) {
          setSelectedSupplier(null);
        }
      }
    } catch (error) {
      toast({
        title: '删除失败',
        description: '删除供应方失败，请重试',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setSupplierToDelete(null);
    }
  };

  // 更新供应方
  const handleUpdateSupplier = async (data: Supplier) => {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        setSuppliers(suppliers.map(s => s.id === data.id ? toSupplier(result.supplier) : s));
        if (selectedSupplier?.id === data.id) setSelectedSupplier(toSupplier(result.supplier));
        setEditingSupplier(null);
        toast({ title: '更新成功', description: '供应方信息已更新' });
      } else {
        const err = await res.json();
        toast({ title: '更新失败', description: err.error || '请重试', variant: 'destructive' });
      }
    } catch {
      toast({ title: '更新失败', description: '网络错误', variant: 'destructive' });
    }
  };

  // 设为默认供应方
  const handleSetDefault = async (supplier: Supplier) => {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...supplier, isDefault: true }),
      });
      if (res.ok) {
        const result = await res.json();
        // 刷新列表，更新默认状态
        await fetchSuppliers();
        // 通知其他组件
        localStorage.setItem('supplierInfo', JSON.stringify(result.supplier));
        window.dispatchEvent(new CustomEvent('supplier-info-updated', {
          detail: result.supplier,
        }));
        toast({ title: '设置成功', description: `"${supplier.companyName}" 已设为默认供应方` });
      } else {
        const err = await res.json();
        toast({ title: '设置失败', description: err.error || '请重试', variant: 'destructive' });
      }
    } catch {
      toast({ title: '设置失败', description: '网络错误', variant: 'destructive' });
    }
  };

  // 选择供应方
  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    if (onSelect) {
      onSelect(supplier);
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
    if (checkedIds.size === suppliers.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(suppliers.map(s => s.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${checkedIds.size} 个供应方？`)) return;
    try {
      await Promise.all([...checkedIds].map(id =>
        fetch(`/api/suppliers?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      ));
      setSuppliers(suppliers.filter(s => !checkedIds.has(s.id)));
      setCheckedIds(new Set());
      toast({ title: '批量删除成功', description: `已删除 ${checkedIds.size} 个供应方` });
    } catch {
      toast({ title: '批量删除失败', variant: 'destructive' });
    }
  };

  // CSV 导出
  const handleDownload = () => {
    const headers = [
      '公司名称',
      '联系人',
      '电话',
      '邮箱',
      '地址',
      '开户银行',
      '银行账号',
      '税号',
      '是否默认',
    ];

    const rows = suppliers.map((s) => [
      s.companyName,
      s.contactPerson,
      s.phone,
      s.email,
      s.address,
      s.bankName || '',
      s.bankAccount || '',
      s.taxNumber || '',
      s.isDefault ? '是' : '否',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `供应方列表_${new Date().toLocaleDateString()}.csv`;
    link.click();

    toast({
      title: '下载成功',
      description: '供应方列表已下载',
    });
  };

  // CSV 批量导入
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

          if (values.length >= 1) {
            return fetch('/api/suppliers', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                companyName: values[0] || '',
                contactPerson: values[1] || '',
                phone: values[2] || '',
                email: values[3] || '',
                address: values[4] || '',
                bankName: values[5] || '',
                bankAccount: values[6] || '',
                taxNumber: values[7] || '',
                website: '',
                isDefault: values[8] === '是',
              }),
            });
          }
          return Promise.resolve();
        });

      try {
        await Promise.all(importPromises);
        await fetchSuppliers();
        toast({
          title: '导入成功',
          description: '供应方已批量导入',
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
                <Users className="h-5 w-5 text-blue-500" />
                供应方资料库
              </CardTitle>
              <CardDescription>{suppliers.length} 个供应方记录{checkedIds.size > 0 && ` · 已选 ${checkedIds.size} 个`}</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              {checkedIds.size > 0 && (
                <Button size="sm" variant="destructive" onClick={handleBatchDelete}>
                  删除选中 ({checkedIds.size})
                </Button>
              )}
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
                添加供应方
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
              placeholder="搜索公司名称、联系人或电话..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* 供应方列表 */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="text-center text-gray-500 py-8">加载中...</div>
            ) : suppliers.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchTerm ? '未找到匹配的供应方' : '暂无供应方记录'}
              </div>
            ) : (
              <div>
                {suppliers.length > 1 && (
                  <div className="flex items-center gap-2 px-1 pb-2 border-b mb-2">
                    <input type="checkbox" checked={checkedIds.size === suppliers.length} onChange={toggleAll} className="rounded border-gray-300" />
                    <span className="text-xs text-muted-foreground">全选</span>
                  </div>
                )}
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className={`border rounded-lg p-4 hover:bg-gray-50 transition-colors ${selectedSupplier?.id === supplier.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1 cursor-pointer" onClick={() => handleSelectSupplier(supplier)}>
                        <input type="checkbox" checked={checkedIds.has(supplier.id)} onChange={() => toggleCheck(supplier.id)} onClick={(e) => e.stopPropagation()} className="mt-1 rounded border-gray-300" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-blue-500" />
                            <span className="font-semibold text-sm">{supplier.companyName}</span>
                            {supplier.isDefault && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                <Star className="h-3 w-3 fill-green-500 text-green-500" />
                                默认
                              </span>
                            )}
                            {selectedSupplier?.id === supplier.id && <Check className="h-4 w-4 text-blue-500" />}
                          </div>
                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-2"><span className="font-medium">联系人:</span><span>{supplier.contactPerson}</span><Phone className="h-3 w-3 ml-2" /><span>{supplier.phone}</span></div>
                            {supplier.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" /><span className="truncate">{supplier.email}</span></div>}
                            {supplier.address && <div className="flex items-center gap-2"><MapPin className="h-3 w-3" /><span className="truncate">{supplier.address}</span></div>}
                            {supplier.bankName && <div className="flex items-center gap-2 text-blue-600"><Banknote className="h-3 w-3" /><span className="truncate">{supplier.bankName}</span></div>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <Button variant="ghost" size="icon" className={`h-8 w-8 ${supplier.isDefault ? 'text-yellow-500' : 'text-slate-400 hover:text-yellow-500 hover:bg-yellow-50'}`} onClick={(e) => { e.stopPropagation(); handleSetDefault(supplier); }} title={supplier.isDefault ? '当前默认' : '设为默认'}>
                          <Star className={`h-4 w-4 ${supplier.isDefault ? 'fill-yellow-500' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); setEditingSupplier(supplier); }}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteSupplier(supplier); }}><Trash2 className="h-4 w-4" /></Button>
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
              确定要删除供应方 "{supplierToDelete?.companyName}" 吗？此操作不可撤销。
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

      {/* 编辑供应方对话框 */}
      {editingSupplier && (
        <EditSupplierDialog
          open={!!editingSupplier}
          onOpenChange={(open) => { if (!open) setEditingSupplier(null); }}
          supplier={editingSupplier}
          onSave={handleUpdateSupplier}
        />
      )}

      {/* 添加供应方对话框 */}
      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSupplier}
      />
    </>
  );
}

// 编辑供应方对话框
function EditSupplierDialog({
  open, onOpenChange, supplier, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier;
  onSave: (data: Supplier) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    companyName: supplier.companyName,
    contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    address: supplier.address || '',
    website: supplier.website || '',
    bankName: supplier.bankName || '',
    bankAccount: supplier.bankAccount || '',
    taxNumber: supplier.taxNumber || '',
  });

  const handleSubmit = () => {
    if (!formData.companyName) { alert('请填写公司名称'); return; }
    onSave({ ...supplier, ...formData });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑供应方 - {supplier.companyName}</DialogTitle>
          <DialogDescription>修改供应方信息</DialogDescription>
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
                <Label className="text-xs">联系人</Label>
                <Input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">电话</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">邮箱</Label>
                <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs">地址</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  网站
                </Label>
                <Input value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://example.com" />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="financial" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Banknote className="h-3 w-3" />
                  开户银行
                </Label>
                <Input value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Receipt className="h-3 w-3" />
                  银行账号
                </Label>
                <Input value={formData.bankAccount} onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  税号
                </Label>
                <Input value={formData.taxNumber} onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })} />
              </div>
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

// 添加供应方对话框
function AddSupplierDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (supplier: Omit<Supplier, 'id' | 'isDefault' | 'createdAt' | 'updatedAt'>) => Promise<any | null>;
}) {
  const [formData, setFormData] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    bankName: '',
    bankAccount: '',
    taxNumber: '',
  });

  const resetForm = () => {
    setFormData({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      website: '',
      bankName: '',
      bankAccount: '',
      taxNumber: '',
    });
  };

  const handleSubmit = async () => {
    if (!formData.companyName) {
      alert('请填写公司名称');
      return;
    }

    const result = await onAdd(formData);
    if (result) {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加新供应方</DialogTitle>
          <DialogDescription>填写供应方信息，添加到供应方资料库</DialogDescription>
        </DialogHeader>

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
                  placeholder="XX机械有限公司"
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
                <Label className="text-xs flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  网站
                </Label>
                <Input
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Banknote className="h-3 w-3" />
                  开户银行
                </Label>
                <Input
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="中国建设银行XX分行"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Receipt className="h-3 w-3" />
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
