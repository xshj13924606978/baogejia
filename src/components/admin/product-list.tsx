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
  Plus, Pencil, Trash2, Search, FileDown, ListFilter, Settings, Filter, X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { usePageConfig } from '@/hooks/usePageConfig';
import FieldConfigManager from '@/components/knowledge-center/field-config-manager';

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

// 列配置从动态配置加载，localStorage 仅保存用户的可见性/排序覆盖
const STORAGE_KEY = 'product-list-columns';

// 列头下拉筛选组件（#[20260824-1807] Excel 风格：标题 + 三角图标 + 计数徽标，
// 下拉内含搜索框 + 复选列表 + 全选/清除；数据从 /api/tables/products/distinct 动态加载，禁止硬编码列值）
interface ColumnFilterPopoverProps {
  columnKey: string;
  label: string;
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

function ColumnFilterPopover({
  columnKey,
  label,
  selected,
  onChange,
  className,
}: ColumnFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [allValues, setAllValues] = useState<{ value: string; count: number }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // 打开时拉取 distinct 值（去重 + 计数）；同列同次会话内缓存
  React.useEffect(() => {
    if (!open || allValues.length > 0) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tables/products/distinct?column=${encodeURIComponent(columnKey)}&limit=300`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success && Array.isArray(d.data)) setAllValues(d.data);
      })
      .catch(() => {
        /* 静默失败：UI 不阻断主流程 */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, columnKey, allValues.length]);

  const filtered = React.useMemo(() => {
    if (!search) return allValues;
    const s = search.toLowerCase();
    return allValues.filter((v) => v.value.toLowerCase().includes(s));
  }, [allValues, search]);

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next);
  };

  const active = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 transition-colors select-none hover:text-primary',
            active && 'text-primary',
            className
          )}
          aria-label={`筛选 ${label}`}
        >
          <span>{label}</span>
          <Filter
            className={cn(
              'h-3 w-3 shrink-0',
              active && 'fill-primary text-primary'
            )}
          />
          {active && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b px-2 py-1.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索值..."
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {loading ? (
            <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {allValues.length === 0 ? '暂无数据' : '无匹配项'}
            </div>
          ) : (
            filtered.map((v) => (
              <label
                key={v.value}
                className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <input
                    type="checkbox"
                    checked={selected.includes(v.value)}
                    onChange={() => toggle(v.value)}
                    className="h-3 w-3 shrink-0"
                  />
                  <span className="truncate" title={v.value}>
                    {v.value || '(空)'}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {v.count}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-1 border-t px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            清除
          </Button>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange(filtered.map((v) => v.value))}
              disabled={filtered.length === 0}
            >
              全选当前
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange(allValues.map((v) => v.value))}
              disabled={allValues.length === 0}
            >
              全选
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// 产品表单字段从动态配置加载
export function ProductList({ className }: ProductListProps) {
  const { fields, getField } = usePageConfig('product_list');

  // 从动态配置生成列定义（异步 fields 加载完成后才会真正有列）
  const dynamicColumns = React.useMemo<ColumnConfig[]>(() => {
    return [...fields]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(f => ({
        key: f.field_key,
        label: f.label_zh,
        visible: f.is_visible,
        width: f.config?.width,
        className: f.config?.align ? `text-${f.config.align}` : undefined,
      }));
  }, [fields]);

  // 产品表单字段从动态配置生成
  const dynamicProductFields = React.useMemo(() => {
    return fields
      .filter(f => f.is_editable)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(f => ({
        key: f.field_key,
        label: f.label_zh,
        required: f.is_required,
        type: f.field_type,
      }));
  }, [fields]);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 初始为空数组：等 fields 异步加载完成后由下方 useEffect 合并 localStorage 填充
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragStartIndex = useRef<number | null>(null);

  // 搜索和分页（每页条数支持用户设置并持久化，#20260824-1716）
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE_STORAGE_KEY = 'product-list-page-size';
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 20;
    const saved = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    const n = saved ? parseInt(saved, 10) : 20;
    return [10, 20, 50, 100, 200].includes(n) ? n : 20;
  });
  // 列字段筛选（#[20260824-1807] 列头下拉多选：key 为列名，value 为该列勾选值数组；
  // URL 传递格式 'key=a,b,c'，后端 list API 自动识别为 in.(...) 多选过滤）
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // 字段必填配置弹窗（复用用户端同一组件，写入同一张 product_field_configs 表，一处设置全局生效）
  const [fieldConfigOpen, setFieldConfigOpen] = useState(false);

  // 导出弹窗状态（#20260824-1716）
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'json'>('excel');
  const [exportSelectedFields, setExportSelectedFields] = useState<string[]>([]);
  const [exportGroupBy, setExportGroupBy] = useState<'none' | 'brand' | 'supplier'>('none');
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // 对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  // 从 localStorage 加载列配置 + 响应 fields 异步加载完成
  // 注意：usePageConfig 在数据未就绪时 fields 每次渲染都是新的空数组引用，
  // 因此这里必须用「内容比较」的幂等 setState，避免依赖数组变化导致的无限循环。
  useEffect(() => {
    // fields 尚未就绪：保持当前空数组，幂等返回 prev 避免循环
    if (dynamicColumns.length === 0) {
      setColumns((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    let parsed: ColumnConfig[] | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {
      console.error('加载列配置失败:', e);
    }

    let next: ColumnConfig[];
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      next = dynamicColumns;
    } else {
      // 把 localStorage 中的 visibility 覆盖到 dynamicColumns，并按 localStorage 顺序排列
      const merged = dynamicColumns.map((col) => {
        const savedCol = parsed.find((c: ColumnConfig) => c.key === col.key);
        return savedCol ? { ...col, visible: savedCol.visible } : col;
      });
      const existingKeys = new Set(parsed.map((c: ColumnConfig) => c.key));
      const ordered = parsed
        .map((c: ColumnConfig) => merged.find((m) => m.key === c.key))
        .filter((c): c is ColumnConfig => c !== undefined);
      // 追加 localStorage 中不存在的新字段到末尾
      const newFields = merged.filter((c) => !existingKeys.has(c.key));
      next = [...ordered, ...newFields];
    }

    setColumns((prev) => {
      // 内容一致则复用 prev 引用，React 会跳过渲染，从而阻断循环
      if (
        prev.length === next.length &&
        prev.every((c, i) => c.key === next[i].key && c.visible === next[i].visible)
      ) {
        return prev;
      }
      return next;
    });
  }, [dynamicColumns]);

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
      // 列字段筛选（#[20260824-1807]：数组 join 为 a,b,c，后端识别为 in.(...) 多选过滤）
      for (const [key, values] of Object.entries(columnFilters)) {
        const arr = (values || []).filter((v) => v != null && String(v).trim() !== '');
        if (arr.length > 0) params.set(key, arr.join(','));
      }

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
  }, [keyword, page, pageSize, columnFilters]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // 列字段筛选（#[20260824-1807] 列头下拉多选）
  const applyColumnFilter = (key: string, values: string[]) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
    setPage(1);
  };

  const clearColumnFilters = () => {
    setColumnFilters({});
    setPage(1);
  };

  // 每页条数（持久化到 localStorage，#20260824-1716 需求5）
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    }
  };

  // 拉取当前筛选条件下的全部产品（导出用，不虚假数据、动态跟随筛选条件）
  const fetchAllFilteredProducts = useCallback(async (): Promise<any[]> => {
    const all: any[] = [];
    let p = 1;
    while (true) {
      const params = new URLSearchParams({ limit: '500', page: String(p) });
      if (keyword) params.set('keyword', keyword);
      for (const [k, values] of Object.entries(columnFilters)) {
        const arr = (values || []).filter((v) => v != null && String(v).trim() !== '');
        if (arr.length > 0) params.set(k, arr.join(','));
      }
      const res = await fetch(`/api/tables/products/list?${params}`);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '获取数据失败');
      }
      const rows = data.data || [];
      all.push(...rows);
      if (rows.length < 500) break;
      p += 1;
    }
    return all;
  }, [keyword, columnFilters]);

  // 打开导出弹窗：动态提取品牌/供应商真实值列表（#20260824-1716 需求3）
  const openExportDialog = async () => {
    setExportOpen(true);
    setExportSelectedFields(visibleColumns.map((c) => c.key));
    try {
      const rows = await fetchAllFilteredProducts();
      const brands = Array.from(
        new Set(rows.map((r) => r.brand).filter((v: unknown) => v))
      ) as string[];
      const suppliers = Array.from(
        new Set(rows.map((r) => r.supplier).filter((v: unknown) => v))
      ) as string[];
      setBrandOptions(brands.sort((a, b) => String(a).localeCompare(String(b), 'zh-CN')));
      setSupplierOptions(suppliers.sort((a, b) => String(a).localeCompare(String(b), 'zh-CN')));
    } catch (err) {
      toast.error((err as Error).message || '获取导出数据失败');
    }
  };

  const downloadBlob = (content: BlobPart, filename: string, type: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 执行导出（#20260824-1716 需求3：格式自由选择 + 字段自由勾选 + 品牌/供应商维度筛选 + 分组导出）
  const handleExport = async () => {
    if (exportSelectedFields.length === 0) {
      toast.error('请至少选择一个导出字段');
      return;
    }
    setExporting(true);
    try {
      const rows = await fetchAllFilteredProducts();
      let filtered = rows;
      if (selectedBrands.length > 0) {
        filtered = filtered.filter((r) => selectedBrands.includes(r.brand));
      }
      if (selectedSuppliers.length > 0) {
        filtered = filtered.filter((r) => selectedSuppliers.includes(r.supplier));
      }

      const fieldKeys = exportSelectedFields;
      const headers = visibleColumns
        .filter((c) => fieldKeys.includes(c.key))
        .map((c) => c.label);
      const toRow = (r: any) =>
        fieldKeys.map((k) => {
          const v = r[k];
          return v === null || v === undefined ? '' : String(v);
        });
      const columnWidths = fieldKeys.map((k) => ({ wch: Math.max(10, k.length + 6) }));

      if (exportFormat === 'json') {
        const jsonData = filtered.map((r) => {
          const o: Record<string, unknown> = {};
          for (const k of fieldKeys) o[k] = r[k];
          return o;
        });
        downloadBlob(
          JSON.stringify(jsonData, null, 2),
          `产品导出_${Date.now()}.json`,
          'application/json;charset=utf-8'
        );
        toast.success(`已导出 ${jsonData.length} 条产品数据`);
      } else if (exportFormat === 'csv') {
        const aoa = [headers, ...filtered.map(toRow)];
        const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(aoa));
        downloadBlob(`\uFEFF${csv}`, `产品导出_${Date.now()}.csv`, 'text/csv;charset=utf-8');
        toast.success(`已导出 ${filtered.length} 条产品数据`);
      } else {
        // Excel：支持按品牌/供应商分组导出为多个工作表
        const wb = XLSX.utils.book_new();
        if (exportGroupBy === 'none') {
          const ws = XLSX.utils.aoa_to_sheet([headers, ...filtered.map(toRow)]);
          ws['!cols'] = columnWidths;
          XLSX.utils.book_append_sheet(wb, ws, '产品数据');
        } else {
          const groupKey = exportGroupBy === 'brand' ? 'brand' : 'supplier';
          const groups = new Map<string, any[]>();
          for (const r of filtered) {
            const g = String(r[groupKey] || '未填写');
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(r);
          }
          for (const [g, items] of groups.entries()) {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...items.map(toRow)]);
            ws['!cols'] = columnWidths;
            const sheetName = g.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || '未命名';
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
        }
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        downloadBlob(
          buffer,
          `产品导出_${Date.now()}.xlsx`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        toast.success(`已导出 ${filtered.length} 条产品数据，共 ${wb.SheetNames.length} 个工作表`);
      }
      setExportOpen(false);
    } catch (err) {
      toast.error((err as Error).message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 导出字段/品牌/供应商勾选切换（#20260824-1716 需求3）
  const toggleExportField = (key: string) => {
    setExportSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };
  const toggleBrand = (value: string) => {
    setSelectedBrands((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };
  const toggleSupplier = (value: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

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
    // 动态必填校验（#[20260824-1807]：按 dynamicProductFields（来自 query/page API 同步 product_field_configs 表）实时校验，
    // 严禁硬编码必填字段名；后端 POST 同样按 product_field_configs 二次校验，前后端联动一处设置全局生效）
    const requiredLabels: string[] = [];
    for (const field of dynamicProductFields) {
      if (!field.required) continue;
      const val = (formData as any)[field.key];
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        (typeof val === 'number' && Number.isNaN(val));
      if (isEmpty) requiredLabels.push(field.label);
    }
    if (requiredLabels.length > 0) {
      toast.error(`请填写必填字段：${requiredLabels.join('、')}`);
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

  // 可筛选列（#20260824-1716 需求5：列字段筛选，动态跟随全部可见列；
  // 后端 list API 动态读取 products 表真实列，传参即生效，未匹配的列自动忽略）
  const nonFilterableColumnKeys = new Set(['id', 'created_at', 'updated_at']);
  const filterableColumns = visibleColumns.filter((col) => !nonFilterableColumnKeys.has(col.key));

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
            <Button variant="outline" size="sm" onClick={openExportDialog} className="gap-2">
              <FileDown className="h-4 w-4" />
              导出
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFieldConfigOpen(true)} className="gap-2">
              <Settings className="h-4 w-4" />
              字段必填配置
            </Button>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              新增产品
            </Button>
          </div>

          {/* 当前筛选条件胶囊（#[20260824-1807] 列头下拉多选：仅当有勾选筛选时显示，一键清除） */}
          {Object.keys(columnFilters).length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">已筛选：</span>
              {Object.entries(columnFilters).map(([key, values]) => {
                const col = visibleColumns.find((c) => c.key === key);
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                  >
                    {col?.label || key} ({values.length})
                    <button
                      onClick={() => applyColumnFilter(key, [])}
                      className="hover:bg-primary/20 rounded-full"
                      aria-label={`清除 ${col?.label || key} 筛选`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              <Button variant="ghost" size="sm" onClick={clearColumnFilters} className="h-6 px-2 text-xs">
                清除全部
              </Button>
            </div>
          )}

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
              <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="hover:bg-slate-50/80 border-b border-slate-200">
                      {visibleColumns.map((col) => {
                        const isFilterable = !nonFilterableColumnKeys.has(col.key);
                        return (
                          <TableHead
                            key={col.key}
                            className={`${col.className || ''} text-xs font-semibold text-slate-700 uppercase tracking-wider py-3 px-4 whitespace-nowrap`}
                          >
                            {isFilterable ? (
                              <ColumnFilterPopover
                                columnKey={col.key}
                                label={col.label}
                                selected={columnFilters[col.key] || []}
                                onChange={(values) => applyColumnFilter(col.key, values)}
                              />
                            ) : (
                              col.label
                            )}
                          </TableHead>
                        );
                      })}
                      <TableHead className="w-[80px] text-xs font-semibold text-slate-700 uppercase tracking-wider py-3 px-4 text-right whitespace-nowrap">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow
                        key={product.id}
                        className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        {visibleColumns.map((col) => (
                          <TableCell
                            key={`${product.id}-${col.key}`}
                            className={`${col.className || ''} py-3 px-4 align-middle`}
                          >
                            {renderCell(product, col.key)}
                          </TableCell>
                        ))}
                        <TableCell className="py-3 px-4 text-right align-middle">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-200/60">
                                <MoreHorizontal className="h-4 w-4 text-slate-500" />
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

              {/* 分页（每页条数可设置并持久化，#20260824-1716 需求5） */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="whitespace-nowrap">每页</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => handlePageSizeChange(parseInt(v, 10))}
                  >
                    <SelectTrigger className="h-8 w-[76px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100, 200].map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="whitespace-nowrap">条</span>
                  <span className="hidden sm:inline">
                    共 {totalCount} 条 · 第 {page}/{totalPages} 页
                  </span>
                </div>
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
            {dynamicProductFields.map((field) => (
              <div key={field.key}>
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

      {/* 字段必填配置对话框（#20260824-1716 需求2：与用户端价格库共用 product_field_configs 表，一处设置全局生效） */}
      <Dialog open={fieldConfigOpen} onOpenChange={setFieldConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>产品字段必填配置</DialogTitle>
            <DialogDescription>
              与用户端「资料中心 → 产品价格库」共用同一配置数据源，此处修改后全局即时生效。
            </DialogDescription>
          </DialogHeader>
          <FieldConfigManager />
          <DialogFooter>
            <Button onClick={() => setFieldConfigOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导出对话框（#20260824-1716 需求3：格式选择 + 品牌/供应商维度 + 字段勾选 + Excel 分组） */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>导出产品</DialogTitle>
            <DialogDescription>
              按当前搜索与列筛选条件导出，可自由设置导出格式、内容与品牌/供应商维度。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* 导出格式 */}
            <div>
              <Label className="mb-2 block text-sm font-medium">导出格式</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['excel', 'Excel (.xlsx)'],
                    ['csv', 'CSV'],
                    ['json', 'JSON'],
                  ] as const
                ).map(([fmt, label]) => (
                  <Button
                    key={fmt}
                    size="sm"
                    variant={exportFormat === fmt ? 'default' : 'outline'}
                    onClick={() => setExportFormat(fmt)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* 品牌维度筛选 */}
            <div>
              <Label className="mb-2 block text-sm font-medium">
                品牌维度（勾选指定品牌，不勾选 = 导出全部）
              </Label>
              {brandOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前筛选结果中暂无品牌数据</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-28 overflow-y-auto rounded-md border border-slate-200 p-3">
                  {brandOptions.map((b) => (
                    <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(b)}
                        onChange={() => toggleBrand(b)}
                      />
                      {b}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 供应商维度筛选 */}
            <div>
              <Label className="mb-2 block text-sm font-medium">
                厂家维度（勾选指定厂家，不勾选 = 导出全部）
              </Label>
              {supplierOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前筛选结果中暂无厂家数据</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-28 overflow-y-auto rounded-md border border-slate-200 p-3">
                  {supplierOptions.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSuppliers.includes(s)}
                        onChange={() => toggleSupplier(s)}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Excel 分组 */}
            {exportFormat === 'excel' && (
              <div>
                <Label className="mb-2 block text-sm font-medium">Excel 分组导出</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['none', '不分组（单工作表）'],
                      ['brand', '按品牌分工作表'],
                      ['supplier', '按厂家分工作表'],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={exportGroupBy === key ? 'default' : 'outline'}
                      onClick={() => setExportGroupBy(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* 导出内容（字段勾选） */}
            <div>
              <Label className="mb-2 block text-sm font-medium">导出内容（字段勾选）</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 rounded-md border border-slate-200 p-3">
                {visibleColumns.map((col) => (
                  <label key={col.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSelectedFields.includes(col.key)}
                      onChange={() => toggleExportField(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExportSelectedFields(visibleColumns.map((c) => c.key))}
                >
                  全选
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExportSelectedFields([])}>
                  清空
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button onClick={handleExport} disabled={exporting} className="gap-2">
              {exporting && <Loader2 className="h-4 w-4 animate-spin" />}
              {exporting ? '导出中...' : '开始导出'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
