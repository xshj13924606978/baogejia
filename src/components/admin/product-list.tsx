'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package2, Loader2, Settings2, GripVertical, MoreHorizontal,
  Plus, Pencil, Trash2, Search,
} from 'lucide-react';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  model?: string;
  brand?: string;
  category?: string;
  price: number;
  unit?: string;
  parameter_description?: string;
  supplier?: string;
  contact_person?: string;
  contact_phone?: string;
  cost_price?: number;
  min_price?: number;
  stock?: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width?: number;
  className?: string;
}

interface ProductListProps {
  className?: string;
}

// 默认列配置
const defaultColumns: ColumnConfig[] = [
  { key: 'name', label: '产品名称', visible: true },
  { key: 'model', label: '规格型号', visible: true },
  { key: 'brand', label: '品牌', visible: true },
  { key: 'category', label: '分类', visible: true },
  { key: 'price', label: '指导价', visible: true, className: 'text-right' },
  { key: 'unit', label: '单位', visible: true },
  { key: 'supplier', label: '供应商', visible: true },
  { key: 'parameter_description', label: '参数描述', visible: false },
  { key: 'cost_price', label: '成本价', visible: false, className: 'text-right' },
  { key: 'min_price', label: '最低售价', visible: false, className: 'text-right' },
  { key: 'stock', label: '库存', visible: false },
  { key: 'contact_person', label: '联系人', visible: false },
  { key: 'contact_phone', label: '联系电话', visible: false },
  { key: 'created_at', label: '创建时间', visible: false },
];

const STORAGE_KEY = 'product-list-columns';

// 产品表单字段定义
const productFields = [
  { key: 'name', label: '产品名称', required: true, type: 'text' },
  { key: 'category', label: '分类', type: 'text' },
  { key: 'model', label: '规格型号', type: 'text' },
  { key: 'parameter_description', label: '参数描述', type: 'text', colSpan: 2 },
  { key: 'brand', label: '品牌', type: 'text' },
  { key: 'unit', label: '单位', type: 'text' },
  { key: 'supplier', label: '供应商', type: 'text' },
  { key: 'contact_person', label: '联系人', type: 'text' },
  { key: 'contact_phone', label: '联系电话', type: 'text' },
  { key: 'cost_price', label: '成本价', type: 'number' },
  { key: 'min_price', label: '最低售价', type: 'number' },
  { key: 'price', label: '指导价', type: 'number' },
  { key: 'stock', label: '库存', type: 'number' },
  { key: 'image_url', label: '产品图片URL', type: 'text', colSpan: 2 },
];

