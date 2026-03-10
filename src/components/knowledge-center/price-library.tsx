'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import ImportFieldMapping from './import-field-mapping';
import FieldConfigManager from './field-config-manager';
import MultiUploadDialog from './multi-upload-dialog';

export default function PriceLibrary() {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
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

  // 下拉菜单 refs 和 timers
  const importMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const configMenuRef = useRef<HTMLDivElement>(null);
  const importMenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exportMenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const configMenuTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [pendingExcelData, setPendingExcelData] = useState<{ headers: string[]; data: any[] } | null>(null);
  const [pendingFilterConfig, setPendingFilterConfig] = useState<{ brands?: Set<string>, keyword?: string } | null>(null);
  const [fieldConfigs, setFieldConfigs] = useState<Record<string, { label: string; required: boolean }>>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'select', 'product_name', 'model', 'brand', 'specifications',
    'unit', 'price', 'supplier', 'operations'
  ]));
  const [exportFilterBrands, setExportFilterBrands] = useState<Set<string>>(new Set());
  const [exportFilterKeywords, setExportFilterKeywords] = useState<string>('');
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    model: '',
    brand: '',
    specifications: '',
    unit: '',
    cost_price: '',
    min_price: '',
    price: '',
    supplier: '',
    contact_person: '',
    contact_phone: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 可用的列配置
  const availableColumns = [
    { key: 'select', label: '选择', fixed: true },
    { key: 'product_name', label: '产品名称', defaultVisible: true },
    { key: 'model', label: '规格型号', defaultVisible: true },
    { key: 'brand', label: '品牌', defaultVisible: true },
    { key: 'specifications', label: '参数描述', defaultVisible: true },
    { key: 'unit', label: '单位', defaultVisible: true },
    { key: 'price', label: '指导价', defaultVisible: true },
    { key: 'cost_price', label: '成本', defaultVisible: false },
    { key: 'min_price', label: '最低售价', defaultVisible: false },
    { key: 'supplier', label: '供应商', defaultVisible: true },
    { key: 'contact_person', label: '联系人', defaultVisible: false },
    { key: 'contact_phone', label: '联系电话', defaultVisible: false },
    { key: 'operations', label: '操作', fixed: true },
  ];

  // 从 localStorage 加载列配置
  useEffect(() => {
    const savedColumns = localStorage.getItem('price-library-columns');
    if (savedColumns) {
      try {
        const parsed = JSON.parse(savedColumns);
        // 确保所有 fixed 列都包含在配置中
        const fixedColumns = availableColumns
          .filter(col => col.fixed)
          .map(col => col.key);
        const columnsWithFixed = [...new Set([...fixedColumns, ...parsed])];
        setVisibleColumns(new Set(columnsWithFixed));
      } catch (e) {
        console.error('加载列配置失败:', e);
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

  // 模拟产品数据
  const mockProducts = [
    { product_name: '工业提升泵', model: 'CR5-12', brand: '格兰富', specifications: '流量12m³/h，扬程30m', unit: '台', price: 3200, supplier: '格兰富中国' },
    { product_name: '搅拌罐', model: '2.5m³', brand: '通用', specifications: '不锈钢材质，配搅拌器', unit: '台', price: 14500, supplier: '通用机械' },
    { product_name: '板框压滤机', model: 'XMYZ100/800-U', brand: '景津', specifications: '过滤面积100m²', unit: '台', price: 88000, supplier: '景津环保' },
    { product_name: '一体化污水泵站', model: 'WZ-100', brand: '威尔克', specifications: '处理量100m³/h', unit: '套', price: 156000, supplier: '威尔克环境' },
    { product_name: '曝气机', model: 'QXB-3', brand: '诸城清泉', specifications: '功率3kW', unit: '台', price: 4500, supplier: '诸城清泉' },
    { product_name: '加药装置', model: 'JY-200', brand: '绿洁', specifications: '药箱容量200L', unit: '套', price: 8800, supplier: '绿洁环保' },
    { product_name: '气浮机', model: 'QF-20', brand: '绿洁', specifications: '处理量20m³/h', unit: '台', price: 28000, supplier: '绿洁环保' },
    { product_name: '刮泥机', brand: '通用', model: 'XNG-10', specifications: '池径10m', unit: '台', price: 42000, supplier: '通用机械' },
  ];

  // 加载产品列表
  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tables/products/list');
      const data = await res.json();

      if (data.success) {
        setProducts(data.data || []);
      } else {
        console.error('加载产品列表失败:', data.error);
        // 如果API调用失败，使用模拟数据
        setProducts(mockProducts);
      }
    } catch (error) {
      console.error('加载产品列表失败:', error);
      // 如果网络错误，使用模拟数据
      setProducts(mockProducts);
    } finally {
      setLoading(false);
    }
  };

  // 编辑产品
  const handleEditProduct = async (product: any) => {
    setEditingProduct(product);
    setShowEditForm(true);
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editingProduct.product_name || !editingProduct.price) {
      alert('请至少填写产品名称和价格');
      return;
    }

    try {
      const response = await fetch(`/api/tables/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProduct)
      });

      const result = await response.json();

      if (result.success) {
        alert('产品更新成功！');
        setShowEditForm(false);
        setEditingProduct(null);
        // 刷新产品列表
        await loadProducts();
      } else {
        alert(`更新失败：${result.error}`);
      }
    } catch (error) {
      console.error('更新产品失败:', error);
      alert(`更新失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除产品
  const handleDeleteProduct = async (productId: number) => {
    if (!confirm('确定要删除这个产品吗？此操作不可撤销。')) {
      return;
    }

    try {
      const response = await fetch(`/api/tables/products/${productId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        alert('产品删除成功！');
        // 刷新产品列表
        await loadProducts();
      } else {
        alert(`删除失败：${result.error}`);
      }
    } catch (error) {
      console.error('删除产品失败:', error);
      alert(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 批量删除产品
  const handleBatchDelete = async () => {
    if (selectedProducts.size === 0) {
      alert('请先选择要删除的产品');
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedProducts.size} 个产品吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const response = await fetch('/api/tables/products/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedProducts) })
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ 成功删除 ${result.deletedCount} 个产品！`);
        setSelectedProducts(new Set());
        await loadProducts();
      } else {
        alert(`删除失败：${result.error}`);
      }
    } catch (error) {
      console.error('批量删除产品失败:', error);
      alert(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 选择单个产品
  const handleSelectProduct = (productId: number) => {
    setSelectedProducts(prev => {
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
      setSelectedProducts(new Set(products.map(p => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  };

  // 判断是否全部选中
  const isAllSelected = products.length > 0 && selectedProducts.size === products.length;

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
            required: config.is_required
          };
        });
        setFieldConfigs(configs);
      }
    } catch (error) {
      console.error('加载字段配置失败:', error);
      // 使用默认配置
      setFieldConfigs({
        product_name: { label: '产品名称', required: true },
        price: { label: '指导价', required: true }
      });
    }
  };

  useEffect(() => {
    loadProducts();
    loadFieldConfigs();
  }, []);

  // 搜索产品
  const searchProducts = async () => {
    if (!searchTerm.trim()) {
      loadProducts();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tables/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: searchTerm })
      });

      const data = await res.json();

      if (data.success) {
        setProducts(data.data || []);
      } else {
        console.error('搜索失败:', data.error);
        // 如果API调用失败，使用本地搜索
        const filtered = mockProducts.filter(p =>
          p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setProducts(filtered);
      }
    } catch (error) {
      console.error('搜索失败:', error);
      // 如果网络错误，使用本地搜索
      const filtered = mockProducts.filter(p =>
        p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setProducts(filtered);
    } finally {
      setLoading(false);
    }
  };

  // 导入Excel
  const handleImportExcel = () => {
    setShowUploadDialog(true);
  };

  const handleLocalFileUpload = (file: File) => {
    setImporting(true);

    try {
      // 读取Excel文件
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });

          // 获取第一个工作表
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // 转换为JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          console.log('解析到的Excel数据:', jsonData);

          // 获取Excel表头
          const headers = jsonData.length > 0 ? Object.keys(jsonData[0] as Record<string, any>) : [];

          // 保存数据，显示字段映射对话框
          setPendingExcelData({ headers, data: jsonData });
          setShowFieldMapping(true);
          setImporting(false);

          // 清空文件输入
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (error) {
          console.error('解析Excel失败:', error);
          alert(`❌ 解析Excel文件失败：${error instanceof Error ? error.message : '未知错误'}`);
          setImporting(false);
        }
      };

      reader.onerror = () => {
        alert('❌ 读取文件失败');
        setImporting(false);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('导入Excel失败:', error);
      alert(`❌ 导入Excel失败：${error instanceof Error ? error.message : '未知错误'}`);
      setImporting(false);
    }
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
    alert(`网页链接上传功能开发中\n链接：${url}\n内容：${content.substring(0, 100)}...`);
  };

  // 处理网盘链接上传
  const handleCloudFileUpload = (url: string, fileName: string, description: string, extractCode: string) => {
    // 保存网盘链接信息
    alert(`网盘链接已保存\n链接：${url}\n文件名：${fileName}\n文件说明：${description}\n提取码：${extractCode}`);
  };

  // 处理网盘文件上传（带文件）
  const handleCloudFileWithFile = async (url: string, fileName: string, description: string, extractCode: string, file: File) => {
    // 解析并导入文件到产品价格库
    setImporting(true);

    try {
      // 读取文件
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const headers: string[] = [];
      const importData: any[] = [];

      // 读取第一行作为表头
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
        const cell = worksheet[cellAddress];
        headers.push(cell?.v || '');
      }

      // 读取数据行（从第二行开始）
      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        const row: any = {};
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (cell) {
            row[headers[C]] = cell.v;
          }
        }
        if (Object.keys(row).length > 0) {
          importData.push(row);
        }
      }

      // 设置待处理的 Excel 数据
      setPendingExcelData({ headers, data: importData });
      setShowFieldMapping(true);
      setShowUploadDialog(false);

      alert(`✅ 文件解析成功！\n\n检测到 ${importData.length} 条数据\n请完成字段映射后导入到产品价格库。`);
    } catch (error) {
      console.error('解析网盘文件失败:', error);
      alert(`❌ 文件解析失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setImporting(false);
    }
  };

  // 确认字段映射并导入
  const handleConfirmMapping = async (mapping: Record<string, string>) => {
    if (!pendingExcelData) return;

    setImporting(true);
    setShowFieldMapping(false);

    try {
      const response = await fetch('/api/tables/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: pendingExcelData.data,
          fieldMapping: mapping
        })
      });

      const result = await response.json();

      if (result.success) {
        const duplicateMsg = result.duplicateCount > 0 ? `\n跳过 ${result.duplicateCount} 条重复产品` : '';
        const errorMsg = result.errorCount > 0 ? `\n失败 ${result.errorCount} 条` : '';

        alert(`✅ 导入成功！\n\n成功导入 ${result.successCount} 条产品数据${duplicateMsg}${errorMsg}`);

        // 刷新产品列表
        await loadProducts();

        // 显示错误详情（如果有）
        if (result.errors && result.errors.length > 0) {
          console.log('导入错误:', result.errors);
        }
      } else {
        alert(`❌ 导入失败：${result.error}`);
      }
    } catch (error) {
      console.error('导入产品失败:', error);
      alert(`❌ 导入产品失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setImporting(false);
      setPendingExcelData(null);
    }
  };

  // 取消导入
  const handleCancelMapping = () => {
    setShowFieldMapping(false);
    setPendingExcelData(null);
  };

  // 手动添加产品
  const handleAddProduct = async () => {
    // 根据字段配置验证必填字段
    const requiredFields = Object.entries(fieldConfigs)
      .filter(([_, config]) => config.required)
      .map(([key, config]) => ({ key, label: config.label }));

    const missingFields = requiredFields.filter(field => !newProduct[field.key as keyof typeof newProduct]);

    if (missingFields.length > 0) {
      alert(`请填写必填字段：${missingFields.map(f => f.label).join('、')}`);
      return;
    }

    try {
      const response = await fetch('/api/tables/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{
            '产品名称': newProduct.product_name,
            '型号': newProduct.model,
            '品牌': newProduct.brand,
            '规格': newProduct.specifications,
            '单位': newProduct.unit,
            '价格': newProduct.price,
            '供应商': newProduct.supplier,
            '联系人': newProduct.contact_person,
            '联系电话': newProduct.contact_phone,
            '成本': newProduct.cost_price,
            '最低售价': newProduct.min_price
          }]
        })
      });

      const result = await response.json();

      if (result.success) {
        if (result.duplicateCount > 0) {
          alert(`⚠️ 产品已存在！\n\n该产品（名称、型号、品牌相同）已在库中，无需重复添加。`);
        } else {
          alert('✅ 产品添加成功！');
        }
        setNewProduct({
          product_name: '',
          model: '',
          brand: '',
          specifications: '',
          unit: '',
          cost_price: '',
          min_price: '',
          price: '',
          supplier: '',
          contact_person: '',
          contact_phone: ''
        });
        setShowAddForm(false);
        // 刷新产品列表
        await loadProducts();
      } else {
        alert(`添加失败：${result.error}`);
      }
    } catch (error) {
      console.error('添加产品失败:', error);
      alert(`添加失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 下载模板
  const handleDownloadTemplate = () => {
    // 创建示例数据（包含所有字段）
    const templateData = [
      {
        '产品名称': '工业提升泵',
        '规格型号': 'CR5-12',
        '品牌': '格兰富',
        '参数描述': '流量12m³/h，扬程30m',
        '供应商': '格兰富中国',
        '联系人': '张三',
        '联系电话': '13800138000',
        '单位': '台',
        '成本': 2800,
        '最低售价': 3000,
        '指导价': 3200
      },
      {
        '产品名称': '搅拌罐',
        '规格型号': '2.5m³',
        '品牌': '通用',
        '参数描述': '不锈钢材质，配搅拌器',
        '供应商': '通用机械',
        '联系人': '李四',
        '联系电话': '13900139000',
        '单位': '台',
        '成本': 13000,
        '最低售价': 14000,
        '指导价': 14500
      }
    ];

    // 创建CSV内容
    const headers = Object.keys(templateData[0]);
    const csvContent = [
      headers.join(','),
      ...templateData.map(row => headers.map(header => row[header as keyof typeof row]).join(','))
    ].join('\n');

    // 创建Blob并下载
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', '产品价格库模板.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 导出产品为 Excel 格式
  const handleExportExcel = (exportSelectedOnly: boolean = false, filterConfig?: { brands?: Set<string>, keyword?: string }) => {
    try {
      // 确定要导出的产品数据
      let productsToExport = exportSelectedOnly 
        ? products.filter(p => selectedProducts.has(p.id))
        : products;

      // 应用类别筛选
      if (filterConfig) {
        if (filterConfig.brands && filterConfig.brands.size > 0) {
          productsToExport = productsToExport.filter(p => filterConfig.brands!.has(p.brand));
        }
        if (filterConfig.keyword) {
          const keyword = filterConfig.keyword.toLowerCase().trim();
          if (keyword) {
            productsToExport = productsToExport.filter(p =>
              (p.product_name || '').toLowerCase().includes(keyword) ||
              (p.model || '').toLowerCase().includes(keyword) ||
              (p.brand || '').toLowerCase().includes(keyword)
            );
          }
        }
      }

      if (productsToExport.length === 0) {
        alert(exportSelectedOnly ? '请先选择要导出的产品' : '没有可导出的产品数据');
        return;
      }

      // 转换数据格式（与导入模板字段保持一致）
      const exportData = productsToExport.map(p => ({
        '产品名称': p.product_name || '',
        '规格型号': p.model || '',
        '品牌': p.brand || '',
        '参数描述': p.specifications || '',
        '供应商': p.supplier || '',
        '联系人': p.contact_person || '',
        '联系电话': p.contact_phone || '',
        '单位': p.unit || '',
        '成本': p.cost_price || 0,
        '最低售价': p.min_price || 0,
        '指导价': p.price || 0
      }));

      // 创建工作簿和工作表
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // 设置列宽
      const colWidths = [
        { wch: 20 }, // 产品名称
        { wch: 15 }, // 规格型号
        { wch: 12 }, // 品牌
        { wch: 30 }, // 参数描述
        { wch: 20 }, // 供应商
        { wch: 10 }, // 联系人
        { wch: 15 }, // 联系电话
        { wch: 8 },  // 单位
        { wch: 10 }, // 成本
        { wch: 10 }, // 最低售价
        { wch: 10 }, // 指导价
      ];
      worksheet['!cols'] = colWidths;

      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(workbook, worksheet, '产品价格库');

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10);
      const filterSuffix = (filterConfig?.brands?.size || 0) > 0 || filterConfig?.keyword 
        ? '_筛选' : '';
      const filename = exportSelectedOnly 
        ? `产品价格库_选中${selectedProducts.size}条${filterSuffix}_${timestamp}.xlsx`
        : `产品价格库_全部${products.length}条${filterSuffix}_${timestamp}.xlsx`;

      // 下载文件
      XLSX.writeFile(workbook, filename);

      alert(`✅ 成功导出 ${productsToExport.length} 条产品数据！`);
      setShowExportFilter(false);
    } catch (error) {
      console.error('导出Excel失败:', error);
      alert(`❌ 导出Excel失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 导出产品为 CSV 格式
  const handleExportCSV = (exportSelectedOnly: boolean = false, filterConfig?: { brands?: Set<string>, keyword?: string }) => {
    try {
      // 确定要导出的产品数据
      let productsToExport = exportSelectedOnly 
        ? products.filter(p => selectedProducts.has(p.id))
        : products;

      // 应用类别筛选
      if (filterConfig) {
        if (filterConfig.brands && filterConfig.brands.size > 0) {
          productsToExport = productsToExport.filter(p => filterConfig.brands!.has(p.brand));
        }
        if (filterConfig.keyword) {
          const keyword = filterConfig.keyword.toLowerCase().trim();
          if (keyword) {
            productsToExport = productsToExport.filter(p =>
              (p.product_name || '').toLowerCase().includes(keyword) ||
              (p.model || '').toLowerCase().includes(keyword) ||
              (p.brand || '').toLowerCase().includes(keyword)
            );
          }
        }
      }

      if (productsToExport.length === 0) {
        alert(exportSelectedOnly ? '请先选择要导出的产品' : '没有可导出的产品数据');
        return;
      }

      // 定义CSV列顺序和字段映射
      const csvHeaders = [
        '产品名称', '规格型号', '品牌', '参数描述', 
        '供应商', '联系人', '联系电话', '单位', 
        '成本', '最低售价', '指导价'
      ];

      const fieldMapping = {
        '产品名称': 'product_name',
        '规格型号': 'model',
        '品牌': 'brand',
        '参数描述': 'specifications',
        '供应商': 'supplier',
        '联系人': 'contact_person',
        '联系电话': 'contact_phone',
        '单位': 'unit',
        '成本': 'cost_price',
        '最低售价': 'min_price',
        '指导价': 'price'
      } as const;

      // 转换数据为CSV格式
      const rows = [csvHeaders.join(',')];

      productsToExport.forEach(p => {
        const row = csvHeaders.map(header => {
          const fieldKey = fieldMapping[header as keyof typeof fieldMapping] as keyof typeof p;
          let value = p[fieldKey] !== undefined && p[fieldKey] !== null 
            ? String(p[fieldKey]) 
            : '';
          
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
      const filterSuffix = (filterConfig?.brands?.size || 0) > 0 || filterConfig?.keyword 
        ? '_筛选' : '';
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

      alert(`✅ 成功导出 ${productsToExport.length} 条产品数据！`);
      setShowExportFilter(false);
    } catch (error) {
      console.error('导出CSV失败:', error);
      alert(`❌ 导出CSV失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleSaveColumnConfig = (columns: string[]) => {
    // 确保所有 fixed 列都包含在配置中
    const fixedColumns = availableColumns
      .filter(col => col.fixed)
      .map(col => col.key);
    const columnsWithFixed = [...new Set([...fixedColumns, ...columns])];

    // 保存列配置到 localStorage
    localStorage.setItem('price-library-columns', JSON.stringify(columnsWithFixed));
    setVisibleColumns(new Set(columnsWithFixed));
    setShowColumnConfig(false);
    alert('✅ 列配置已保存！');
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* 工具栏 */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <span className="text-2xl">📊</span> 产品价格库
        </h3>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          
          {/* 导入按钮组 */}
          <div
            className="relative"
            onMouseLeave={() => handleMenuMouseLeave('import')}
          >
            <button
              onClick={() => setShowImportMenu(!showImportMenu)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
            >
              <span>📤</span> 导入
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                  📤 导入Excel
                </button>
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    handleDownloadTemplate();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 last:rounded-b-lg"
                >
                  📥 下载模板
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

          {/* 导出按钮组 */}
          <div
            className="relative"
            onMouseLeave={() => handleMenuMouseLeave('export')}
          >
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={products.length === 0}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>📊</span> 导出
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExportMenu && (
              <div
                className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10 min-w-[160px]"
                onMouseEnter={() => handleMenuMouseEnter('export')}
              >
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    handleExportExcel(false);
                  }}
                  disabled={products.length === 0}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 first:rounded-t-lg"
                >
                  📊 导出Excel
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    const allBrands = new Set(products.map(p => p.brand).filter(Boolean));
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
                  📄 导出CSV
                </button>
              </div>
            )}
          </div>

          {/* 配置按钮组 */}
          <div
            className="relative"
            onMouseLeave={() => handleMenuMouseLeave('config')}
          >
            <button
              onClick={() => setShowConfigMenu(!showConfigMenu)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
            >
              <span>⚙️</span> 配置
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

          <button
            onClick={loadProducts}
            disabled={loading}
            className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="刷新当前模块"
          >
            <span>{loading ? '⏳' : '🔄'}</span>
            {loading ? '刷新中...' : '刷新'}
          </button>
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
                产品名称 {fieldConfigs.product_name?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.product_name}
                onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
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
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                参数描述 {fieldConfigs.specifications?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.specifications}
                onChange={(e) => setNewProduct({ ...newProduct, specifications: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品参数描述"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                联系人 {fieldConfigs.contact_person?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.contact_person}
                onChange={(e) => setNewProduct({ ...newProduct, contact_person: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入联系人"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                联系电话 {fieldConfigs.contact_phone?.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newProduct.contact_phone}
                onChange={(e) => setNewProduct({ ...newProduct, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入联系电话"
              />
            </div>
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
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                最低售价 {fieldConfigs.min_price?.required && <span className="text-red-500">*</span>}
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
                value={editingProduct.product_name || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, product_name: e.target.value })}
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
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                参数描述
              </label>
              <input
                type="text"
                value={editingProduct.specifications || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, specifications: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品参数描述"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                联系人
              </label>
              <input
                type="text"
                value={editingProduct.contact_person || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, contact_person: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入联系人"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                联系电话
              </label>
              <input
                type="text"
                value={editingProduct.contact_phone || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入联系电话"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                成本
              </label>
              <input
                type="number"
                value={editingProduct.cost_price || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, cost_price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入成本价格"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                最低售价
              </label>
              <input
                type="number"
                value={editingProduct.min_price || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, min_price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入最低售价"
                min="0"
                step="0.01"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleUpdateProduct}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              更新产品
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
        <input
          type="text"
          placeholder="搜索产品名称、规格型号、品牌、参数描述..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchProducts()}
          className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        />
        <button
          onClick={searchProducts}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? '搜索中...' : '搜索'}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">总产品数</div>
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{products.length}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div className="text-xs text-green-600 dark:text-green-400 mb-1">品牌数量</div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">
            {new Set(products.map(p => p.brand)).size}
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="text-xs text-orange-600 dark:text-orange-400 mb-1">平均价格</div>
          <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
            ¥{(products.reduce((sum, p) => sum + (p.price || 0), 0) / (products.length || 1)).toFixed(2)}
          </div>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedProducts.size > 0 && (
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
              title="导出选中的产品为 Excel 文件"
            >
              <span>📊</span> 导出Excel
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
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {availableColumns
                  .filter(col => visibleColumns.has(col.key))
                  .map(col => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 ${
                        col.key === 'select' ? 'w-12 text-center' :
                        col.key === 'operations' ? 'text-center' :
                        col.key === 'price' ? 'text-right' :
                        'text-left'
                      } text-slate-700 dark:text-slate-300 font-medium`}
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
              {products.length === 0 ? (
                <tr>
                  <td colSpan={availableColumns.length} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    暂无数据，请导入Excel或手动添加
                  </td>
                </tr>
              ) : (
                products.map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    {availableColumns
                      .filter(col => visibleColumns.has(col.key))
                      .map(col => {
                        if (col.key === 'select') {
                          return (
                            <td key={col.key} className="px-4 py-3 w-12 text-center">
                              <Checkbox
                                checked={selectedProducts.has(p.id)}
                                onCheckedChange={() => handleSelectProduct(p.id)}
                                aria-label={`选择产品 ${p.product_name}`}
                              />
                            </td>
                          );
                        }
                        if (col.key === 'operations') {
                          return (
                            <td key={col.key} className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleEditProduct(p)}
                                className="text-blue-600 hover:text-blue-800 text-xs mr-3 transition-colors"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.id)}
                                className="text-red-600 hover:text-red-800 text-xs transition-colors"
                              >
                                删除
                              </button>
                            </td>
                          );
                        }
                        if (col.key === 'price') {
                          return (
                            <td key={col.key} className="px-4 py-3 text-right text-slate-900 dark:text-slate-100 font-medium">
                              ¥{(p[col.key as keyof typeof p] as number)?.toFixed(2) || '-'}
                            </td>
                          );
                        }
                        if (col.key === 'specifications') {
                          return (
                            <td key={col.key} className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                              {p[col.key as keyof typeof p] as string}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            {p[col.key as keyof typeof p] as string || '-'}
                          </td>
                        );
                      })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 字段配置管理 */}
      {showFieldConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <FieldConfigManager onClose={async () => {
            setShowFieldConfig(false);
            // 重新加载字段配置
            await loadFieldConfigs();
          }} />
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
          />
        </div>
      )}

      {/* 列配置对话框 */}
      {showColumnConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">配置表格显示列</h3>
              <button
                onClick={() => setShowColumnConfig(false)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableColumns.map(col => (
                  <div
                    key={col.key}
                    className={`flex items-center gap-2 p-3 border rounded-lg ${
                      col.fixed 
                        ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer'
                    } ${visibleColumns.has(col.key) ? 'border-blue-300 dark:border-blue-700' : ''}`}
                    onClick={() => {
                      if (!col.fixed) {
                        const newVisible = new Set(visibleColumns);
                        if (newVisible.has(col.key)) {
                          newVisible.delete(col.key);
                        } else {
                          newVisible.add(col.key);
                        }
                        setVisibleColumns(newVisible);
                      }
                    }}
                  >
                    <Checkbox
                      checked={visibleColumns.has(col.key)}
                      disabled={col.fixed}
                      aria-label={col.label}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{col.label}</span>
                    {col.fixed && <span className="text-xs text-slate-500 ml-auto">(必选)</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  // 恢复默认配置
                  const defaultColumns = availableColumns
                    .filter(col => col.defaultVisible || col.fixed)
                    .map(col => col.key);
                  setVisibleColumns(new Set(defaultColumns));
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
                  onClick={() => handleSaveColumnConfig(Array.from(visibleColumns))}
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
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">🔍 高级导出 - 按类别筛选</h3>
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
                      const allBrands = new Set(products.map(p => p.brand).filter(Boolean));
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
                  {Array.from(new Set(products.map(p => p.brand).filter(Boolean)))
                    .sort((a, b) => a.localeCompare(b))
                    .map(brand => (
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
                      <span className="font-medium text-slate-900 dark:text-slate-100">{products.length} 个</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">筛选后：</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {products.filter(p => {
                          const brandMatch = exportFilterBrands.size === 0 || exportFilterBrands.has(p.brand);
                          const keywordMatch = !exportFilterKeywords.trim() || 
                            p.product_name?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                            p.model?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                            p.brand?.toLowerCase().includes(exportFilterKeywords.toLowerCase());
                          return brandMatch && keywordMatch;
                        }).length} 个
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
                    keyword: exportFilterKeywords
                  };
                  setPendingFilterConfig(filterConfig);
                  setShowExportFilter(false);
                  setShowExportFormatDialog(true);
                }}
                disabled={products.filter(p => {
                  const brandMatch = exportFilterBrands.size === 0 || exportFilterBrands.has(p.brand);
                  const keywordMatch = !exportFilterKeywords.trim() || 
                    p.product_name?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                    p.model?.toLowerCase().includes(exportFilterKeywords.toLowerCase()) ||
                    p.brand?.toLowerCase().includes(exportFilterKeywords.toLowerCase());
                  return brandMatch && keywordMatch;
                }).length === 0}
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
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">📊 选择导出格式</h3>
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
                    {products.filter(p => {
                      const brandMatch = !pendingFilterConfig.brands || pendingFilterConfig.brands.size === 0 || pendingFilterConfig.brands.has(p.brand);
                      const keywordMatch = !pendingFilterConfig.keyword || !pendingFilterConfig.keyword.trim() || 
                        p.product_name?.toLowerCase().includes(pendingFilterConfig.keyword.toLowerCase()) ||
                        p.model?.toLowerCase().includes(pendingFilterConfig.keyword.toLowerCase()) ||
                        p.brand?.toLowerCase().includes(pendingFilterConfig.keyword.toLowerCase());
                      return brandMatch && keywordMatch;
                    }).length}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">条产品数据</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                请选择导出格式：
              </p>
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
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">.xlsx 格式</div>
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
