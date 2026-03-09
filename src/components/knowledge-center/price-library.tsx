'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import ImportFieldMapping, { SYSTEM_FIELDS } from './import-field-mapping';

export default function PriceLibrary() {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [pendingExcelData, setPendingExcelData] = useState<{ headers: string[]; data: any[] } | null>(null);
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

  useEffect(() => {
    loadProducts();
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
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
          const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

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
    if (!newProduct.product_name || !newProduct.price) {
      alert('请至少填写产品名称和价格');
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
            '供应商': newProduct.supplier
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
          price: '',
          supplier: ''
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* 工具栏 */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <span className="text-2xl">📊</span> 产品价格库
        </h3>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={handleImportExcel}
            disabled={importing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{importing ? '⏳' : '📤'}</span>
            {importing ? '导入中...' : '导入Excel'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
          >
            <span>➕</span> 手动添加
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm"
          >
            <span>📥</span> 下载模板
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
                产品名称 <span className="text-red-500">*</span>
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
                型号
              </label>
              <input
                type="text"
                value={newProduct.model}
                onChange={(e) => setNewProduct({ ...newProduct, model: e.target.value })}
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
                value={newProduct.brand}
                onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
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
                value={newProduct.unit}
                onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入单位（如：台、个）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                价格 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入价格"
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
                value={newProduct.supplier}
                onChange={(e) => setNewProduct({ ...newProduct, supplier: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入供应商"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                规格
              </label>
              <input
                type="text"
                value={newProduct.specifications}
                onChange={(e) => setNewProduct({ ...newProduct, specifications: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品规格"
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
                价格 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={editingProduct.price || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入价格"
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
                规格
              </label>
              <input
                type="text"
                value={editingProduct.specifications || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, specifications: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                placeholder="输入产品规格"
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
          placeholder="搜索产品名称、型号、品牌..."
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
          <button
            onClick={handleBatchDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm"
          >
            <span>🗑️</span> 批量删除
          </button>
        </div>
      )}

      {/* 数据表格 */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 w-12 text-center">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="全选"
                  />
                </th>
                <th className="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-medium">产品名称</th>
                <th className="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-medium">规格型号</th>
                <th className="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-medium">品牌</th>
                <th className="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-medium">参数描述</th>
                <th className="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-medium">单位</th>
                <th className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">价格</th>
                <th className="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-medium">供应商</th>
                <th className="px-4 py-3 text-center text-slate-700 dark:text-slate-300 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    暂无数据，请导入Excel或手动添加
                  </td>
                </tr>
              ) : (
                products.map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-4 py-3 w-12 text-center">
                      <Checkbox
                        checked={selectedProducts.has(p.id)}
                        onCheckedChange={() => handleSelectProduct(p.id)}
                        aria-label={`选择产品 ${p.product_name}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.model}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.brand}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">{p.specifications}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.unit}</td>
                    <td className="px-4 py-3 text-right text-slate-900 dark:text-slate-100 font-medium">¥{p.price?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.supplier}</td>
                    <td className="px-4 py-3 text-center">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}
