'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import ImportFieldMapping, { SYSTEM_FIELDS } from './import-field-mapping';
import FieldConfigManager from './field-config-manager';
import MultiUploadDialog from './multi-upload-dialog';
import { CategoryTree } from '@/components/admin/category-tree';
import { defaultCategoryTree } from '@/data/product-categories';
import { fixWorksheetSuperscript } from '@/utils/excel-superscript-fix';
import { useUser } from '@/contexts/UserContext';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { PRODUCT_TEXT } from '@/lib/constants/products';
import { useFieldConfigChange } from '@/hooks/useFieldConfigEvent';
import { CheckCircle2, Info, RefreshCw, Search, BarChart3, TrendingUp, Tags, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function PriceLibrary() {
  // 权限：管理员可删除/导出/下载模板/列配置/字段配置；非管理员新增/编辑/导入，且只能编辑自己的产品
  const { user } = useUser();
  const isAdmin = !!user && (user.role === 'super_admin' || user.role === 'admin');
  // 服务端身份优先（登录时本地缓存 id 可能是本地 id，supabaseId 才是数据库 UUID）
  const currentUserId = user?.supabaseId || user?.id || null;

  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // 导入进度相关状态
  const [importProgress, setImportProgress] = useState<{
    show: boolean;
    current: number;
    total: number;
    successCount: number;
    errorCount: number;
    duplicateCount: number;
    status: 'importing' | 'prechecking' | 'completed' | 'error';
    message: string;
    errors?: string[];
    duplicateProducts?: Array<{ existing: any; attempted: any }>;
    pendingApprovalCount?: number;
    mode?: 'skip' | 'overwrite';
  } | null>(null);

  // 判重预检进行中的进度条动画值（仅表达"进行中"状态，不展示真实百分比，#[20260822-1000] 同步贡献中心 #20260821-2100）
  const [precheckProgress, setPrecheckProgress] = useState(0);
  
  // 导入详情弹窗状态
  const [importDetailDialog, setImportDetailDialog] = useState<{
    show: boolean;
    type: 'errors' | 'duplicates';
    title: string;
  } | null>(null);
  
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  
  // 所有品牌列表（用于统计）
  const [allBrands, setAllBrands] = useState<string[]>([]);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showExportFilter, setShowExportFilter] = useState(false);
  const [showExportFormatDialog, setShowExportFormatDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showConfigMenu, setShowConfigMenu] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);

  // 下拉菜单 refs 和 timers
  const _importMenuRef = useRef<HTMLDivElement>(null);
  const _exportMenuRef = useRef<HTMLDivElement>(null);
  const _configMenuRef = useRef<HTMLDivElement>(null);
  const importMenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exportMenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const configMenuTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [editingProduct, setEditingProduct] = useState<any>(null);
  // 非管理员编辑时的修改原因（需管理员审核，#20260820-1130-2）
  const [editReason, setEditReason] = useState('');
  // 导入时「检测到重复产品」处理弹窗（跳过 / 覆盖更新，#20260820-1130-5）
  const [duplicateChoice, setDuplicateChoice] = useState<{
    show: boolean;
    count: number;
    duplicateProducts: Array<{ existing: any; attempted: any }>;
    reason: string;
    mode: 'view' | 'overwrite';
    submitting: boolean;
  } | null>(null);
  // 预检弹窗确认后执行正式导入所需的字段映射（#20260820-1130-5）
  const pendingImportMappingRef = useRef<Record<string, string> | null>(null);
  const [_deletingProductId,_setDeletingProductIdd] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [pendingExcelData, setPendingExcelData] = useState<{
    headers: string[];
    data: any[];
  } | null>(null);
  const [pendingFilterConfig, setPendingFilterConfig] = useState<{
    brands?: Set<string>;
    keyword?: string;
  } | null>(null);
  const [fieldConfigs, setFieldConfigs] = useState<
    Record<string, { label: string; required: boolean }>
  >({});
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const defaults = [
      'select',
      'name',
      'model',
      'brand',
      'category',
      'parameter_description',
      'unit',
      'price',
      'supplier',
      'operations',
    ];
    // 非管理员默认不显示供应商（敏感信息）
    return isAdmin ? defaults : defaults.filter((k) => k !== 'supplier');
  });
  const [exportFilterBrands, setExportFilterBrands] = useState<Set<string>>(new Set());
  const [exportFilterKeywords, setExportFilterKeywords] = useState<string>('');
  const [newProduct, setNewProduct] = useState({
    name: '',
    model: '',
    brand: '',
    category: '',
    parameter_description: '',
    unit: '',
    cost_price: '',
    min_price: '',
    price: '',
    supplier: '',
    contact_person: '',
    contact_phone: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 敏感列（仅管理员可见）：厂家/联系人/电话/进价/最低售价
  const SENSITIVE_COLUMN_KEYS = ['cost_price', 'min_price', 'supplier', 'contact_person', 'contact_phone'];

  // 可用的列配置（非管理员隐藏敏感列）
  const allAvailableColumns = [
    { key: 'select', label: '选择', fixed: true },
    { key: 'name', label: '产品名称', defaultVisible: true },
    { key: 'model', label: '规格型号', defaultVisible: true },
    { key: 'brand', label: '品牌', defaultVisible: true },
    { key: 'category', label: '分类', defaultVisible: true },
    { key: 'parameter_description', label: '参数描述', defaultVisible: true },
    { key: 'unit', label: '单位', defaultVisible: true },
    { key: 'price', label: '指导价', defaultVisible: true },
    { key: 'cost_price', label: '成本', defaultVisible: false },
    { key: 'min_price', label: '最低售价', defaultVisible: false },
    { key: 'supplier', label: '供应商', defaultVisible: true },
    { key: 'contact_person', label: '联系人', defaultVisible: false },
    { key: 'contact_phone', label: '联系电话', defaultVisible: false },
    { key: 'operations', label: '操作', fixed: true },
  ];
  const availableColumns = isAdmin
    ? allAvailableColumns
    : allAvailableColumns.filter((col) => !SENSITIVE_COLUMN_KEYS.includes(col.key));

  // 从 localStorage 加载列配置
  useEffect(() => {
    const savedColumns = localStorage.getItem('price-library-columns');
    if (savedColumns) {
      try {
        const parsed = JSON.parse(savedColumns);

        // 检查是否包含旧字段名，如果有则清理配置
        if (parsed.includes('product_name')) {
          localStorage.removeItem('price-library-columns');
          // 使用默认配置
          const defaultColumns = availableColumns
            .filter((col) => col.defaultVisible || col.fixed)
            .map((col) => col.key);
          setVisibleColumns(defaultColumns);
          return;
        }

        // 确保 select 在第一列，operations 在最后一列
        const selectCol = 'select';
        const operationsCol = 'operations';

        // 过滤出中间列（非 select 和 operations）
        let middleColumns = parsed.filter((col: string) => col !== selectCol && col !== operationsCol);

        // 过滤掉当前用户不可见的列（非管理员隐藏敏感列）
        const allowedKeys = availableColumns.map((col) => col.key);
        middleColumns = middleColumns.filter((col: string) => allowedKeys.includes(col));

        // 确保包含 name 和 category 字段
        if (!middleColumns.includes('name')) {
          middleColumns.splice(0, 0, 'name');
        }
        if (!middleColumns.includes('category')) {
          middleColumns.splice(1, 0, 'category');
        }

        // 组装：select + 中间列 + operations
        const columnsWithFixed = [selectCol, ...middleColumns, operationsCol];

        setVisibleColumns(columnsWithFixed);
      } catch (e) {
        console.error('加载列配置失败:', e);
        // 使用默认配置
        const defaultColumns = availableColumns
          .filter((col) => col.defaultVisible || col.fixed)
          .map((col) => col.key);
        setVisibleColumns(defaultColumns);
      }
    }
  }, []);

  // 下拉菜单延迟关闭处理
  const handleMenuMouseLeave = (menuType: 'import' | 'export' | 'config') => {
    if (menuType === 'import') {
      importMenuTimerRef.current = setTimeout(() => {
        setShowImportMenu(false);
      }, 300);
    } else if (menuType === 'export') {
      exportMenuTimerRef.current = setTimeout(() => {
        setShowExportMenu(false);
      }, 300);
    } else if (menuType === 'config') {
      configMenuTimerRef.current = setTimeout(() => {
        setShowConfigMenu(false);
      }, 300);
    }
  };

  const handleMenuMouseEnter = (menuType: 'import' | 'export' | 'config') => {
    if (menuType === 'import' && importMenuTimerRef.current) {
      clearTimeout(importMenuTimerRef.current);
      importMenuTimerRef.current = null;
    } else if (menuType === 'export' && exportMenuTimerRef.current) {
      clearTimeout(exportMenuTimerRef.current);
      exportMenuTimerRef.current = null;
    } else if (menuType === 'config' && configMenuTimerRef.current) {
      clearTimeout(configMenuTimerRef.current);
      configMenuTimerRef.current = null;
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (importMenuTimerRef.current) clearTimeout(importMenuTimerRef.current);
      if (exportMenuTimerRef.current) clearTimeout(exportMenuTimerRef.current);
      if (configMenuTimerRef.current) clearTimeout(configMenuTimerRef.current);
    };
  }, []);

  // 判重预检进行中时驱动进度条动画（同步贡献中心上传价格表 #20260821-2100 逻辑，#[20260822-1000]）
  useEffect(() => {
    if (importProgress?.status !== 'prechecking') return;
    setPrecheckProgress(0);
    const timer = setInterval(() => {
      setPrecheckProgress((v) => (v >= 100 ? 0 : v + 5));
    }, 120);
    return () => clearInterval(timer);
  }, [importProgress?.status]);

  // 模拟产品数据
  const mockProducts = [
    {
      name: '工业提升泵',
      model: 'CR5-12',
      brand: '格兰富',
      category: '17-02',
      parameter_description: '流量12m³/h，扬程30m',
      unit: '台',
      price: 3200,
      supplier: '格兰富中国',
    },
    {
      name: '搅拌罐',
      model: '2.5m³',
      brand: '通用',
      category: '17-02',
      parameter_description: '不锈钢材质，配搅拌器',
      unit: '台',
      price: 14500,
      supplier: '通用机械',
    },
    {
      name: '板框压滤机',
      model: 'XMYZ100/800-U',
      brand: '景津',
      category: '18-01',
      parameter_description: '过滤面积100m²',
      unit: '台',
      price: 88000,
      supplier: '景津环保',
    },
    {
      name: '一体化污水泵站',
      model: 'WZ-100',
      brand: '威尔克',
      category: '17-02',
      parameter_description: '处理量100m³/h',
      unit: '套',
      price: 156000,
      supplier: '威尔克环境',
    },
    {
      name: '曝气机',
      model: 'QXB-3',
      brand: '诸城清泉',
      category: '17-02',
      parameter_description: '功率3kW',
      unit: '台',
      price: 4500,
      supplier: '诸城清泉',
    },
    {
      name: '加药装置',
      model: 'JY-200',
      brand: '绿洁',
      category: '18-01',
      parameter_description: '药箱容量200L',
      unit: '套',
      price: 8800,
      supplier: '绿洁环保',
    },
    {
      name: '气浮机',
      model: 'QF-20',
      brand: '绿洁',
      category: '18-01',
      parameter_description: '处理量20m³/h',
      unit: '台',
      price: 28000,
      supplier: '绿洁环保',
    },
    {
      name: '刮泥机',
      brand: '通用',
      model: 'XNG-10',
      category: '18-01',
      parameter_description: '池径10m',
      unit: '台',
      price: 42000,
      supplier: '通用机械',
    },
  ];

  // 加载产品列表
  const loadProducts = async (page: number = currentPage, size: number = pageSize) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/products/list?page=${page}&limit=${size}`);
      const data = await res.json();

      if (data.success) {
        setProducts(data.data || []);
        setTotalItems(data.count || 0);
        setCurrentPage(page);
        
        // 如果是第一页数据加载完成，加载品牌列表
        if (page === 1) {
          loadAllBrands();
        }
      } else {
        console.error('加载产品列表失败:', data.error);
        // 如果API调用失败，使用模拟数据
        setProducts(mockProducts);
        setTotalItems(mockProducts.length);
      }
    } catch (error) {
      console.error('加载产品列表失败:', error);
      // 如果网络错误，使用模拟数据
      setProducts(mockProducts);
      setTotalItems(mockProducts.length);
    } finally {
      setLoading(false);
    }
  };

  // 获取所有品牌列表
  const loadAllBrands = async () => {
    try {
      const res = await fetch('/api/tables/products/list?page=1&limit=10000');
      const data = await res.json();
      
      if (data.success && data.data) {
        const brands = new Set(data.data.map((p: any) => p.brand).filter(Boolean) as string[]);
        const brandArray = Array.from(brands);
        setAllBrands(brandArray);
      } else {
        console.warn('[Price Library] 品牌列表API返回失败:', data.error);
        // 降级：从当前产品中提取品牌
        if (products.length > 0) {
          const brands = new Set(products.map((p) => p.brand).filter(Boolean) as string[]);
          setAllBrands(Array.from(brands));
        }
      }
    } catch (error) {
      console.error('[Price Library] 获取品牌列表失败:', error);
      // 降级：从当前产品中提取品牌
      if (products.length > 0) {
        const brands = new Set(products.map((p) => p.brand).filter(Boolean) as string[]);
        setAllBrands(Array.from(brands));
      }
    }
  };

  // 获取分类及其所有子分类的 code 列表
  const getCategoryCodes = (node: any, codes: string[] = []): string[] => {
    codes.push(node.code);
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        getCategoryCodes(child, codes);
      }
    }
    return codes;
  };

  // 根据 code 查找分类节点
  const findCategoryByCode = (node: any, code: string): any => {
    if (node.code === code) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const found = findCategoryByCode(child, code);
        if (found) return found;
      }
    }
    return null;
  };

  // 根据选择的分类过滤产品
  const applyCategoryFilter = (categoryId: string | null) => {
    if (!categoryId) {
      setFilteredProducts(products);
      return;
    }

    const category = findCategoryByCode(defaultCategoryTree, categoryId);
    if (!category) {
      setFilteredProducts(products);
      return;
    }

    const categoryCodes = getCategoryCodes(category);
    setFilteredProducts(
      products.filter((p) => categoryCodes.includes(p.category))
    );
  };

  // 当产品或选中的分类变化时，重新应用过滤
  useEffect(() => {
    applyCategoryFilter(selectedCategoryId);
  }, [products, selectedCategoryId]);

  // 编辑产品
  const handleEditProduct = async (product: any) => {
    const isOwner = !isAdmin && product.creator_id && product.creator_id === currentUserId;
    setEditingProduct({ ...product, _isOwner: isOwner });
    setEditReason('');
    setShowEditForm(true);
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editingProduct.name || !editingProduct.price) {
      toast('请至少填写产品名称和价格');
      return;
    }
    // 非管理员编辑需填写修改原因，提交后由管理员审核
    if (!isAdmin && !editReason.trim()) {
      toast('请填写修改原因（管理员审核需要）');
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUserId) headers['x-user-id'] = currentUserId;
      const authHeaders = getClientAuthHeaders();
      Object.assign(headers, authHeaders);
      const payload: Record<string, unknown> = { ...editingProduct };
      if (!isAdmin) {
        payload.reason = editReason.trim();
        payload.requesterName = user?.name || user?.email || '';
      }
      const response = await fetch(`/api/tables/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        if (result.pendingApproval) {
          toast('修改申请已提交，等待管理员审核通过后生效');
        } else {
          toast('产品更新成功！');
        }
        setShowEditForm(false);
        setEditingProduct(null);
        setEditReason('');
        // 刷新产品列表
        await loadProducts(currentPage, pageSize);
      } else {
        toast(`更新失败：${result.error}`);
      }
    } catch (error) {
      console.error('更新产品失败:', error);
      toast(`更新失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除产品
  const handleDeleteProduct = async (productId: number) => {
    if (!await confirmDialog({ title: '确定要删除这个产品吗？此操作不可撤销。', destructive: true })) {
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (currentUserId) headers['x-user-id'] = currentUserId;
      const authHeaders = getClientAuthHeaders();
      Object.assign(headers, authHeaders);
      const response = await fetch(`/api/tables/products/${productId}`, {
        method: 'DELETE',
        headers,
      });

      const result = await response.json();

      if (result.success) {
        toast('产品删除成功！');
        // 刷新产品列表
        await loadProducts(currentPage, pageSize);
        // 刷新品牌列表
        await loadAllBrands();
      } else {
        toast(`删除失败：${result.error}`);
      }
    } catch (error) {
      console.error('删除产品失败:', error);
      toast(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 批量删除产品
  const handleBatchDelete = async () => {
    if (selectedProducts.size === 0) {
      toast('请先选择要删除的产品');
      return;
    }

    if (!await confirmDialog({ title: `确定要删除选中的 ${selectedProducts.size} 个产品吗？此操作不可撤销。`, destructive: true })) {
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUserId) headers['x-user-id'] = currentUserId;
      const authHeaders = getClientAuthHeaders();
      Object.assign(headers, authHeaders);
      const response = await fetch('/api/tables/products/batch-delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: Array.from(selectedProducts) }),
      });

      const result = await response.json();

      if (result.success) {
        toast(`✅ 成功删除 ${result.deletedCount} 个产品！`);
        setSelectedProducts(new Set());
        await loadProducts(currentPage, pageSize);
        // 刷新品牌列表
        await loadAllBrands();
      } else {
        toast(`删除失败：${result.error}`);
      }
    } catch (error) {
      console.error('批量删除产品失败:', error);
      toast(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 选择单个产品
  const handleSelectProduct = (productId: number) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  };

  // 判断是否全部选中
  const isAllSelected = filteredProducts.length > 0 && selectedProducts.size === filteredProducts.length;

  // 非管理员隐藏"选择"列（批量选择/批量删除仅管理员可用）
  const renderColumns = isAdmin ? visibleColumns : visibleColumns.filter((k) => k !== 'select');

  // 加载字段配置
  const loadFieldConfigs = async () => {
    try {
      const res = await fetch('/api/tables/products/field-configs');
      const data = await res.json();

      if (data.success && data.data) {
        const configs: Record<string, { label: string; required: boolean }> = {};
        data.data.forEach((config: any) => {
          configs[config.field_key] = {
            label: config.field_label,
            required: config.is_required,
          };
        });
        setFieldConfigs(configs);
      }
    } catch (error) {
      console.error('加载字段配置失败:', error);
      // 使用默认配置
      setFieldConfigs({
        name: { label: '产品名称', required: true },
        price: { label: '指导价', required: true },
      });
    }
  };

  useEffect(() => {
    loadProducts(1, pageSize);
    loadFieldConfigs();
  }, []);

  // #20260824-1840 三地同步：监听字段配置变更（管理后台或本端修改后），立即重载红 * 必填状态
  useFieldConfigChange(() => {
    loadFieldConfigs();
  });

  // 搜索产品（支持传入关键词覆盖当前输入框内容）
  const searchProducts = async (keywordOverride?: string) => {
    const kw = keywordOverride ?? searchTerm;

    if (!kw.trim()) {
      setCurrentPage(1);
      loadProducts(1, pageSize);
      return;
    }

    setLoading(true);
    setCurrentPage(1); // 搜索时重置到第一页
    try {
      const res = await fetch('/api/tables/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw }),
      });

      const data = await res.json();

      if (data.success) {
        setProducts(data.data || []);
        setTotalItems(data.data?.length || 0);
      } else {
        console.error('搜索失败:', data.error);
        // 如果API调用失败，使用本地搜索
        const filtered = mockProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(kw.toLowerCase()) ||
            p.model.toLowerCase().includes(kw.toLowerCase()) ||
            p.brand.toLowerCase().includes(kw.toLowerCase())
        );
        setProducts(filtered);
        setTotalItems(filtered.length);
      }
    } catch (error) {
      console.error('搜索失败:', error);
      // 如果网络错误，使用本地搜索
      const filtered = mockProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(kw.toLowerCase()) ||
          p.model.toLowerCase().includes(kw.toLowerCase()) ||
          p.brand.toLowerCase().includes(kw.toLowerCase())
      );
      setProducts(filtered);
      setTotalItems(filtered.length);
    } finally {
      setLoading(false);
    }
  };

  // 点击品牌标签：切换品牌快速筛选（再次点击取消筛选）
  const handleBrandClick = (brand: string) => {
    if (searchTerm.trim() === brand) {
      setSearchTerm('');
      setCurrentPage(1);
      loadProducts(1, pageSize);
    } else {
      setSearchTerm(brand);
      searchProducts(brand);
    }
  };

  // 导入
  const handleImportExcel = () => {
    // 判重预检 / 导入进行中禁止重新打开导入（同步贡献中心 #20260821-2100 禁用逻辑，#[20260822-1000]）
    if (importing) return;
    setShowUploadDialog(true);
  };

  const handleLocalFileUpload = (file: File) => {
    setImporting(true);

    try {
      // 检测文件类型
      const fileName = file.name.toLowerCase();
      const isCSV = fileName.endsWith('.csv');
      
      // 读取文件
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          let jsonData: any[] = [];
          
          if (isCSV) {
            // CSV 文件处理：检测编码并解析
            const buffer = evt.target?.result as ArrayBuffer;
            const detectedEncoding = detectEncoding(buffer);
            const text = decodeWithEncoding(buffer);

            // 手动解析CSV
            const parsedResult = parseCSV(text);

            // 关键修复：对列名进行修复
            if (parsedResult.headers && parsedResult.headers.length > 0) {
              const originalHeaders = [...parsedResult.headers];
              parsedResult.headers = parsedResult.headers.map(header => fixMojibake(header));
            }

            // 对数据也进行修复
            if (parsedResult.data && parsedResult.data.length > 0) {
              parsedResult.data = fixDataMojibake(parsedResult.data);
            }

            // 构造 jsonData 数组（与 Excel 格式一致）
            jsonData = parsedResult.data;

          } else {
            // Excel 文件处理：使用二进制读取，添加编码处理选项
            const data = new Uint8Array(evt.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { 
              type: 'array', 
              cellDates: true, 
              cellText: true,
              codepage: 65001, // UTF-8
              cellStyles: false,
              bookVBA: false
            });
            
            // 获取第一个工作表
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // 修复上标字符丢失问题（如 m³ → m）
            fixWorksheetSuperscript(worksheet);
            
            // 转换为JSON，使用 raw 选项获取格式化后的值
            jsonData = XLSX.utils.sheet_to_json(worksheet, { 
              defval: '', 
              raw: false,
              dateNF: 'yyyy-mm-dd',
              blankrows: false
            });
            
            // 尝试修复乱码
            jsonData = fixDataMojibake(jsonData);
          }

          // 获取表头
          const headers =
            jsonData.length > 0 ? Object.keys(jsonData[0] as Record<string, any>) : [];

          // 保存数据，显示字段映射对话框
          setPendingExcelData({ headers, data: jsonData });
          setShowFieldMapping(true);
          setImporting(false);

          // 清空文件输入
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (error) {
          console.error('解析文件失败:', error);
          toast(`❌ 解析文件失败：${error instanceof Error ? error.message : '未知错误'}`);
          setImporting(false);
        }
      };

      reader.onerror = () => {
        toast('❌ 读取文件失败');
        setImporting(false);
      };

      // 根据文件类型使用不同的读取方式
      if (isCSV) {
        // 读取为 ArrayBuffer 以便检测编码
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    } catch (error) {
      console.error('导入文件失败:', error);
      toast(`❌ 导入文件失败：${error instanceof Error ? error.message : '未知错误'}`);
      setImporting(false);
    }
  };

  // 检测文本编码并解码
  const decodeWithEncoding = (buffer: ArrayBuffer): string => {
    const uint8Array = new Uint8Array(buffer);
    
    // 尝试的编码列表（按优先级）
    const encodings = ['UTF-8', 'GBK', 'GB2312', 'BIG5', 'UTF-16LE', 'UTF-16BE'];
    
    for (const encoding of encodings) {
      try {
        const decoder = new TextDecoder(encoding, { fatal: true });
        const text = decoder.decode(buffer);
        
        // 检查解码后的文本是否有效
        if (isValidText(text)) {
          // 解码成功
          return text;
        }
      } catch (e) {
        // 该编码解码失败，尝试下一个
        continue;
      }
    }
    
    // 如果所有编码都失败，使用UTF-8的non-fatal模式
    console.warn('所有编码检测失败，使用UTF-8宽松模式');
    const decoder = new TextDecoder('UTF-8', { fatal: false });
    return decoder.decode(buffer);
  };
  
  // 检查文本是否有效（不包含过多乱码字符）
  const isValidText = (text: string): boolean => {
    if (!text || text.length === 0) return false;
    
    // 计算无效字符的比例
    let invalidCount = 0;
    const checkLength = Math.min(text.length, 1000);
    
    for (let i = 0; i < checkLength; i++) {
      const charCode = text.charCodeAt(i);
      
      // 检查是否是常见的无效字符
      if (charCode === 65533 || // 替换字符 (�)
          (charCode >= 0xDC00 && charCode <= 0xDFFF) || // 低代理项
          (charCode >= 0xD800 && charCode <= 0xDBFF)) { // 高代理项
        invalidCount++;
      }
    }
    
    // 如果无效字符比例超过5%，认为解码失败
    const invalidRatio = invalidCount / checkLength;
    return invalidRatio < 0.05;
  };

  // 检测文本编码（用于日志）
  const detectEncoding = (buffer: ArrayBuffer): string => {
    const uint8Array = new Uint8Array(buffer);
    
    // 检测 UTF-8 BOM
    if (uint8Array.length >= 3 && 
        uint8Array[0] === 0xEF && 
        uint8Array[1] === 0xBB && 
        uint8Array[2] === 0xBF) {
      return 'UTF-8 (BOM)';
    }
    
    // 检测 UTF-16 BE BOM
    if (uint8Array.length >= 2 && uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
      return 'UTF-16BE (BOM)';
    }
    
    // 检测 UTF-16 LE BOM
    if (uint8Array.length >= 2 && uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
      return 'UTF-16LE (BOM)';
    }
    
    return '未知编码（尝试自动检测）';
  };

  // 修复乱码字符 - 增强版
  // 处理 UTF-8 被错误解码为 Latin-1 (ISO-8859-1) 的情况
  // 同时处理多种可能的乱码模式
  const fixMojibake = (text: string): string => {
    if (!text || typeof text !== 'string') return text;

    // 如果已经是正常中文（包含常见中文字符范围），直接返回
    if (/[\u4e00-\u9fa5]/.test(text)) {
      return text;
    }

    let fixed = text;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        // 尝试将字符串按 Latin-1 编码转回字节，再用 UTF-8 解码
        // 这是最常见的乱码情况：UTF-8 字节被当作 Latin-1 解读
        const latin1Bytes = new Uint8Array(fixed.length);
        for (let i = 0; i < fixed.length; i++) {
          latin1Bytes[i] = fixed.charCodeAt(i) & 0xFF;
        }

        // 尝试用 UTF-8 解码
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const utf8Result = decoder.decode(latin1Bytes);

        // 检查解码后是否包含中文
        if (/[\u4e00-\u9fa5]/.test(utf8Result)) {
          // 如果包含中文且不是全是乱码，接受这个结果
          const mojibakeRatio = (utf8Result.match(/[Ãâ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/g) || []).length;
          const totalChars = utf8Result.length;

          // 如果乱码字符比例低于30%，认为是有效修复
          if (mojibakeRatio / totalChars < 0.3) {
            fixed = utf8Result;
            break;
          }
        }

        // 如果没有得到中文，尝试另一种常见的乱码模式
        // 尝试用 GBK 解码（但浏览器原生不支持，需要特殊处理）
        // 这里作为备选，继续尝试其他方法

      } catch (e) {
        console.warn('fixMojibake attempt failed:', e);
      }

      attempts++;

      // 如果没有进展，跳出循环
      if (fixed === text) break;
    }

    // 最后清理残留的乱码字符
    // 匹配 UTF-8 伪序列（高字节+后续字节），以及孤立的 Latin 扩展乱码首字节
    // 但保留合法字符：³²°µ×÷¼½¾±§¤¥¦©®«»¶·¸¹º¨¬¯等
    const validLatinChars = new Set(['×','÷','µ','°','²','³','¼','½','¾','±','§','¤','¥','¦','©','®','«','»','¶','·','¸','¹','º','¨','¬','¯','¡','¿']);
    return fixed.replace(
      /(?:[\u00C0-\u00FF][\u0080-\u00BF]{1,2})+|[\u00C0-\u00C6\u00C8-\u00CF\u00D0-\u00D6\u00D8-\u00DE\u00E0-\u00F6\u00F8-\u00FF]/g,
      (match) => (match.length === 1 && validLatinChars.has(match)) ? match : ''
    ).trim();
  };

  // 递归修复数据中的所有字符串乱码 - 增强版
  // 处理对象、数组和字符串
  const fixDataMojibake = (data: any): any => {
    if (Array.isArray(data)) {
      return data.map(item => fixDataMojibake(item));
    } else if (data && typeof data === 'object') {
      const result: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          // 修复键名和键值
          const fixedKey = fixMojibake(key);
          result[fixedKey] = fixDataMojibake(data[key]);
        }
      }
      return result;
    } else if (typeof data === 'string') {
      // 如果是字符串，进行深度修复
      let fixed = fixMojibake(data);

      // 针对特别长的文本，进行分段修复
      if (fixed.length > 100 && fixed.includes('Ã') && !/[\u4e00-\u9fa5]/.test(fixed)) {
        // 尝试更激进的修复：将字符串按字节重新解释
        try {
          const bytes = new Uint8Array(fixed.length);
          for (let i = 0; i < fixed.length; i++) {
            bytes[i] = fixed.charCodeAt(i) & 0xFF;
          }
          const alternative = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          if (/[\u4e00-\u9fa5]/.test(alternative)) {
            fixed = alternative;
          }
        } catch (e) {
          // 忽略错误
        }
      }

      return fixed;
    }
    return data;
  };

  // 手动解析CSV，避免XLSX库的编码问题
  const parseCSV = (csvText: string): { headers: string[]; data: any[] } => {
    if (!csvText) return { headers: [], data: [] };

    // 按行分割
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return { headers: [], data: [] };

    // 解析CSV行（处理引号内的逗号）
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          // 处理引号
          if (inQuotes && line[i + 1] === '"') {
            // 转义的引号
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // 逗号分隔符
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }

      result.push(current);
      return result;
    };

    // 第一行是标题
    const headers = parseCSVLine(lines[0]);

    // 解析数据行
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length && values.some(v => v.trim() !== '')) {
        const row: any = {};
        headers.forEach((header, index) => {
          // 这里不进行修复，后面统一修复
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }

    return { headers, data };
  };

  // 处理通过 file input 的文件选择（用于兼容旧功能）
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleLocalFileUpload(file);
  };

  // 处理网页链接上传
  const handleWebLinkUpload = (url: string, content: string) => {
    // 这里可以解析网页内容并提取产品信息
    toast(`网页链接上传功能开发中\n链接：${url}\n内容：${content.substring(0, 100)}...`);
  };

  // 处理网盘链接上传
  const handleCloudFileUpload = (
    url: string,
    fileName: string,
    description: string,
    extractCode: string
  ) => {
    // 保存网盘链接信息
    toast(
      `网盘链接已保存\n链接：${url}\n文件名：${fileName}\n文件说明：${description}\n提取码：${extractCode}`
    );
  };

  // 处理网盘文件上传（带文件）
  const handleCloudFileWithFile = async (
    url: string,
    fileName: string,
    description: string,
    extractCode: string,
    file: File
  ) => {
    // 解析并导入文件到产品价格库
    setImporting(true);

    try {
      // 检测文件类型
      const fileLowerName = file.name.toLowerCase();
      const isCSV = fileLowerName.endsWith('.csv');
      
      let headers: string[] = [];
      let importData: any[] = [];
      
      if (isCSV) {
        // CSV 文件处理：检测编码并解析
        const buffer = await file.arrayBuffer();
        const detectedEncoding = detectEncoding(buffer);
        const text = decodeWithEncoding(buffer);

        // 手动解析CSV
        const parsedResult = parseCSV(text);

        // 关键修复：对列名进行修复
        if (parsedResult.headers && parsedResult.headers.length > 0) {
          const originalHeaders = [...parsedResult.headers];
          parsedResult.headers = parsedResult.headers.map(header => fixMojibake(header));
        }

        // 对数据也进行修复
        if (parsedResult.data && parsedResult.data.length > 0) {
          parsedResult.data = fixDataMojibake(parsedResult.data);
        }

        // 使用修复后的headers和data
        headers = parsedResult.headers;
        importData = parsedResult.data;
      } else {
        // Excel 文件处理：使用二进制读取，添加编码处理选项
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { 
          type: 'array', 
          cellDates: true, 
          cellText: true,
          codepage: 65001, // UTF-8
          cellStyles: false,
          bookVBA: false
        });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 修复上标字符丢失问题（如 m³ → m）
        fixWorksheetSuperscript(worksheet);

        // 使用 sheet_to_json 转换数据，使用 raw 选项获取格式化后的值
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          defval: '', 
          raw: false,
          dateNF: 'yyyy-mm-dd',
          blankrows: false
        });
        
        if (jsonData.length > 0) {
          // 尝试修复乱码
          const fixedData = fixDataMojibake(jsonData);
          headers = Object.keys(fixedData[0] as Record<string, any>);
          importData = fixedData;
        }
      }

      // 设置待处理的文件数据
      setPendingExcelData({ headers, data: importData });
      setShowFieldMapping(true);
      setShowUploadDialog(false);

      toast(
        `✅ 文件解析成功！\n\n检测到 ${importData.length} 条数据\n请完成字段映射后导入到产品价格库。`
      );
    } catch (error) {
      console.error('解析网盘文件失败:', error);
      toast(`❌ 文件解析失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setImporting(false);
    }
  };

  // 确认字段映射并导入：先预检重复（dryRun），有重复则弹窗让用户选择「跳过 / 覆盖」（#20260820-1130-5）
  const handleConfirmMapping = async (mapping: Record<string, string>) => {
    if (!pendingExcelData || importing) return;

    setImporting(true);
    setShowFieldMapping(false);

    // 判重预检进行中：显示进度提示（同步贡献中心上传价格表 #20260821-2100 逻辑，#[20260822-1000]）
    setImportProgress({
      show: true,
      current: 0,
      total: 0,
      successCount: 0,
      errorCount: 0,
      duplicateCount: 0,
      status: 'prechecking',
      message: PRODUCT_TEXT.importProgress.prechecking,
    });

    // 第一步：预检重复（dryRun，只读不写）
    try {
      const precheckHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUserId) precheckHeaders['x-user-id'] = currentUserId;
      const authHeaders = getClientAuthHeaders();
      Object.assign(precheckHeaders, authHeaders);
      const precheckRes = await fetch('/api/tables/products/import', {
        method: 'POST',
        headers: precheckHeaders,
        body: JSON.stringify({
          products: pendingExcelData.data,
          fieldMapping: mapping,
          dryRun: true,
        }),
      });
      const precheck = await precheckRes.json();

      const dupCount = precheck?.success ? precheck.duplicateCount || 0 : 0;
      const dupProducts = Array.isArray(precheck?.duplicateProducts) ? precheck.duplicateProducts : [];

      if (dupCount > 0 && dupProducts.length > 0) {
        // 有重复 → 关闭预检进度弹窗，弹窗让用户选择「跳过 / 覆盖更新」，暂不导入（#20260820-1130-5）
        setImportProgress(null);
        pendingImportMappingRef.current = mapping;
        setDuplicateChoice({
          show: true,
          count: dupCount,
          duplicateProducts: dupProducts,
          reason: '',
          mode: 'view',
          submitting: false,
        });
        return;
      }
    } catch (error) {
      console.error('重复预检失败，继续直接导入:', error);
    }

    // 第二步：无重复（或预检失败）→ 直接导入
    await runImport(mapping, 'skip', '');
  };

  // 分批导入（mode: skip 跳过重复 | overwrite 覆盖重复提交审批，#20260820-1130-5）
  const runImport = async (mapping: Record<string, string>, mode: 'skip' | 'overwrite', reason: string) => {
    if (!pendingExcelData) return;

    const totalProducts = pendingExcelData.data.length;
    const batchSize = 50; // 每批处理50条

    // 覆盖模式下生成同一批次 source_id，便于管理端按批次汇总审批（#[20260822-1000]-1）
    const importBatchId = mode === 'overwrite' ? crypto.randomUUID() : undefined;
    const requesterName = user?.name || user?.email || '';

    setImporting(true);

    // 初始化进度显示（#[20260822-1000]-4 记录模式，用于文案/标签区分）
    setImportProgress({
      show: true,
      current: 0,
      total: totalProducts,
      successCount: 0,
      errorCount: 0,
      duplicateCount: 0,
      status: 'importing',
      message: PRODUCT_TEXT.importProgress.preparing,
      mode,
    });

    try {
      let totalSuccessCount = 0;
      let totalErrorCount = 0;
      let totalDuplicateCount = 0;
      const allErrors: string[] = [];
      const allDuplicateProducts: any[] = [];

      // 分批导入
      for (let i = 0; i < totalProducts; i += batchSize) {
        const batch = pendingExcelData.data.slice(i, i + batchSize);
        const batchEnd = Math.min(i + batchSize, totalProducts);

        setImportProgress(prev => prev ? {
          ...prev,
          current: batchEnd,
          message: PRODUCT_TEXT.importProgress.importing(batchEnd, totalProducts),
        } : null);

        const importHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (currentUserId) importHeaders['x-user-id'] = currentUserId;
        const authHeaders = getClientAuthHeaders();
        Object.assign(importHeaders, authHeaders);
        const response = await fetch('/api/tables/products/import', {
          method: 'POST',
          headers: importHeaders,
          body: JSON.stringify({
            products: batch,
            fieldMapping: mapping,
            mode,
            ...(reason ? { reason } : {}),
            ...(importBatchId ? { sourceId: importBatchId } : {}),
            requesterName,
          }),
        });

        const result = await response.json();

        if (result.success) {
          totalSuccessCount += result.successCount || 0;
          totalErrorCount += result.errorCount || 0;
          totalDuplicateCount += result.duplicateCount || 0;
          // #[20260822-1000]-4 覆盖模式下后端把重复产品计为 pendingOverwriteCount，需同步到前端统计
          if (mode === 'overwrite' && result.pendingOverwriteCount) {
            totalDuplicateCount += result.pendingOverwriteCount;
          }

          if (result.errors) {
            allErrors.push(...result.errors);
          }
          if (result.duplicateProducts) {
            allDuplicateProducts.push(...result.duplicateProducts);
          }
        }

        // 更新进度
        setImportProgress(prev => prev ? {
          ...prev,
          successCount: totalSuccessCount,
          errorCount: totalErrorCount,
          duplicateCount: totalDuplicateCount,
        } : null);
      }

      // 导入完成（#[20260822-1000]-4 按实际结果生成文案，避免「成功 0 条」的违和感）
      const duplicateMsg = totalDuplicateCount > 0
        ? PRODUCT_TEXT.importProgress.skipped(totalDuplicateCount)
        : '';
      const errorMsg = totalErrorCount > 0
        ? PRODUCT_TEXT.importProgress.failed(totalErrorCount)
        : '';

      let completedMessage: string;
      if (totalSuccessCount === 0 && totalDuplicateCount === 0 && totalErrorCount === 0) {
        completedMessage = PRODUCT_TEXT.importProgress.completedEmpty;
      } else if (totalSuccessCount === 0 && totalErrorCount === 0 && totalDuplicateCount > 0) {
        completedMessage = PRODUCT_TEXT.importProgress.completedAllDuplicate(totalDuplicateCount, mode);
      } else if (totalSuccessCount === 0 && totalErrorCount > 0 && totalDuplicateCount === 0) {
        completedMessage = PRODUCT_TEXT.importProgress.completedAllFailed(totalErrorCount);
      } else {
        completedMessage = PRODUCT_TEXT.importProgress.completed(totalSuccessCount, `${duplicateMsg}${errorMsg}`);
      }

      const pendingApprovalCount = mode === 'overwrite' ? totalDuplicateCount : 0;
      setImportProgress(prev => prev ? {
        ...prev,
        status: 'completed',
        message: completedMessage,
        errors: allErrors.length > 0 ? allErrors : undefined,
        duplicateProducts: allDuplicateProducts.length > 0 ? allDuplicateProducts : undefined,
        pendingApprovalCount,
      } : null);

      // 刷新产品列表
      await loadProducts(1, pageSize);

      // 刷新品牌列表
      await loadAllBrands();
    } catch (error) {
      console.error('导入产品失败:', error);
      setImportProgress(prev => prev ? {
        ...prev,
        status: 'error',
        message: PRODUCT_TEXT.importProgress.failedWithError(
          error instanceof Error ? error.message : PRODUCT_TEXT.importProgress.unknownError
        ),
      } : null);
    } finally {
      setImporting(false);
      setPendingExcelData(null);
    }
  };

  // 关闭导入进度对话框
  const closeImportProgress = () => {
    setImportProgress(null);
    setImportDetailDialog(null);
  };

  // 取消导入
  const handleCancelMapping = () => {
    setShowFieldMapping(false);
    setPendingExcelData(null);
  };

  // 重复处理：跳过重复，仅导入新产品（#20260820-1130-5）
  const handleSkipImport = () => {
    const mapping = pendingImportMappingRef.current;
    if (!mapping) { setDuplicateChoice(null); return; }
    setDuplicateChoice(null);
    if (pendingExcelData) runImport(mapping, 'skip', '');
  };

  // 重复处理：覆盖重复，填写原因后提交审批并导入（#20260820-1130-5）
  const handleOverwriteImport = () => {
    if (!duplicateChoice || duplicateChoice.submitting) return;
    if (!duplicateChoice.reason.trim()) {
      toast(PRODUCT_TEXT.importDuplicate.reasonRequiredToast);
      return;
    }
    const mapping = pendingImportMappingRef.current;
    if (!mapping) { setDuplicateChoice(null); return; }
    const reason = duplicateChoice.reason.trim();
    setDuplicateChoice(null);
    if (pendingExcelData) runImport(mapping, 'overwrite', reason);
  };

  // 手动添加产品
  const handleAddProduct = async () => {
    // 根据字段配置验证必填字段（非管理员不可填写敏感字段，需排除）
    const sensitiveKeys = ['supplier', 'contact_person', 'contact_phone', 'cost_price', 'min_price'];
    const requiredFields = Object.entries(fieldConfigs)
      .filter(([_, config]) => config.required)
      .filter(([key]) => isAdmin || !sensitiveKeys.includes(key))
      .map(([key, config]) => ({ key, label: config.label }));

    const missingFields = requiredFields.filter(
      (field) => !newProduct[field.key as keyof typeof newProduct]
    );

    if (missingFields.length > 0) {
      toast(`请填写必填字段：${missingFields.map((f) => f.label).join('、')}`);
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUserId) headers['x-user-id'] = currentUserId;
      const authHeaders = getClientAuthHeaders();
      Object.assign(headers, authHeaders);
      const response = await fetch('/api/tables/products/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          products: [
            {
              产品名称: newProduct.name,
              型号: newProduct.model,
              品牌: newProduct.brand,
              参数描述: newProduct.parameter_description,
              单位: newProduct.unit,
              价格: newProduct.price,
              供应商: newProduct.supplier,
              联系人: newProduct.contact_person,
              联系电话: newProduct.contact_phone,
              成本: newProduct.cost_price,
              最低售价: newProduct.min_price,
            },
          ],
        }),
      });

      const result = await response.json();

      if (result.success) {
        if (result.duplicateCount > 0) {
          toast(`⚠️ 产品已存在！\n\n该产品（名称、型号、品牌相同）已在库中，无需重复添加。`);
        } else {
          toast('✅ 产品添加成功！');
        }
        setNewProduct({
          name: '',
          model: '',
          brand: '',
          category: '',
          parameter_description: '',
          unit: '',
          cost_price: '',
          min_price: '',
          price: '',
          supplier: '',
          contact_person: '',
          contact_phone: '',
        });
        setShowAddForm(false);
        // 刷新产品列表
        await loadProducts(1, pageSize);
        // 刷新品牌列表
        await loadAllBrands();
      } else {
        toast(`添加失败：${result.error}`);
      }
    } catch (error) {
      console.error('添加产品失败:', error);
      toast(`添加失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 下载模板（按管理员设置的字段必填配置动态生成；非管理员隐藏敏感字段）
  const handleDownloadTemplate = async () => {
    try {
      // 拉取字段配置（必填设置由管理员在「字段配置」中维护）
      let templateFieldConfigs: { field_key: string; field_label: string; is_required: boolean }[] = [];
      try {
        const headers: Record<string, string> = {};
        if (currentUserId) headers['x-user-id'] = currentUserId;
        const authHeaders = getClientAuthHeaders();
        Object.assign(headers, authHeaders);
        const res = await fetch('/api/tables/products/field-configs', { headers });
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          templateFieldConfigs = data.data;
        }
      } catch {
        // 拉取失败则使用默认配置
      }
      const configMap = new Map(templateFieldConfigs.map((c) => [c.field_key, c]));

      // 按 SYSTEM_FIELDS 顺序构建模板列，必填字段标注「（必填）」
      // 所有用户下载的模板都包含全部 14 个字段，仅按字段配置决定必填标记
      const columns = SYSTEM_FIELDS.map(
        (f) => {
          const cfg = configMap.get(f.key);
          return {
            key: f.key,
            label: cfg?.field_label || f.label,
            required: cfg ? cfg.is_required : f.required,
            sampleValues: f.sampleValues,
          };
        }
      );

      // 示例数据（两行）
      const sampleRows = [
        {
          name: '工业提升泵',
          model: 'CR5-12',
          brand: '格兰富',
          category: '泵类',
          parameter_description: '流量12m³/h，扬程30m',
          supplier: '格兰富中国',
          contact_person: '张三',
          contact_phone: '13800138000',
          unit: '台',
          cost_price: 2800,
          min_price: 3000,
          price: 3200,
          image_url: '',
          stock: 10,
        },
        {
          name: '搅拌罐',
          model: '2.5m³',
          brand: '通用',
          category: '罐类',
          parameter_description: '不锈钢材质，配搅拌器',
          supplier: '通用机械',
          contact_person: '李四',
          contact_phone: '13900139000',
          unit: '台',
          cost_price: 13000,
          min_price: 14000,
          price: 14500,
          image_url: '',
          stock: 5,
        },
      ];

      // CSV 转义
      const escapeCsv = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = columns.map((c) => (c.required ? `${c.label}（必填）` : c.label));
      const csvContent = [
        headers.join(','),
        ...sampleRows.map((row) =>
          columns.map((c) => escapeCsv((row as Record<string, unknown>)[c.key])).join(',')
        ),
      ].join('\n');

      // 创建Blob并下载
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', '产品价格库导入模板.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('生成导入模板失败:', error);
      toast('导入模板生成失败，请稍后重试');
    }
  };

  // 导出产品为 Excel 格式
  const handleExportExcel = (
    exportSelectedOnly: boolean = false,
    filterConfig?: { brands?: Set<string>; keyword?: string }
  ) => {
    try {
      // 确定要导出的产品数据
      let productsToExport = exportSelectedOnly
        ? products.filter((p) => selectedProducts.has(p.id))
        : products;

      // 应用类别筛选
      if (filterConfig) {
        if (filterConfig.brands && filterConfig.brands.size > 0) {
          productsToExport = productsToExport.filter((p) => filterConfig.brands!.has(p.brand));
        }
        if (filterConfig.keyword) {
          const keyword = filterConfig.keyword.toLowerCase().trim();
          if (keyword) {
            productsToExport = productsToExport.filter(
              (p) =>
                (p.name || '').toLowerCase().includes(keyword) ||
                (p.model || '').toLowerCase().includes(keyword) ||
                (p.brand || '').toLowerCase().includes(keyword)
            );
          }
        }
      }

      if (productsToExport.length === 0) {
        toast(exportSelectedOnly ? '请先选择要导出的产品' : '没有可导出的产品数据');
        return;
      }

      // 转换数据格式（与导入模板字段保持一致；非管理员导出隐藏敏感字段）
      const includeSensitive = isAdmin;
      const exportData = productsToExport.map((p) => {
        const row: Record<string, unknown> = {
          产品名称: p.name || '',
          规格型号: p.model || '',
          品牌: p.brand || '',
          参数描述: p.parameter_description || '',
        };
        if (includeSensitive) {
          row['供应商'] = p.supplier || '';
          row['联系人'] = p.contact_person || '';
          row['联系电话'] = p.contact_phone || '';
        }
        row['单位'] = p.unit || '';
        if (includeSensitive) {
          row['成本'] = p.cost_price || 0;
          row['最低售价'] = p.min_price || 0;
        }
        row['指导价'] = p.price || 0;
        return row;
      });

      // 创建工作簿和工作表
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // 设置列宽
      const colWidths = [
        { wch: 20 }, // 产品名称
        { wch: 15 }, // 规格型号
        { wch: 12 }, // 品牌
        { wch: 30 }, // 参数描述
        ...(includeSensitive ? [{ wch: 20 }, { wch: 10 }, { wch: 15 }] : []), // 供应商/联系人/联系电话
        { wch: 8 }, // 单位
        ...(includeSensitive ? [{ wch: 10 }, { wch: 10 }] : []), // 成本/最低售价
        { wch: 10 }, // 指导价
      ];
      worksheet['!cols'] = colWidths;

      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(workbook, worksheet, '产品价格库');

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10);
      const filterSuffix =
        (filterConfig?.brands?.size || 0) > 0 || filterConfig?.keyword ? '_筛选' : '';
      const filename = exportSelectedOnly
        ? `产品价格库_选中${selectedProducts.size}条${filterSuffix}_${timestamp}.xlsx`
        : `产品价格库_全部${products.length}条${filterSuffix}_${timestamp}.xlsx`;

      // 下载文件
      XLSX.writeFile(workbook, filename);

      toast(`✅ 成功导出 ${productsToExport.length} 条产品数据！`);
      setShowExportFilter(false);
    } catch (error) {
      console.error('导出Excel失败:', error);
      toast(`❌ 导出Excel失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 导出产品为 CSV 格式
  const handleExportCSV = (
    exportSelectedOnly: boolean = false,
    filterConfig?: { brands?: Set<string>; keyword?: string }
  ) => {
    try {
      // 确定要导出的产品数据
      let productsToExport = exportSelectedOnly
        ? products.filter((p) => selectedProducts.has(p.id))
        : products;

      // 应用类别筛选
      if (filterConfig) {
        if (filterConfig.brands && filterConfig.brands.size > 0) {
          productsToExport = productsToExport.filter((p) => filterConfig.brands!.has(p.brand));
        }
        if (filterConfig.keyword) {
          const keyword = filterConfig.keyword.toLowerCase().trim();
          if (keyword) {
            productsToExport = productsToExport.filter(
              (p) =>
                (p.name || '').toLowerCase().includes(keyword) ||
                (p.model || '').toLowerCase().includes(keyword) ||
                (p.brand || '').toLowerCase().includes(keyword)
            );
          }
        }
      }

      if (productsToExport.length === 0) {
        toast(exportSelectedOnly ? '请先选择要导出的产品' : '没有可导出的产品数据');
        return;
      }

      // 定义CSV列顺序和字段映射（非管理员导出隐藏敏感字段）
      const includeSensitive = isAdmin;
      const csvHeaders = [
        '产品名称',
        '规格型号',
        '品牌',
        '参数描述',
        ...(includeSensitive ? ['供应商', '联系人', '联系电话'] : []),
        '单位',
        ...(includeSensitive ? ['成本', '最低售价'] : []),
        '指导价',
      ];

      const fieldMapping = {
        产品名称: 'name',
        规格型号: 'model',
        品牌: 'brand',
        参数描述: 'parameter_description',
        供应商: 'supplier',
        联系人: 'contact_person',
        联系电话: 'contact_phone',
        单位: 'unit',
        成本: 'cost_price',
        最低售价: 'min_price',
        指导价: 'price',
      } as const;

      // 转换数据为CSV格式
      const rows = [csvHeaders.join(',')];

      productsToExport.forEach((p) => {
        const row = csvHeaders.map((header) => {
          const fieldKey = fieldMapping[header as keyof typeof fieldMapping] as keyof typeof p;
          let value = p[fieldKey] !== undefined && p[fieldKey] !== null ? String(p[fieldKey]) : '';

          // 处理包含逗号或引号的字段
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value.replace(/"/g, '""')}"`;
          }

          return value;
        });
        rows.push(row.join(','));
      });

      // 生成CSV内容
      const csvContent = '\ufeff' + rows.join('\n');

      // 创建Blob并下载
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10);
      const filterSuffix =
        (filterConfig?.brands?.size || 0) > 0 || filterConfig?.keyword ? '_筛选' : '';
      const filename = exportSelectedOnly
        ? `产品价格库_选中${selectedProducts.size}条${filterSuffix}_${timestamp}.csv`
        : `产品价格库_全部${products.length}条${filterSuffix}_${timestamp}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast(`✅ 成功导出 ${productsToExport.length} 条产品数据！`);
      setShowExportFilter(false);
    } catch (error) {
      console.error('导出CSV失败:', error);
      toast(`❌ 导出CSV失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleSaveColumnConfig = (columns: string[]) => {
    // 确保 select 在第一列，operations 在最后一列
    const selectCol = 'select';
    const operationsCol = 'operations';

    // 过滤出中间列（非 select 和 operations）
    const middleColumns = columns.filter(col => col !== selectCol && col !== operationsCol);

    // 组装：select + 中间列 + operations
    const columnsWithFixed = [selectCol, ...middleColumns, operationsCol];

    // 保存列配置到 localStorage
    localStorage.setItem('price-library-columns', JSON.stringify(columnsWithFixed));

    setVisibleColumns(columnsWithFixed);
    setShowColumnConfig(false);
    toast('✅ 列配置已保存！');
  };

  // 拖拽处理函数
  const handleDragStart = (e: React.DragEvent, columnKey: string) => {
    setDraggedColumn(columnKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetKey) return;

    // 获取当前可见列的顺序
    const currentOrder = [...visibleColumns];
    const draggedIndex = currentOrder.indexOf(draggedColumn);
    const targetIndex = currentOrder.indexOf(targetKey);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // 确保不违反固定列规则
    const selectCol = 'select';
    const operationsCol = 'operations';

    // 不能拖拽到 select 之前（select 始终在第一列）
    if (targetKey === selectCol) {
      return;
    }

    // 不能拖拽到 operations 之后（operations 始终在最后一列）
    if (targetKey === operationsCol) {
      return;
    }

    // 移动列
    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColumn);

    setVisibleColumns(newOrder);
    setDraggedColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* 工具栏 */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-sm">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            产品价格库
          </h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* 导入按钮组 */}
          <div className="relative" onMouseLeave={() => handleMenuMouseLeave('import')}>
            <button
              onClick={() => setShowImportMenu(!showImportMenu)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
            >
              <span>📤</span> 导入
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showImportMenu && (
              <div
                className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10 min-w-[160px]"
                onMouseEnter={() => handleMenuMouseEnter('import')}
              >
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    handleImportExcel();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 first:rounded-t-lg"
                >
                  📤 导入
                </button>
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    handleDownloadTemplate();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  📥 下载模板
                </button>
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    window.open('/diagnostics/import', '_blank');
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 last:rounded-b-lg"
                >
                  🔍 导入诊断
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
          >
            <span>➕</span> 手动添加
          </button>

          {/* 导出按钮组（仅管理员） */}
          {isAdmin && (
          <div className="relative" onMouseLeave={() => handleMenuMouseLeave('export')}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={products.length === 0}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>📊</span> 导出
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showExportMenu && (
              <div
                className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10 min-w-[160px]"
                onMouseEnter={() => handleMenuMouseEnter('export')}
              >
                {selectedProducts.size > 0 && (
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleExportExcel(true);
                    }}
                    disabled={filteredProducts.length === 0}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 first:rounded-t-lg bg-blue-50 dark:bg-blue-900/20"
                  >
                    ✅ 导出选中项 ({selectedProducts.size})
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    handleExportExcel(false);
                  }}
                  disabled={filteredProducts.length === 0}
                  className={`w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 ${selectedProducts.size === 0 ? 'first:rounded-t-lg' : ''}`}
                >
                  📊 导出全部数据
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    const allBrands = new Set(products.map((p) => p.brand).filter(Boolean));
                    setExportFilterBrands(allBrands);
                    setExportFilterKeywords('');
                    setShowExportFilter(true);
                  }}
                  disabled={products.length === 0}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  🔍 高级导出
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    handleExportCSV(false);
                  }}
                  disabled={products.length === 0}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 last:rounded-b-lg"
                >
                  📄 导出全部CSV
                </button>
              </div>
            )}
          </div>
          )}

          {/* 配置按钮组（仅管理员） */}
          {isAdmin && (
          <div className="relative" onMouseLeave={() => handleMenuMouseLeave('config')}>
            <button
              onClick={() => setShowConfigMenu(!showConfigMenu)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
            >
              <span>⚙️</span> 配置
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showConfigMenu && (
              <div
                className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10 min-w-[160px]"
                onMouseEnter={() => handleMenuMouseEnter('config')}
              >
                <button
                  onClick={() => {
                    setShowConfigMenu(false);
                    setShowColumnConfig(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 first:rounded-t-lg"
                >
                  ⚙️ 列配置
                </button>
                <button
                  onClick={() => {
                    setShowConfigMenu(false);
                    setShowFieldConfig(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 last:rounded-b-lg"
                >
                  📋 字段配置
                </button>
              </div>
            )}
          </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadProducts(currentPage, pageSize)}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '刷新中...' : '刷新'}
          </Button>
        </div>
      </div>

      {/* 添加产品表单 */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">手动添加产品</h4>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                产品名称{' '}
                {fieldConfigs.name?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                规格/型号 {fieldConfigs.model?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.model}
                onChange={(e) => setNewProduct({ ...newProduct, model: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入规格/型号"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                品牌 {fieldConfigs.brand?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.brand}
                onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入品牌"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                单位 {fieldConfigs.unit?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.unit}
                onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入单位（如：台、个）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                指导价 {fieldConfigs.price?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="number"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入指导价"
                min="0"
                step="0.01"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  供应商 {fieldConfigs.supplier?.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={newProduct.supplier}
                  onChange={(e) => setNewProduct({ ...newProduct, supplier: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入供应商"
                />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                参数描述{' '}
                {fieldConfigs.parameter_description?.required && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <input
                type="text"
                value={newProduct.parameter_description}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, parameter_description: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品参数描述"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  联系人{' '}
                  {fieldConfigs.contact_person?.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={newProduct.contact_person}
                  onChange={(e) => setNewProduct({ ...newProduct, contact_person: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入联系人"
                />
              </div>
            )}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  联系电话{' '}
                  {fieldConfigs.contact_phone?.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={newProduct.contact_phone}
                  onChange={(e) => setNewProduct({ ...newProduct, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入联系电话"
                />
              </div>
            )}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  成本 {fieldConfigs.cost_price?.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  value={newProduct.cost_price}
                  onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入成本价格"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  最低售价{' '}
                  {fieldConfigs.min_price?.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  value={newProduct.min_price}
                  onChange={(e) => setNewProduct({ ...newProduct, min_price: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入最低售价"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddProduct}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              添加产品
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 编辑产品表单 */}
      {showEditForm && editingProduct && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">编辑产品</h4>
            <button
              onClick={() => {
                setShowEditForm(false);
                setEditingProduct(null);
              }}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                产品名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editingProduct.name || ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                型号
              </label>
              <input
                type="text"
                value={editingProduct.model || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, model: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入型号"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                品牌
              </label>
              <input
                type="text"
                value={editingProduct.brand || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入品牌"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                单位
              </label>
              <input
                type="text"
                value={editingProduct.unit || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入单位（如：台、个）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                分类
              </label>
              <input
                type="text"
                value={editingProduct.category || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入分类（如：传感器、PLC）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                指导价 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={editingProduct.price || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入指导价"
                min="0"
                step="0.01"
              />
            </div>
            {(isAdmin || editingProduct._isOwner) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  供应商
                </label>
                <input
                  type="text"
                  value={editingProduct.supplier || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, supplier: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入供应商"
                />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                参数描述
              </label>
              <input
                type="text"
                value={editingProduct.parameter_description || ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, parameter_description: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品参数描述"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                图片URL
              </label>
              <input
                type="text"
                value={editingProduct.image_url || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, image_url: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品图片地址（可选）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                库存
              </label>
              <input
                type="number"
                value={editingProduct.stock || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入库存数量"
                min="0"
                step="1"
              />
            </div>
            {(isAdmin || editingProduct._isOwner) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  联系人
                </label>
                <input
                  type="text"
                  value={editingProduct.contact_person || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, contact_person: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入联系人"
                />
              </div>
            )}
            {(isAdmin || editingProduct._isOwner) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  联系电话
                </label>
                <input
                  type="text"
                  value={editingProduct.contact_phone || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, contact_phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入联系电话"
                />
              </div>
            )}
            {(isAdmin || editingProduct._isOwner) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  成本
                </label>
                <input
                  type="number"
                  value={editingProduct.cost_price || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, cost_price: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入成本价格"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
            {(isAdmin || editingProduct._isOwner) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  最低售价
                </label>
                <input
                  type="number"
                  value={editingProduct.min_price || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, min_price: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  placeholder="输入最低售价"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
          </div>
          {/* 非管理员编辑需填写修改原因（提交管理员审核，#20260820-1130-2） */}
          {!isAdmin && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                修改原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="请说明修改原因，提交后将由管理员审核，审核通过后才会生效"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                提交后不会立即生效，需管理员审核通过后才会更新产品数据。
              </p>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleUpdateProduct}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isAdmin ? '更新产品' : '提交修改申请'}
            </button>
            <button
              onClick={() => {
                setShowEditForm(false);
                setEditingProduct(null);
              }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索产品名称、规格型号、品牌、参数描述..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchProducts()}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>
        <Button
          onClick={() => searchProducts()}
          disabled={loading}
          className="px-6"
        >
          {loading ? '搜索中...' : '搜索'}
        </Button>
      </div>

      {/* 品牌快捷标签：实时展示产品库中的品牌，点击可快速筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
          <Tags className="h-3.5 w-3.5" />
          品牌
        </span>
        {allBrands.length > 0 ? (
          allBrands.map((brand) => {
            const isActive = searchTerm.trim() === brand;
            return (
              <button
                key={brand}
                onClick={() => handleBrandClick(brand)}
                title={isActive ? `取消「${brand}」品牌筛选` : `筛选品牌「${brand}」`}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {brand}
              </button>
            );
          })
        ) : (
          <span className="text-xs text-slate-400">暂无品牌数据</span>
        )}
      </div>

      {/* 主布局：左侧分类树 + 右侧产品列表 */}
      <div className="grid lg:grid-cols-5 gap-5">
        {/* 左侧分类树 */}
        <div className="lg:col-span-1">
          <div className="bg-transparent dark:bg-transparent rounded-lg border-0 p-0 sticky top-4">
            <CategoryTree
              products={products}
              onCategorySelect={setSelectedCategoryId}
              selectedCategoryId={selectedCategoryId}
              compact
            />
          </div>
        </div>

        {/* 右侧产品列表 */}
        <div className="lg:col-span-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 p-4 rounded-xl border border-blue-200/70 dark:border-blue-800/70 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">总产品数</div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {totalItems}
                  </div>
                </div>
                <div className="p-2 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 p-4 rounded-xl border border-green-200/70 dark:border-green-800/70 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">品牌数量</div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {(() => {
                      // 如果有搜索词，使用当前显示的产品计算品牌数
                      if (searchTerm.trim()) {
                        return new Set(filteredProducts.map((p) => p.brand).filter(Boolean)).size;
                      }
                      // 否则使用所有产品的品牌数
                      return allBrands.length > 0 ? allBrands.length : 0;
                    })()}
                  </div>
                </div>
                <div className="p-2 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
                  <Tags className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>
          </div>

          {/* 批量操作栏（仅管理员） */}
          {isAdmin && selectedProducts.size > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  已选择 <strong>{selectedProducts.size}</strong> 个产品
                </span>
              </div>
              <div className="flex gap-2">
            <button
              onClick={() => handleExportExcel(true)}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-sm"
              title="导出选中的产品"
            >
              <span>📊</span> 导出数据
            </button>
            <button
              onClick={() => handleExportCSV(true)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 text-sm"
              title="导出选中的产品为 CSV 文件"
            >
              <span>📄</span> 导出CSV
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm"
            >
              <span>🗑️</span> 批量删除
            </button>
              </div>
            </div>
          )}

          {/* 数据表格 */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                {renderColumns
                  .map((colKey) => availableColumns.find((col) => col.key === colKey))
                  .filter((col): col is NonNullable<typeof col> => col !== undefined)
                  .map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 ${
                        col.key === 'select'
                          ? 'w-12 text-center'
                          : col.key === 'operations'
                            ? 'text-center'
                            : col.key === 'price'
                              ? 'text-right'
                              : 'text-left'
                      }`}
                    >
                      {col.key === 'select' ? (
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="全选"
                        />
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      暂无数据，请导入文件或手动添加
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      {renderColumns
                        .map((colKey) => availableColumns.find((col) => col.key === colKey))
                        .filter((col): col is NonNullable<typeof col> => col !== undefined)
                        .map((col) => {
                          if (col.key === 'select') {
                            return (
                              <td key={col.key} className="px-4 py-2.5 w-12 text-center">
                                <Checkbox
                                  checked={selectedProducts.has(p.id)}
                                  onCheckedChange={() => handleSelectProduct(p.id)}
                                  aria-label={`选择产品 ${p.name}`}
                                />
                              </td>
                            );
                          }
                          if (col.key === 'operations') {
                            const canEditOwn = !isAdmin && p.creator_id && p.creator_id === currentUserId;
                            return (
                              <td key={col.key} className="px-4 py-2.5 text-center">
                                {isAdmin || canEditOwn ? (
                                  <button
                                    onClick={() => handleEditProduct(p)}
                                    className="text-blue-600 hover:text-blue-800 text-xs mr-3 transition-colors"
                                  >
                                    编辑
                                  </button>
                                ) : null}
                                {isAdmin ? (
                                  <button
                                    onClick={() => handleDeleteProduct(p.id)}
                                    className="text-red-600 hover:text-red-800 text-xs transition-colors"
                                  >
                                    删除
                                  </button>
                                ) : null}
                                {!isAdmin && !canEditOwn && (
                                  <span className="text-xs text-gray-400">只读</span>
                                )}
                              </td>
                            );
                          }
                          if (col.key === 'price') {
                            return (
                              <td
                                key={col.key}
                                className="px-4 py-2.5 text-right text-slate-900 dark:text-slate-100 font-medium"
                              >
                                ¥{(p[col.key as keyof typeof p] as number)?.toFixed(2) || '-'}
                              </td>
                            );
                          }
                          if (col.key === 'parameter_description') {
                            return (
                              <td
                                key={col.key}
                                className="px-4 py-2.5 text-slate-600 dark:text-slate-400 max-w-[200px] truncate"
                              >
                                {p[col.key as keyof typeof p] as string}
                              </td>
                            );
                          }
                          if (col.key === 'name') {
                            const isOwn = !isAdmin && p.creator_id && p.creator_id === currentUserId;
                            return (
                              <td
                                key={col.key}
                                className="px-4 py-2.5 text-slate-900 dark:text-slate-100 font-medium"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  {(p[col.key as keyof typeof p] as string) || '-'}
                                  {isOwn && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-[10px] font-medium whitespace-nowrap">
                                      已审核通过
                                    </span>
                                  )}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td
                              key={col.key}
                              className="px-4 py-2.5 text-slate-600 dark:text-slate-400"
                            >
                              {(p[col.key as keyof typeof p] as string) || '-'}
                            </td>
                          );
                        })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* 分页控件 */}
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 px-1">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              共 <span className="font-semibold text-slate-900 dark:text-slate-100">{totalItems}</span> 条记录，
              当前第 <span className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</span> /{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{Math.ceil(totalItems / pageSize) || 1}</span> 页，
              每页
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                  loadProducts(1, Number(e.target.value));
                }}
                className="mx-2 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              条
            </div>

            <div className="flex items-center gap-1">
              <Button
                onClick={() => loadProducts(1, pageSize)}
                disabled={currentPage === 1 || loading}
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="首页"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => loadProducts(currentPage - 1, pageSize)}
                disabled={currentPage === 1 || loading}
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="mx-2 text-sm text-slate-600 dark:text-slate-400 min-w-[80px] text-center">
                第 <span className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</span> /{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{Math.ceil(totalItems / pageSize) || 1}</span> 页
              </span>

              <Button
                onClick={() => loadProducts(currentPage + 1, pageSize)}
                disabled={currentPage >= Math.ceil(totalItems / pageSize) || loading}
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => loadProducts(Math.ceil(totalItems / pageSize), pageSize)}
                disabled={currentPage >= Math.ceil(totalItems / pageSize) || loading}
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="末页"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        </div>
        </div>

      {/* 字段配置管理 */}
      {showFieldConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <FieldConfigManager
            onClose={async () => {
              setShowFieldConfig(false);
              // 重新加载字段配置
              await loadFieldConfigs();
            }}
          />
        </div>
      )}

      {/* 字段映射对话框 */}
      {showFieldMapping && pendingExcelData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <ImportFieldMapping
            excelHeaders={pendingExcelData.headers}
            excelData={pendingExcelData.data}
            onConfirm={handleConfirmMapping}
            onCancel={handleCancelMapping}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {/* 导入进度对话框（#[20260822-1000]-3 增强动态进度与审批提醒） */}
      {importProgress?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              {importProgress.status === 'prechecking'
                ? PRODUCT_TEXT.importProgress.precheckingTitle
                : '产品导入进度'}
            </h3>

            {/* 完成/错误时的状态图标与主文案 */}
            {importProgress.status === 'completed' && (
              <div className="flex flex-col items-center mb-4">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-base font-medium text-green-700 dark:text-green-300 text-center">
                  导入完成
                </p>
              </div>
            )}
            {importProgress.status === 'error' && (
              <div className="flex flex-col items-center mb-4">
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-2">
                  <Info className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-base font-medium text-red-700 dark:text-red-300 text-center">
                  导入失败
                </p>
              </div>
            )}

            {/* 进度条 */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
                <span>{importProgress.message}</span>
                {/* 判重预检阶段不展示 0/0（无虚假数据），仅提示进行中 */}
                {importProgress.status !== 'prechecking' && importProgress.total > 0 && (
                  <span>{importProgress.current}/{importProgress.total}</span>
                )}
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-300 relative ${
                    importProgress.status === 'completed'
                      ? 'bg-green-500'
                      : importProgress.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                  } ${importProgress.status === 'importing' || importProgress.status === 'prechecking' ? 'animate-pulse' : ''}`}
                  style={{
                    width: `${
                      importProgress.status === 'prechecking'
                        ? precheckProgress
                        : importProgress.total > 0
                          ? Math.round((importProgress.current / importProgress.total) * 100)
                          : 0
                    }%`,
                  }}
                >
                  {importProgress.status === 'importing' && (
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.5) 8px, rgba(255,255,255,0.5) 16px)',
                        backgroundSize: '22px 22px',
                      }}
                    />
                  )}
                </div>
              </div>
              {importProgress.status !== 'prechecking' && importProgress.total > 0 && (
                <div className="text-right text-xs text-slate-500 mt-1">
                  {Math.round((importProgress.current / importProgress.total) * 100)}%
                </div>
              )}
            </div>

            {/* 统计信息（判重预检阶段隐藏，避免展示 0/0/0 的虚假统计） */}
            {importProgress.status !== 'prechecking' && (
              <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400 transition-all duration-200">
                    {importProgress.successCount}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">成功</div>
                </div>
                <div
                  className={`bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-3 ${
                    importProgress.duplicateCount > 0 && importProgress.duplicateProducts
                      ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400 transition-all'
                      : ''
                  }`}
                  onClick={() => {
                    if (importProgress.duplicateCount > 0 && importProgress.duplicateProducts) {
                      setImportDetailDialog({
                        show: true,
                        type: 'duplicates',
                        title: `${importProgress.mode === 'overwrite' ? '覆盖申请' : '重复跳过'}产品 (${importProgress.duplicateCount} 条)`,
                      });
                    }
                  }}
                  title={importProgress.duplicateCount > 0 ? '点击查看详情' : ''}
                >
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 transition-all duration-200">
                    {importProgress.duplicateCount}
                    {importProgress.duplicateCount > 0 && importProgress.duplicateProducts && (
                      <span className="text-xs ml-1">📋</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {importProgress.mode === 'overwrite' ? '覆盖申请' : '重复跳过'}
                    {importProgress.duplicateCount > 0 && importProgress.duplicateProducts && (
                      <span className="text-yellow-600"> (可点击)</span>
                    )}
                  </div>
                </div>
                <div
                  className={`bg-red-50 dark:bg-red-900/30 rounded-lg p-3 ${
                    importProgress.errorCount > 0 && importProgress.errors
                      ? 'cursor-pointer hover:ring-2 hover:ring-red-400 transition-all'
                      : ''
                  }`}
                  onClick={() => {
                    if (importProgress.errorCount > 0 && importProgress.errors) {
                      setImportDetailDialog({
                        show: true,
                        type: 'errors',
                        title: `导入失败产品 (${importProgress.errorCount} 条)`,
                      });
                    }
                  }}
                  title={importProgress.errorCount > 0 ? '点击查看详情' : ''}
                >
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400 transition-all duration-200">
                    {importProgress.errorCount}
                    {importProgress.errorCount > 0 && importProgress.errors && (
                      <span className="text-xs ml-1">📋</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    失败
                    {importProgress.errorCount > 0 && importProgress.errors && (
                      <span className="text-red-600"> (可点击)</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 覆盖更新已进入审批提醒（#[20260822-1000]-3） */}
            {importProgress.status === 'completed' &&
              (importProgress.pendingApprovalCount || 0) > 0 && (
                <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg p-3 mb-4">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {PRODUCT_TEXT.importProgress.completedWithApproval(importProgress.pendingApprovalCount || 0)}
                  </p>
                </div>
              )}

            {/* 关闭按钮 - 仅在完成或错误时显示（判重预检进行中也不显示） */}
            {importProgress.status !== 'importing' && importProgress.status !== 'prechecking' && (
              <div className="flex justify-end">
                <Button
                  onClick={closeImportProgress}
                  variant={importProgress.status === 'error' ? 'destructive' : 'default'}
                >
                  关闭
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 导入详情弹窗 */}
      {importDetailDialog?.show && importProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {importDetailDialog.title}
              </h3>
              <button
                onClick={() => setImportDetailDialog(null)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xl"
              >
                ✕
              </button>
            </div>
            
            {/* 详情列表 */}
            <div className="p-4 overflow-y-auto flex-1">
              {importDetailDialog.type === 'errors' && importProgress.errors && (
                <div className="space-y-2">
                  {importProgress.errors.map((error, index) => (
                    <div 
                      key={index}
                      className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 font-bold text-sm">#{index + 1}</span>
                        <p className="text-sm text-slate-700 dark:text-slate-300 flex-1">{error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {importDetailDialog.type === 'duplicates' && importProgress.duplicateProducts && (
                <div className="space-y-3">
                  {importProgress.duplicateProducts.map((item, index) => (
                    <div 
                      key={index}
                      className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
                    >
                      <div className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                        #{index + 1} 重复产品
                      </div>
                      
                      {/* 尝试导入的产品 */}
                      <div className="mb-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">尝试导入的产品：</div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2 text-sm">
                          <div><span className="font-medium">名称：</span>{item.attempted?.name || '-'}</div>
                          {item.attempted?.model && <div><span className="font-medium">型号：</span>{item.attempted.model}</div>}
                          {item.attempted?.brand && <div><span className="font-medium">品牌：</span>{item.attempted.brand}</div>}
                          {item.attempted?.parameter_description && (
                            <div><span className="font-medium">参数：</span>{item.attempted.parameter_description}</div>
                          )}
                        </div>
                      </div>
                      
                      {/* 已存在的产品 */}
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">数据库中已存在：</div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2 text-sm">
                          <div><span className="font-medium">名称：</span>{item.existing?.name || '-'}</div>
                          {item.existing?.model && <div><span className="font-medium">型号：</span>{item.existing.model}</div>}
                          {item.existing?.brand && <div><span className="font-medium">品牌：</span>{item.existing.brand}</div>}
                          {item.existing?.parameter_description && (
                            <div><span className="font-medium">参数：</span>{item.existing.parameter_description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 无数据提示 */}
              {importDetailDialog.type === 'errors' && (!importProgress.errors || importProgress.errors.length === 0) && (
                <div className="text-center text-slate-500 py-8">暂无错误信息</div>
              )}
              {importDetailDialog.type === 'duplicates' && (!importProgress.duplicateProducts || importProgress.duplicateProducts.length === 0) && (
                <div className="text-center text-slate-500 py-8">暂无重复产品</div>
              )}
            </div>
            
            {/* 底部按钮 */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end flex-shrink-0">
              <Button onClick={() => setImportDetailDialog(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 导入重复处理弹窗（跳过 / 覆盖更新，#20260820-1130-2） */}
      {duplicateChoice?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[65]">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {PRODUCT_TEXT.importDuplicate.title}
              </h3>
              <button
                onClick={() => !duplicateChoice.submitting && setDuplicateChoice(null)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                {PRODUCT_TEXT.importDuplicate.priceLibraryDetectedPrefix}{' '}
                <span className="font-bold text-yellow-600">{duplicateChoice.count}</span>{' '}
                {PRODUCT_TEXT.importDuplicate.priceLibraryDetectedSuffix}
              </p>
              {duplicateChoice.mode === 'view' ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {PRODUCT_TEXT.importDuplicate.skipDescription}
                </p>
              ) : (
                <>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {PRODUCT_TEXT.importDuplicate.reasonLabel}{' '}
                    <span className="text-red-500">
                      {PRODUCT_TEXT.importDuplicate.reasonRequiredMark}
                    </span>
                  </label>
                  <textarea
                    value={duplicateChoice.reason}
                    onChange={(e) =>
                      setDuplicateChoice({ ...duplicateChoice, reason: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    placeholder={PRODUCT_TEXT.importDuplicate.reasonPlaceholder}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {PRODUCT_TEXT.importDuplicate.reasonHint}
                  </p>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex gap-2">
              {duplicateChoice.mode === 'overwrite' ? (
                <>
                  <button
                    onClick={handleOverwriteImport}
                    disabled={duplicateChoice.submitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {duplicateChoice.submitting
                      ? PRODUCT_TEXT.importDuplicate.submitting
                      : PRODUCT_TEXT.importDuplicate.submitOverwriteButton}
                  </button>
                  <button
                    onClick={() => setDuplicateChoice(null)}
                    disabled={duplicateChoice.submitting}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    {PRODUCT_TEXT.importDuplicate.cancelButton}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSkipImport}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    {PRODUCT_TEXT.importDuplicate.skipButton}
                  </button>
                  <button
                    onClick={() =>
                      setDuplicateChoice({ ...duplicateChoice, mode: 'overwrite', reason: '' })
                    }
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {PRODUCT_TEXT.importDuplicate.overwriteButton}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 列配置对话框 */}
      {showColumnConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                配置表格显示列
              </h3>
              <button
                onClick={() => setShowColumnConfig(false)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <p className="text-xs text-slate-500 mb-4">
                拖拽可调整列顺序，点击可切换显示/隐藏
                <br />
                <span className="text-blue-600">注："选择"始终在第一列，"操作"始终在最后一列</span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {visibleColumns.map((colKey) => {
                  const col = availableColumns.find(c => c.key === colKey);
                  if (!col) return null;
                  return (
                    <div
                      key={col.key}
                      draggable={!col.fixed}
                      onDragStart={(e) => handleDragStart(e, col.key)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, col.key)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 p-3 border rounded-lg transition-all ${
                        col.fixed
                          ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 cursor-move'
                      } ${!col.fixed ? 'border-blue-300 dark:border-blue-700' : ''} ${
                        draggedColumn === col.key ? 'opacity-50 scale-95' : ''
                      }`}
                    >
                      {!col.fixed && (
                        <span className="text-slate-400 cursor-grab">☰</span>
                      )}
                      <Checkbox
                        checked={true}
                        disabled={col.fixed}
                        onCheckedChange={() => {
                          if (!col.fixed) {
                            const newVisible = visibleColumns.filter(key => key !== col.key);
                            setVisibleColumns(newVisible);
                          }
                        }}
                        aria-label={col.label}
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{col.label}</span>
                      {col.key === 'select' && (
                        <span className="text-xs text-blue-600 ml-auto">(始终第一)</span>
                      )}
                      {col.key === 'operations' && (
                        <span className="text-xs text-blue-600 ml-auto">(始终最后)</span>
                      )}
                      {col.fixed && col.key !== 'select' && col.key !== 'operations' && (
                        <span className="text-xs text-slate-500 ml-auto">(必选)</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-2">可添加的列：</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableColumns
                    .filter(col => !visibleColumns.includes(col.key))
                    .map(col => (
                      <div
                        key={col.key}
                        onClick={() => {
                          const newVisible = [...visibleColumns, col.key];
                          setVisibleColumns(newVisible);
                        }}
                        className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <Checkbox checked={false} />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{col.label}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  // 恢复默认配置
                  const selectCol = 'select';
                  const operationsCol = 'operations';

                  // 过滤出中间列（非 select 和 operations）
                  const middleColumns = availableColumns
                    .filter(col => col.defaultVisible && col.key !== selectCol && col.key !== operationsCol)
                    .map(col => col.key);

                  // 组装：select + 中间列 + operations
                  const defaultColumns = [selectCol, ...middleColumns, operationsCol];
                  setVisibleColumns(defaultColumns);
                  localStorage.setItem('price-library-columns', JSON.stringify(defaultColumns));
                }}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors text-sm"
              >
                恢复默认
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowColumnConfig(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveColumnConfig(visibleColumns);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  保存配置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 导出筛选对话框 */}
      {showExportFilter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                🔍 高级导出 - 按类别筛选
              </h3>
              <button
                onClick={() => setShowExportFilter(false)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* 品牌筛选 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  按品牌筛选
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      const allBrands = new Set(products.map((p) => p.brand).filter(Boolean));
                      setExportFilterBrands(allBrands);
                    }}
                    className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-sm"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => setExportFilterBrands(new Set())}
                    className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-sm"
                  >
                    清空
                  </button>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {Array.from(new Set(products.map((p) => p.brand).filter(Boolean)))
                    .sort((a, b) => a.localeCompare(b))
                    .map((brand) => (
                      <button
                        key={brand}
                        onClick={() => {
                          const newBrands = new Set(exportFilterBrands);
                          if (newBrands.has(brand)) {
                            newBrands.delete(brand);
                          } else {
                            newBrands.add(brand);
                          }
                          setExportFilterBrands(newBrands);
                        }}
                        className={`px-3 py-2 rounded text-sm transition-colors ${
                          exportFilterBrands.has(brand)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {brand}
                      </button>
                    ))}
                </div>
              </div>

              {/* 关键词筛选 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  按关键词筛选（产品名称、型号、品牌）
                </label>
                <input
                  type="text"
                  placeholder="输入关键词，如：泵、阀、管..."
                  value={exportFilterKeywords}
                  onChange={(e) => setExportFilterKeywords(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  输入关键词后，导出的产品将包含匹配该关键词的产品
                </p>
              </div>

              {/* 预览筛选结果 */}
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-medium mb-2">筛选预览：</p>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">总产品：</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {products.length} 个
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">筛选后：</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {
                          products.filter((p) => {
                            const brandMatch =
                              exportFilterBrands.size === 0 || exportFilterBrands.has(p.brand);
                            const keywordMatch =
                              !exportFilterKeywords.trim() ||
                              p.name
                                ?.toLowerCase()
                                .includes(exportFilterKeywords.toLowerCase()) ||
                              p.model?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                              p.brand?.toLowerCase().includes(exportFilterKeywords.toLowerCase());
                            return brandMatch && keywordMatch;
                          }).length
                        }{' '}
                        个
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowExportFilter(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const filterConfig = {
                    brands: exportFilterBrands,
                    keyword: exportFilterKeywords,
                  };
                  setPendingFilterConfig(filterConfig);
                  setShowExportFilter(false);
                  setShowExportFormatDialog(true);
                }}
                disabled={
                  products.filter((p) => {
                    const brandMatch =
                      exportFilterBrands.size === 0 || exportFilterBrands.has(p.brand);
                    const keywordMatch =
                      !exportFilterKeywords.trim() ||
                      p.name?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                      p.model?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                      p.brand?.toLowerCase().includes(exportFilterKeywords.toLowerCase());
                    return brandMatch && keywordMatch;
                  }).length === 0
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步：选择格式
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出格式选择对话框 */}
      {showExportFormatDialog && pendingFilterConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                📊 选择导出格式
              </h3>
              <button
                onClick={() => {
                  setShowExportFormatDialog(false);
                  setPendingFilterConfig(null);
                }}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-6">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-medium mb-2">即将导出：</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {
                      products.filter((p) => {
                        const brandMatch =
                          !pendingFilterConfig.brands ||
                          pendingFilterConfig.brands.size === 0 ||
                          pendingFilterConfig.brands.has(p.brand);
                        const keywordMatch =
                          !pendingFilterConfig.keyword ||
                          !pendingFilterConfig.keyword.trim() ||
                          p.name
                            ?.toLowerCase()
                            .includes(pendingFilterConfig.keyword.toLowerCase()) ||
                          p.model
                            ?.toLowerCase()
                            .includes(pendingFilterConfig.keyword.toLowerCase()) ||
                          p.brand
                            ?.toLowerCase()
                            .includes(pendingFilterConfig.keyword.toLowerCase());
                        return brandMatch && keywordMatch;
                      }).length
                    }
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">条产品数据</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">请选择导出格式：</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    handleExportExcel(false, pendingFilterConfig);
                    setShowExportFormatDialog(false);
                    setPendingFilterConfig(null);
                  }}
                  className="flex flex-col items-center gap-3 p-6 bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
                >
                  <span className="text-4xl">📊</span>
                  <div className="text-center">
                    <div className="font-bold text-green-700 dark:text-green-300">Excel</div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      .xlsx 格式
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    handleExportCSV(false, pendingFilterConfig);
                    setShowExportFormatDialog(false);
                    setPendingFilterConfig(null);
                  }}
                  className="flex flex-col items-center gap-3 p-6 bg-teal-50 dark:bg-teal-950/20 border-2 border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-950/30 transition-colors"
                >
                  <span className="text-4xl">📄</span>
                  <div className="text-center">
                    <div className="font-bold text-teal-700 dark:text-teal-300">CSV</div>
                    <div className="text-xs text-teal-600 dark:text-teal-400 mt-1">.csv 格式</div>
                  </div>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowExportFormatDialog(false);
                  setPendingFilterConfig(null);
                }}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 多渠道上传对话框 */}
      {showUploadDialog && (
        <MultiUploadDialog
          onClose={() => setShowUploadDialog(false)}
          onLocalFileUpload={handleLocalFileUpload}
          onWebLinkUpload={handleWebLinkUpload}
          onCloudFileUpload={handleCloudFileUpload}
          onCloudFileWithFile={handleCloudFileWithFile}
          moduleType="document"
          uploading={importing}
        />
      )}
    </div>
  );
}