export function ProductList({ className }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragStartIndex = useRef<number | null>(null);

  // 搜索和分页
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // 对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  // 从 localStorage 加载列配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = defaultColumns.map((col) => {
          const savedCol = parsed.find((c: ColumnConfig) => c.key === col.key);
          return savedCol ? { ...col, visible: savedCol.visible } : col;
        });
        const ordered = parsed
          .filter((c: ColumnConfig) => merged.find((m) => m.key === c.key))
          .map((c: ColumnConfig) => merged.find((m) => m.key === c.key));
        setColumns(ordered.length > 0 ? ordered : defaultColumns);
      } catch (e) {
        console.error('加载列配置失败:', e);
      }
    }
  }, []);

  const saveColumns = (newColumns: ColumnConfig[]) => {
    setColumns(newColumns);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newColumns));
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        page: String(page),
      });
      if (keyword) params.set('keyword', keyword);

      const response = await fetch(`/api/tables/products/list?${params}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.data || []);
        setTotalCount(data.count || 0);
      } else {
        setError(data.error || '加载失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [keyword, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // 搜索防抖
  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // 切换列的可见性
  const toggleColumn = (key: string) => {
    const newColumns = columns.map((col) =>
      col.key === key ? { ...col, visible: !col.visible } : col
    );
    saveColumns(newColumns);
  };

  // 拖拽列排序
  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragStartIndex.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null) return;
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragStartIndex.current === null || dragStartIndex.current === dropIndex) {
      setDraggedIndex(null);
      dragStartIndex.current = null;
      return;
    }
    const newColumns = [...columns];
    const draggedColumn = newColumns[dragStartIndex.current];
    newColumns.splice(dragStartIndex.current, 1);
    newColumns.splice(dropIndex, 0, draggedColumn);
    saveColumns(newColumns);
    setDraggedIndex(null);
    dragStartIndex.current = null;
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    dragStartIndex.current = null;
  };

  // 打开新增/编辑对话框
  const openCreateDialog = () => {
    setEditingProduct(null);
    setFormData({ name: '', price: '', unit: '台' });
    setEditDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category || '',
      model: product.model || '',
      parameter_description: product.parameter_description || '',
      brand: product.brand || '',
      unit: product.unit || '',
      supplier: product.supplier || '',
      contact_person: product.contact_person || '',
      contact_phone: product.contact_phone || '',
      cost_price: product.cost_price || '',
      min_price: product.min_price || '',
      price: product.price,
      stock: product.stock || '',
      image_url: product.image_url || '',
    });
    setEditDialogOpen(true);
  };

  // 提交创建/编辑
  const handleSubmit = async () => {
    if (!formData.name?.trim()) {
      toast.error('产品名称不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingProduct
        ? `/api/tables/products/${editingProduct.id}`
        : '/api/tables/products';
      const method = editingProduct ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (data.success) {
        toast.success(editingProduct ? '产品更新成功' : '产品创建成功');
        setEditDialogOpen(false);
        loadProducts();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除确认
  const openDeleteDialog = (product: Product) => {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/tables/products/${deletingProduct.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        toast.success('产品删除成功');
        setDeleteDialogOpen(false);
        setDeletingProduct(null);
        loadProducts();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 渲染单元格内容
  const renderCell = (product: Product, key: string): React.ReactNode => {
    switch (key) {
      case 'name':
        return <span className="font-medium">{product.name || '-'}</span>;
      case 'model':
        return product.model || '-';
      case 'brand':
        return product.brand || '-';
      case 'category':
        return product.category ? <Badge variant="secondary">{product.category}</Badge> : '-';
      case 'price':
        return <span className="text-right">¥{product.price.toLocaleString()}</span>;
      case 'unit':
        return product.unit || '-';
      case 'supplier':
        return product.supplier || '-';
      case 'parameter_description':
        return <span className="text-xs text-muted-foreground max-w-[200px] truncate block">{product.parameter_description || '-'}</span>;
      case 'cost_price':
        return <span className="text-right">¥{(product.cost_price || 0).toLocaleString()}</span>;
      case 'min_price':
        return <span className="text-right">¥{(product.min_price || 0).toLocaleString()}</span>;
      case 'stock':
        return product.stock || '-';
      case 'contact_person':
        return product.contact_person || '-';
      case 'contact_phone':
        return product.contact_phone || '-';
      case 'created_at':
        return new Date(product.created_at).toLocaleString('zh-CN');
      default:
        return '-';
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading && products.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-4">
          <CardTitle>产品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">加载中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && products.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-4">
          <CardTitle>产品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-destructive">加载失败：{error}</p>
            <Button onClick={loadProducts} className="mt-4">重试</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleColumns = columns.filter((col) => col.visible);

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span>产品列表</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-normal text-muted-foreground">
                共 {totalCount} 条
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    列设置
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="p-2 text-xs text-muted-foreground">
                    拖拽可调整列顺序
                  </div>
                  {columns.map((col, index) => (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded cursor-move transition-colors ${
                        draggedIndex === index ? 'opacity-50' : ''
                      }`}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                      <DropdownMenuCheckboxItem
                        checked={col.visible}
                        onCheckedChange={() => toggleColumn(col.key)}
                        className="flex-1 cursor-pointer"
                        onSelect={(e) => e.preventDefault()}
                      >
                        {col.label}
                      </DropdownMenuCheckboxItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 搜索和操作栏 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索产品名称..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={handleSearch}>搜索</Button>
            {keyword && (
              <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setPage(1); }}>
                清除筛选
              </Button>
            )}
            <div className="flex-1" />
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              新增产品
            </Button>
          </div>

          {/* 产品表格 */}
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                <Package2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg mb-2">
                {keyword ? '没有找到匹配的产品' : '暂无产品数据'}
              </p>
              <p className="text-sm text-muted-foreground/70">
                {keyword ? '请尝试其他关键词' : '通过导入功能添加产品，或手动创建第一条产品记录'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((col) => (
                        <TableHead key={col.key} className={col.className}>
                          {col.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-[60px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        {visibleColumns.map((col) => (
                          <TableCell
                            key={`${product.id}-${col.key}`}
                            className={col.className}
                          >
                            {renderCell(product, col.key)}
                          </TableCell>
                        ))}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                编辑
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => openDeleteDialog(product)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    第 {page}/{totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline" size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 新增/编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? '编辑产品' : '新增产品'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? '修改产品信息' : '填写产品信息创建新记录'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {productFields.map((field) => (
              <div key={field.key} className={field.colSpan === 2 ? 'col-span-2' : ''}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.key}
                  type={field.type}
                  value={formData[field.key] || ''}
                  onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  placeholder={`请输入${field.label}`}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingProduct ? '保存修改' : '创建产品'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除产品「{deletingProduct?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
