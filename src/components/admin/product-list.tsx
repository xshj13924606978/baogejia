'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Package2, Loader2, Settings2, GripVertical } from 'lucide-react';

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
  description?: string;
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

export function ProductList({ className }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragStartIndex = useRef<number | null>(null);

  // 从 localStorage 加载列配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 合并保存的配置和默认配置（处理新增列）
        const merged = defaultColumns.map((col) => {
          const savedCol = parsed.find((c: ColumnConfig) => c.key === col.key);
          return savedCol ? { ...col, visible: savedCol.visible } : col;
        });
        // 保持顺序
        const ordered = parsed
          .filter((c: ColumnConfig) => merged.find((m) => m.key === c.key))
          .map((c: ColumnConfig) => merged.find((m) => m.key === c.key));
        setColumns(ordered.length > 0 ? ordered : defaultColumns);
      } catch (e) {
        console.error('加载列配置失败:', e);
      }
    }
  }, []);

  // 保存列配置到 localStorage
  const saveColumns = (newColumns: ColumnConfig[]) => {
    setColumns(newColumns);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newColumns));
  };

  const loadProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tables/products/list?limit=100');
      const data = await response.json();

      if (data.success) {
        setProducts(data.data || []);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // 切换列的可见性
  const toggleColumn = (key: string) => {
    const newColumns = columns.map((col) =>
      col.key === key ? { ...col, visible: !col.visible } : col
    );
    saveColumns(newColumns);
  };

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragStartIndex.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  // 拖拽悬停
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // 拖拽进入
  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null) return;
    e.preventDefault();
  };

  // 拖拽结束
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

  // 拖拽结束清除状态
  const handleDragEnd = () => {
    setDraggedIndex(null);
    dragStartIndex.current = null;
  };

  // 渲染单元格内容
  const renderCell = (product: Product, key: string): React.ReactNode => {
    switch (key) {
      case 'name':
        return product.name || '-';
      case 'model':
        return product.model || '-';
      case 'brand':
        return product.brand || '-';
      case 'category':
        return product.category || '-';
      case 'price':
        return `¥${product.price.toLocaleString()}`;
      case 'unit':
        return product.unit || '-';
      case 'supplier':
        return product.supplier || '-';
      case 'parameter_description':
        return product.parameter_description || '-';
      case 'cost_price':
        return `¥${(product.cost_price || 0).toLocaleString()}`;
      case 'min_price':
        return `¥${(product.min_price || 0).toLocaleString()}`;
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

  if (loading) {
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

  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="pb-4">
          <CardTitle>产品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-destructive">加载失败：{error}</p>
            <button
              onClick={loadProducts}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              重试
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-4">
          <CardTitle>产品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <Package2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-lg mb-2">暂无产品数据</p>
            <p className="text-sm text-muted-foreground/70">
              通过导入功能添加产品，或手动创建第一条产品记录
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleColumns = columns.filter((col) => col.visible);

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span>产品列表</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-normal text-muted-foreground">
              共 {products.length} 条
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
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.className}
                >
                  {col.label}
                </TableHead>
              ))}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
// test
