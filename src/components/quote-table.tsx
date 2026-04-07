'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

// 图标导入 - 只保留实际使用的图标
import {
  FileText,
  FileSpreadsheet,
  Download,
  Edit,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Settings,
  Search,
  RefreshCw,
  CheckCircle2,
  Info,
  Loader2,
  Building2,
  Phone,
  Mail as MailIcon,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Package,
  Calculator,
  CheckCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// 类型定义
interface Product {
  id?: number;
  name: string;
  model: string;
  brand: string;
  parameter_description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string;
  note?: string;
  category?: string;
  description?: string;
  features?: string;
  source?: string;
  marketPrice?: number;
  priceRange?: string;
  priceSource?: string;
  // 多品牌对比字段
  supplier?: string;
  contactPhone?: string;
  bidAmount?: number;
  quoteCount?: number;
  rating?: number;
  responseTime?: number;
  tags?: string[];
}

interface FeeConfig {
  taxRate: number;
  shipping: number;
  installation: number;
  otherFees: number;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
}

interface QuoteData {
  quoteNumber: string;
  supplierInfo: {
    companyName: string;
    logoUrl?: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    bankName: string;
    bankAccount: string;
    taxNumber: string;
  };
  customerInfo: {
    name: string;
    projectName: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  products: Product[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  shipping: number;
  installation: number;
  otherFees: number;
  totalAmount: number;
  terms: {
    payment: string;
    warranty: string;
    delivery: string;
    validity: string;
  };
  notes?: string;
  validUntil?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ColumnConfig {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  visible: boolean;
  width?: string;
  priority: number;
}

interface GroupConfig {
  key: string;
  label: string;
  value: string;
}

interface CustomField {
  id: string;
  name: string;
  value: string;
}

interface QuoteTableProps {
  data: QuoteData;
  supplierInfo?: {
    companyName: string;
    logoUrl?: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    bankName: string;
    bankAccount: string;
    taxNumber: string;
  };
  onUpdateProductPrice?: (productIndex: number, newPrice: number) => void;
  onUpdateProductQuantity?: (productIndex: number, newQuantity: number) => void;
  onUpdateFeeConfig?: (feeConfig: FeeConfig) => void;
  onRegenerate?: () => void;
  onRemoveProduct?: (productIndex: number) => void;
  onUpdateData?: (data: QuoteData) => void;
  autoScroll?: boolean;
  messageId?: number;
  message?: any;
}

// 常用税率
const COMMON_TAX_RATES = [0, 3, 6, 9, 13, 17];

// 所有可用列
const ALL_COLUMNS: ColumnConfig[] = [
  { key: 'index', label: '序号', align: 'center', visible: true, priority: 1 },
  { key: 'name', label: '产品名称', align: 'left', visible: true, priority: 2 },
  { key: 'parameter_description', label: '参数描述', align: 'left', visible: true, priority: 3 },
  { key: 'brand', label: '品牌', align: 'left', visible: true, priority: 4 },
  { key: 'unit', label: '单位', align: 'center', visible: true, priority: 5 },
  { key: 'quantity', label: '数量', align: 'center', visible: true, priority: 6 },
  { key: 'unitPrice', label: '单价(元)', align: 'right', visible: true, priority: 7 },
  { key: 'totalPrice', label: '小计(元)', align: 'right', visible: true, priority: 8 },
  { key: 'marketPrice', label: '市场参考价', align: 'right', visible: true, priority: 9 },
  { key: 'rating', label: '评分', align: 'center', visible: false, priority: 11 },
  { key: 'quoteCount', label: '报价次数', align: 'center', visible: false, priority: 12 },
  { key: 'actions', label: '操作', align: 'center', visible: true, priority: 10 },
];

// 生成 UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 格式化货币
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(value);
};

// 格式化日期
const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// 计算价格差异
const calculatePriceDiff = (currentPrice: number, marketPrice: number) => {
  if (!marketPrice || marketPrice === 0) return null;
  const diff = currentPrice - marketPrice;
  const percentage = (diff / marketPrice) * 100;
  return {
    diff,
    percentage,
    isLower: currentPrice < marketPrice,
    isHigher: currentPrice > marketPrice,
    isEqual: currentPrice === marketPrice,
  };
};

// 获取报价标题
const getQuoteTitle = (products: Product[]) => {
  if (!products || products.length === 0) return '报价单';

  const validProducts = products.filter((p) => p != null);
  const categories = validProducts.map((p) => p.category).filter(Boolean);
  const uniqueCategories = [...new Set(categories)];

  if (uniqueCategories.length === 1) {
    return `${uniqueCategories[0]}报价单`;
  } else if (uniqueCategories.length > 1) {
    return '综合设备报价单';
  } else {
    const names = validProducts.map((p) => p.name);
    const keywords = ['泵', '阀', '罐', '机', '器', '电机', '仪表'];
    for (const keyword of keywords) {
      if (names.some((name) => name?.includes(keyword))) {
        return `${keyword}类设备报价单`;
      }
    }
    return '设备报价单';
  }
};

// 金额转中文大写
const formatAmountToChinese = (amount: number) => {
  const digitUppercase = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit = ['', '拾', '佰', '仟'];
  const bigUnit = ['', '万', '亿'];

  const amountStr = amount.toFixed(2);
  const [integerPart, decimalPart] = amountStr.split('.');

  if (parseInt(integerPart) === 0 && parseInt(decimalPart) === 0) {
    return '零元整';
  }

  let result = '';

  // 处理整数部分
  const integer = parseInt(integerPart);
  if (integer > 0) {
    const integerStr = integer.toString();
    const len = integerStr.length;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(integerStr[i]);
      const pos = len - i - 1;

      if (digit !== 0) {
        result += digitUppercase[digit] + unit[pos % 4];
      } else {
        if (i > 0 && integerStr[i - 1] !== '0') {
          result += '零';
        }
      }

      if (pos % 4 === 0 && pos > 0) {
        result += bigUnit[Math.floor(pos / 4)];
      }
    }
    result += '元';
  } else {
    result = '零元';
  }

  // 处理小数部分
  const jiao = parseInt(decimalPart[0]);
  const fen = parseInt(decimalPart[1]);

  if (jiao === 0 && fen === 0) {
    result += '整';
  } else {
    if (jiao > 0) {
      result += digitUppercase[jiao] + '角';
    }
    if (fen > 0) {
      result += digitUppercase[fen] + '分';
    }
  }

  return result;
};

export default function QuoteTable({
  data,
  supplierInfo: propSupplierInfo,
  onUpdateProductPrice,
  onUpdateProductQuantity,
  onUpdateFeeConfig,
  onRegenerate,
  onRemoveProduct,
  onUpdateData,
  autoScroll = false,
  messageId,
  message,
}: QuoteTableProps) {
  // 使用传入的供应信息或从报价数据中获取
  const actualSupplierInfo = propSupplierInfo || data?.supplierInfo;

  // 内部状态
  const [quoteData, setQuoteData] = useState<QuoteData>(() => {
    const filteredProducts = Array.isArray(data?.products) ? data.products.filter((p) => p != null) : [];
    return {
      ...data,
      products: filteredProducts,
    };
  });

  const [editingPrice, setEditingPrice] = useState<{ rowIndex: number; value: string } | null>(
    null
  );
  const [editingQuantity, setEditingQuantity] = useState<{
    rowIndex: number;
    value: string;
  } | null>(null);
  const [editingField, setEditingField] = useState<{ rowIndex: number; value: string } | null>(
    null
  );
  const [editingFee, setEditingFee] = useState<{ field: string; value: string } | null>(null);
  const [editingCustomField, setEditingCustomField] = useState<{
    fieldIndex: number;
    value: string;
  } | null>(null);
  const [_searchingMarketPrice, setSearchingMarketPrice] = useState<number | null>(null);
  const [isSearchingAll, setIsSearchingAll] = useState(false);
  const [marketPrices, setMarketPrices] = useState<
    Record<
      number,
      {
        loading: boolean;
        data: any;
        error: string | null;
        showConfirm: boolean;
      }
    >
  >({});
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [groupBy, setGroupBy] = useState<string>('none');
  const [_showNotes, setShowNotes] = useState<Record<number, boolean>>({});
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    // 初始化列配置，确保单价和总价列始终包含在内
    const columns = ALL_COLUMNS.filter((col) => col.visible).map((col) => col.key);
    const requiredColumns = ['unitPrice', 'totalPrice'];
    const uniqueColumns = Array.from(new Set([...requiredColumns, ...columns]));
    return uniqueColumns;
  });
  const [projectFields, setProjectFields] = useState<CustomField[]>([
    { id: '1', name: '联系人', value: data?.customerInfo?.contactPerson || '' },
    { id: '2', name: '电话', value: data?.customerInfo?.phone || '' },
  ]);
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({
    taxRate: data?.taxRate || 13,
    shipping: data?.shipping || 0,
    installation: data?.installation || 0,
    otherFees: data?.otherFees || 0,
    validUntil:
      data?.validUntil ||
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paymentTerms: data?.terms?.payment || '预付30%，发货前付清70%',
    deliveryTerms: data?.terms?.delivery || '合同签订后15个工作日内',
    warrantyTerms: data?.terms?.warranty || '整机质保12个月',
  });
  const [showFeeConfig, setShowFeeConfig] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showProjectConfig, setShowProjectConfig] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fillPricesLoading, setFillPricesLoading] = useState(false);
  const [_marketPriceStats, setMarketPriceStats] = useState<{
    total: number;
    matched: number;
    averageDiff: number;
  } | null>(null);
  const [autoFillEnabled, setAutoFillEnabled] = useState(true);
  const [pendingAutoFill, setPendingAutoFill] = useState<{ index: number; price: number } | null>(
    null
  );

  // 临时编辑状态
  const [tempFeeConfig, setTempFeeConfig] = useState<FeeConfig>(feeConfig);
  const [tempSelectedColumns, setTempSelectedColumns] = useState<string[]>(selectedColumns);
  const [tempProjectFields, setTempProjectFields] = useState<CustomField[]>(projectFields);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  // 表格列配置
  const columns = ALL_COLUMNS;

  // 分组选项
  const groupOptions: GroupConfig[] = [
    { key: 'none', label: '不分组', value: 'none' },
    { key: 'category', label: '按类别', value: 'category' },
    { key: 'brand', label: '按品牌', value: 'brand' },
    { key: 'system', label: '按系统', value: 'system' },
  ];

  // 监听 marketPrices 变化，处理自动填充
  useEffect(() => {
    if (pendingAutoFill && marketPrices[pendingAutoFill.index]) {
      const marketData = marketPrices[pendingAutoFill.index];
      if (marketData?.data && !marketData.loading) {
        handleApplyMarketPrice(pendingAutoFill.index);
        setPendingAutoFill(null);
      }
    }
  }, [marketPrices, pendingAutoFill]);

  // 当传入数据更新时更新本地状态
  useEffect(() => {

    if (!data) return;

    // 安全地处理数据
    const safeData = {
      ...data,
      products: Array.isArray(data.products) ? data.products.filter((p) => p != null) : [],
    };

    setQuoteData(safeData);

    setProjectFields((prev) => {
      const newFields = [...prev];
      if (newFields.length >= 2) {
        newFields[0] = { ...newFields[0], value: data.customerInfo?.contactPerson || '' };
        newFields[1] = { ...newFields[1], value: data.customerInfo?.phone || '' };
      }
      return newFields;
    });

    setFeeConfig({
      taxRate: data.taxRate || 13,
      shipping: data.shipping || 0,
      installation: data.installation || 0,
      otherFees: data.otherFees || 0,
      validUntil:
        data.validUntil ||
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      paymentTerms: data.terms?.payment || '预付30%，发货前付清70%',
      deliveryTerms: data.terms?.delivery || '合同签订后15个工作日内',
      warrantyTerms: data.terms?.warranty || '整机质保12个月',
    });
  }, [data]);

  // 安全地获取产品数组
  const safeProducts = useMemo(() => {
    return Array.isArray(quoteData?.products) ? quoteData.products.filter((p) => p != null) : [];
  }, [quoteData]);

  // 计算费用汇总
  const subtotal = safeProducts.reduce((sum, p) => sum + (p?.totalPrice || 0), 0);
  const taxAmount = subtotal * (feeConfig.taxRate / 100);
  const totalAmount =
    subtotal + taxAmount + feeConfig.shipping + feeConfig.installation + feeConfig.otherFees;

  // 检测是否有零价格产品
  const hasZeroPriceProducts = safeProducts.some((p) => (p?.unitPrice || 0) === 0);

  // 处理价格编辑
  const handlePriceEdit = (rowIndex: number, currentPrice: number) => {
    setEditingPrice({
      rowIndex,
      value: currentPrice.toString(),
    });
  };

  const handlePriceChange = (value: string) => {
    if (editingPrice) {
      setEditingPrice({
        ...editingPrice,
        value,
      });
    }
  };

  const handlePriceSave = (rowIndex: number) => {
    if (editingPrice && editingPrice.rowIndex === rowIndex) {
      const newPrice = parseFloat(editingPrice.value);
      if (!isNaN(newPrice) && newPrice >= 0) {
        if (onUpdateProductPrice) {
          onUpdateProductPrice(rowIndex, newPrice);
        } else {
          const updatedProducts = [...safeProducts];
          if (updatedProducts[rowIndex]) {
            updatedProducts[rowIndex] = {
              ...updatedProducts[rowIndex],
              unitPrice: newPrice,
              totalPrice: newPrice * (updatedProducts[rowIndex].quantity || 1),
            };
            const newData = {
              ...quoteData,
              products: updatedProducts,
            };
            setQuoteData(newData);
            onUpdateData?.(newData);
          }
        }
      }
      setEditingPrice(null);
    }
  };

  // 处理数量编辑
  const handleQuantityEdit = (rowIndex: number, currentQuantity: number) => {
    setEditingQuantity({
      rowIndex,
      value: currentQuantity.toString(),
    });
  };

  const handleQuantityChange = (value: string) => {
    if (editingQuantity) {
      setEditingQuantity({
        ...editingQuantity,
        value,
      });
    }
  };

  const handleQuantitySave = (rowIndex: number) => {
    if (editingQuantity && editingQuantity.rowIndex === rowIndex) {
      const newQuantity = parseFloat(editingQuantity.value);
      if (!isNaN(newQuantity) && newQuantity > 0) {
        if (onUpdateProductQuantity) {
          onUpdateProductQuantity(rowIndex, newQuantity);
        } else {
          const updatedProducts = [...safeProducts];
          if (updatedProducts[rowIndex]) {
            updatedProducts[rowIndex] = {
              ...updatedProducts[rowIndex],
              quantity: newQuantity,
              totalPrice: (updatedProducts[rowIndex].unitPrice || 0) * newQuantity,
            };
            const newData = {
              ...quoteData,
              products: updatedProducts,
            };
            setQuoteData(newData);
            onUpdateData?.(newData);
          }
        }
      }
      setEditingQuantity(null);
    }
  };

  // 处理按键事件
  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, type: 'price' | 'quantity') => {
    if (e.key === 'Enter') {
      if (type === 'price') {
        handlePriceSave(rowIndex);
      } else {
        handleQuantitySave(rowIndex);
      }
    } else if (e.key === 'Escape') {
      if (type === 'price') {
        setEditingPrice(null);
      } else {
        setEditingQuantity(null);
      }
    }
  };

  // 处理项目字段编辑
  const handleProjectFieldEdit = (field: string, currentValue: string) => {
    setEditingField({
      rowIndex: field === 'name' ? 0 : 1,
      value: currentValue,
    });
  };

  const handleProjectFieldChange = (value: string) => {
    if (editingField) {
      setEditingField({
        ...editingField,
        value,
      });
    }
  };

  const handleProjectFieldSave = (field: string) => {
    if (editingField) {
      const newData = {
        ...quoteData,
        customerInfo: {
          ...quoteData.customerInfo,
          [field]: editingField.value,
        },
      };
      setQuoteData(newData);
      onUpdateData?.(newData);
      setEditingField(null);
    }
  };

  // 处理费用编辑
  const handleFeeEdit = (field: string, currentValue: number) => {
    setEditingFee({
      field,
      value: currentValue.toString(),
    });
  };

  const handleFeeChange = (value: string) => {
    if (editingFee) {
      setEditingFee({
        ...editingFee,
        value,
      });
    }
  };

  const handleFeeSave = (field: string) => {
    if (editingFee && editingFee.field === field) {
      const newValue = parseFloat(editingFee.value);
      if (!isNaN(newValue) && newValue >= 0) {
        setFeeConfig((prev) => ({
          ...prev,
          [field]: newValue,
        }));
        if (onUpdateFeeConfig) {
          onUpdateFeeConfig({
            ...feeConfig,
            [field]: newValue,
          });
        }
      }
      setEditingFee(null);
    }
  };

  // 处理自定义字段编辑
  const handleCustomFieldEdit = (fieldIndex: number, currentValue: string) => {
    setEditingCustomField({
      fieldIndex,
      value: currentValue,
    });
  };

  const handleCustomFieldChange = (value: string) => {
    if (editingCustomField) {
      setEditingCustomField({
        ...editingCustomField,
        value,
      });
    }
  };

  const handleCustomFieldSave = (fieldIndex: number) => {
    if (editingCustomField && editingCustomField.fieldIndex === fieldIndex) {
      const updatedFields = [...projectFields];
      updatedFields[fieldIndex] = {
        ...updatedFields[fieldIndex],
        value: editingCustomField.value,
      };
      setProjectFields(updatedFields);

      const field = updatedFields[fieldIndex];
      if (field.name === '联系人') {
        const newData = {
          ...quoteData,
          customerInfo: {
            ...quoteData.customerInfo,
            contactPerson: editingCustomField.value,
          },
        };
        setQuoteData(newData);
        onUpdateData?.(newData);
      } else if (field.name === '电话') {
        const newData = {
          ...quoteData,
          customerInfo: {
            ...quoteData.customerInfo,
            phone: editingCustomField.value,
          },
        };
        setQuoteData(newData);
        onUpdateData?.(newData);
      }

      setEditingCustomField(null);
    }
  };

  const handleCustomFieldKeyDown = (e: React.KeyboardEvent, fieldIndex: number) => {
    if (e.key === 'Enter') {
      handleCustomFieldSave(fieldIndex);
    } else if (e.key === 'Escape') {
      setEditingCustomField(null);
    }
  };

  // 添加自定义项目字段
  const handleAddProjectField = () => {
    if (!newFieldName.trim()) return;

    const newField = {
      id: generateUUID(),
      name: newFieldName,
      value: newFieldValue,
    };
    setTempProjectFields([...tempProjectFields, newField]);
    setNewFieldName('');
    setNewFieldValue('');
  };

  // 移除自定义项目字段
  const handleRemoveProjectField = (id: string) => {
    setTempProjectFields(tempProjectFields.filter((f) => f.id !== id));
  };

  // 更新自定义项目字段
  const handleUpdateProjectField = (id: string, field: 'name' | 'value', value: string) => {
    setTempProjectFields((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  };

  // 保存项目字段配置
  const handleSaveProjectFields = () => {
    setProjectFields(tempProjectFields);
    setShowProjectConfig(false);
  };

  // 取消项目字段配置
  const handleCancelProjectFields = () => {
    setTempProjectFields(projectFields);
    setNewFieldName('');
    setNewFieldValue('');
    setShowProjectConfig(false);
  };

  // 保存列配置
  const handleSaveColumnConfig = () => {
    // 确保单价和总价列始终包含在内
    const requiredColumns = ['unitPrice', 'totalPrice'];
    const uniqueColumns = Array.from(new Set([...requiredColumns, ...tempSelectedColumns]));
    setSelectedColumns(uniqueColumns);
    setShowColumnConfig(false);
  };

  // 取消列配置
  const handleCancelColumnConfig = () => {
    setTempSelectedColumns(selectedColumns);
    setShowColumnConfig(false);
  };

  // 切换列显示
  const toggleColumnVisibility = (columnKey: string) => {
    // 单价和总价列为必选项，不允许取消勾选
    if (columnKey === 'unitPrice' || columnKey === 'totalPrice') {
      return;
    }
    setTempSelectedColumns((prev) =>
      prev.includes(columnKey) ? prev.filter((k) => k !== columnKey) : [...prev, columnKey]
    );
  };

  // 保存费用配置
  const handleSaveFeeConfig = () => {
    setFeeConfig(tempFeeConfig);
    if (onUpdateFeeConfig) {
      onUpdateFeeConfig(tempFeeConfig);
    }
    setShowFeeConfig(false);
  };

  // 取消费用配置
  const handleCancelFeeConfig = () => {
    setTempFeeConfig(feeConfig);
    setShowFeeConfig(false);
  };

  // 处理删除产品
  const handleRemoveProduct = (productIndex: number) => {
    if (onRemoveProduct) {
      onRemoveProduct(productIndex);
    } else {
      const updatedProducts = safeProducts.filter((_, index) => index !== productIndex);
      const newData = {
        ...quoteData,
        products: updatedProducts,
      };
      setQuoteData(newData);
      onUpdateData?.(newData);
    }
  };

  // 搜索单个产品的市场价
  const handleSearchMarketPrice = async (productIndex: number) => {
    const product = safeProducts[productIndex];
    if (!product) {
      console.error('[QuoteTable] 产品不存在:', productIndex);
      return;
    }


    setSearchingMarketPrice(productIndex);
    setMarketPrices((prev) => ({
      ...prev,
      [productIndex]: {
        loading: true,
        data: null,
        error: null,
        showConfirm: false,
      },
    }));

    try {
      const requestBody = {
        products: [
          {
            name: product.name,
            model: product.model || '',
            specs: product.parameter_description || product.model || '',
          },
        ],
      };


      const response = await fetch('/api/quotes/market-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });


      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      const marketData = result.data?.[0] || result;

      const priceValue =
        marketData.averageMarketPrice ||
        marketData.price ||
        marketData.marketPrice ||
        marketData.value ||
        marketData.unitPrice ||
        0;


      setMarketPrices((prev) => ({
        ...prev,
        [productIndex]: {
          loading: false,
          data: marketData,
          error: null,
          showConfirm: true,
        },
      }));

      if (autoFillEnabled && priceValue > 0) {
        setPendingAutoFill({ index: productIndex, price: priceValue });
      }

    } catch (error) {
      console.error('[QuoteTable] 搜索市场价失败:', error);
      setMarketPrices((prev) => ({
        ...prev,
        [productIndex]: {
          loading: false,
          data: null,
          error: error instanceof Error ? error.message : '网络错误',
          showConfirm: false,
        },
      }));
    } finally {
      setSearchingMarketPrice(null);
    }
  };

  // 搜索所有产品的市场价
  const handleSearchAllMarketPrices = async () => {
    setIsSearchingAll(true);
    setMarketPriceStats(null);

    const products = safeProducts;
    const results: Record<number, any> = {};
    let matched = 0;
    let totalDiff = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (!product) continue;

      setMarketPrices((prev) => ({
        ...prev,
        [i]: { ...prev[i], loading: true, error: null },
      }));

      try {
        const response = await fetch('/api/quotes/market-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: [
              {
                name: product.name,
                model: product.model || '',
                specs: product.parameter_description || product.model || '',
              },
            ],
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const marketData = result.data?.[0] || result;
          results[i] = marketData;
          matched++;

          const priceValue =
            marketData.averageMarketPrice ||
            marketData.price ||
            marketData.marketPrice ||
            marketData.value ||
            marketData.unitPrice ||
            0;

          if (priceValue > 0) {
            totalDiff += Math.abs((product.unitPrice || 0) - priceValue);
          }
        }
      } catch (error) {
        console.error(`[QuoteTable] 搜索产品 ${product.name} 市场价失败:`, error);
      }
    }

    const newMarketPrices: Record<number, any> = {};
    for (let i = 0; i < products.length; i++) {
      newMarketPrices[i] = {
        loading: false,
        data: results[i] || null,
        error: results[i] ? null : '查询失败',
        showConfirm: true,
      };
    }
    setMarketPrices(newMarketPrices);

    setMarketPriceStats({
      total: products.length,
      matched,
      averageDiff: matched > 0 ? totalDiff / matched : 0,
    });

    setIsSearchingAll(false);

    if (autoFillEnabled && matched > 0) {
      setTimeout(() => {
        handleApplyAllMarketPrices();
      }, 500);
    }
  };

  // 应用市场价
  const handleApplyMarketPrice = (productIndex: number) => {
    const marketData = marketPrices[productIndex];

    if (!marketData || !marketData.data) {
      console.error('[QuoteTable] 市场价数据不存在');
      return;
    }

    const marketPriceValue =
      marketData.data.averageMarketPrice ||
      marketData.data.price ||
      marketData.data.marketPrice ||
      marketData.data.value ||
      marketData.data.unitPrice ||
      0;

    if (marketPriceValue === 0) {
      console.error('[QuoteTable] 无法提取价格');
      return;
    }


    if (onUpdateProductPrice) {
      onUpdateProductPrice(productIndex, marketPriceValue);
    } else {
      const updatedProducts = [...safeProducts];
      if (updatedProducts[productIndex]) {
        updatedProducts[productIndex] = {
          ...updatedProducts[productIndex],
          unitPrice: marketPriceValue,
          totalPrice: marketPriceValue * (updatedProducts[productIndex].quantity || 1),
        };
        const newData = {
          ...quoteData,
          products: updatedProducts,
        };
        setQuoteData(newData);
        onUpdateData?.(newData);
      }
    }

    setMarketPrices((prev) => ({
      ...prev,
      [productIndex]: { ...prev[productIndex], showConfirm: false },
    }));
  };

  // 应用所有市场价
  const handleApplyAllMarketPrices = () => {

    const updatedProducts = [...safeProducts];
    let appliedCount = 0;

    for (let i = 0; i < updatedProducts.length; i++) {
      const marketData = marketPrices[i];
      if (marketData?.data && updatedProducts[i]) {
        const marketPriceValue =
          marketData.data.averageMarketPrice ||
          marketData.data.price ||
          marketData.data.marketPrice ||
          marketData.data.value ||
          marketData.data.unitPrice ||
          0;

        if (marketPriceValue > 0) {
          updatedProducts[i] = {
            ...updatedProducts[i],
            unitPrice: marketPriceValue,
            totalPrice: marketPriceValue * (updatedProducts[i].quantity || 1),
          };
          appliedCount++;
        }
      }
    }

    if (appliedCount > 0) {
      const newData = {
        ...quoteData,
        products: updatedProducts,
      };
      setQuoteData(newData);
      onUpdateData?.(newData);

      const newMarketPrices = { ...marketPrices };
      Object.keys(newMarketPrices).forEach((key) => {
        newMarketPrices[parseInt(key)] = {
          ...newMarketPrices[parseInt(key)],
          showConfirm: false,
        };
      });
      setMarketPrices(newMarketPrices);

    }
  };

  // 放弃市场价
  const handleDismissMarketPrice = (productIndex: number) => {
    setMarketPrices((prev) => ({
      ...prev,
      [productIndex]: { ...prev[productIndex], showConfirm: false },
    }));
  };

  // 一键填充市场价
  const handleFillPrices = async () => {
    setFillPricesLoading(true);

    const zeroPriceProducts = safeProducts.filter((p) => (p?.unitPrice || 0) === 0);

    if (zeroPriceProducts.length === 0) {
      setFillPricesLoading(false);
      return;
    }


    try {
      const response = await fetch('/api/quotes/market-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: zeroPriceProducts.map((p) => ({
            name: p.name,
            model: p.model || '',
            specs: p.parameter_description || p.model || '',
          })),
        }),
      });

      if (response.ok) {
        const result = await response.json();

        if (result.data && Array.isArray(result.data)) {
          const updatedProducts = [...safeProducts];
          let zeroIndex = 0;
          let filledCount = 0;

          for (let i = 0; i < updatedProducts.length; i++) {
            if ((updatedProducts[i]?.unitPrice || 0) === 0 && zeroIndex < result.data.length) {
              const marketData = result.data[zeroIndex];

              const marketPriceValue =
                marketData.averageMarketPrice ||
                marketData.price ||
                marketData.marketPrice ||
                marketData.value ||
                marketData.unitPrice ||
                0;


              if (marketPriceValue > 0 && updatedProducts[i]) {
                if (onUpdateProductPrice) {
                  onUpdateProductPrice(i, marketPriceValue);
                } else {
                  updatedProducts[i] = {
                    ...updatedProducts[i],
                    unitPrice: marketPriceValue,
                    totalPrice: marketPriceValue * (updatedProducts[i].quantity || 1),
                  };
                }
                filledCount++;
              }
              zeroIndex++;
            }
          }

          if (!onUpdateProductPrice) {
            const newData = {
              ...quoteData,
              products: updatedProducts,
            };
            setQuoteData(newData);
            onUpdateData?.(newData);
          }
        }
      }
    } catch (error) {
      console.error('[QuoteTable] 批量填充市场价失败:', error);
    } finally {
      setFillPricesLoading(false);
    }
  };

  // 导出 Excel
  const handleDownloadExcel = () => {
    setIsExporting(true);

    try {
      const wb = XLSX.utils.book_new();
      const data = [];

      data.push(['报价单', quoteData?.quoteNumber || '']);
      data.push([]);

      data.push(['供应方信息']);
      data.push(['公司名称', actualSupplierInfo?.companyName || '']);
      data.push(['联系人', actualSupplierInfo?.contactPerson || '']);
      data.push(['电话', actualSupplierInfo?.phone || '']);
      data.push(['邮箱', actualSupplierInfo?.email || '']);
      data.push(['地址', actualSupplierInfo?.address || '']);
      data.push([]);

      data.push(['项目概况']);
      data.push(['客户名称', quoteData?.customerInfo?.name || '']);
      data.push(['项目名称', quoteData?.customerInfo?.projectName || '']);
      data.push(['联系人', quoteData?.customerInfo?.contactPerson || '']);
      data.push(['电话', quoteData?.customerInfo?.phone || '']);
      data.push([]);

      if (projectFields.length > 0) {
        projectFields.forEach((field) => {
          data.push([field.name, field.value]);
        });
        data.push([]);
      }

      const headers = columns
        .filter(
          (col) =>
            selectedColumns.includes(col.key) && col.key !== 'actions' && col.key !== 'marketPrice'
        )
        .map((col) => col.label);
      data.push(['产品清单']);
      data.push(headers);

      safeProducts.forEach((product) => {
        if (!product) return;
        const row: any[] = [];
        columns
          .filter(
            (col) =>
              selectedColumns.includes(col.key) &&
              col.key !== 'actions' &&
              col.key !== 'marketPrice'
          )
          .forEach((col) => {
            if (col.key === 'index') {
              row.push((safeProducts.indexOf(product) + 1).toString());
            } else if (col.key === 'name') {
              row.push(product.name || '');
            } else if (col.key === 'parameter_description') {
              row.push(product.parameter_description || '-');
            } else if (col.key === 'brand') {
              row.push(product.brand || '-');
            } else if (col.key === 'unit') {
              row.push(product.unit || '个');
            } else if (col.key === 'quantity') {
              row.push(product.quantity || 1);
            } else if (col.key === 'unitPrice') {
              row.push(product.unitPrice || 0);
            } else if (col.key === 'totalPrice') {
              row.push(product.totalPrice || 0);
            }
          });
        data.push(row);
      });

      data.push([]);

      data.push(['费用汇总']);
      data.push(['小计', subtotal]);
      data.push(['税费', `${feeConfig.taxRate}%`, taxAmount]);
      data.push(['运费', feeConfig.shipping]);
      data.push(['安装调试费', feeConfig.installation]);
      data.push(['其他费用', feeConfig.otherFees]);
      data.push(['总计（含税）', totalAmount]);
      data.push(['大写金额', formatAmountToChinese(totalAmount)]);
      data.push([]);

      data.push(['商务条款']);
      data.push(['付款方式', feeConfig.paymentTerms]);
      data.push(['质保期', feeConfig.warrantyTerms]);
      data.push(['交货期', feeConfig.deliveryTerms]);
      data.push(['报价有效期', formatDate(feeConfig.validUntil)]);

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [
        { wch: 20 },
        { wch: 40 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, '报价单');
      const fileName = `报价单_${quoteData?.quoteNumber || 'export'}_${new Date().getTime()}.xlsx`;
      XLSX.writeFile(wb, fileName);

    } catch (error) {
      console.error('[QuoteTable] Excel 导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // 导出 HTML 预览
  const handleExportHTML = async () => {
    setIsExporting(true);

    try {
      const htmlData = {
        quoteNumber: quoteData?.quoteNumber || '',
        supplierInfo: actualSupplierInfo,
        customerInfo: quoteData?.customerInfo || {},
        products: safeProducts,
        feeConfig: feeConfig,
        projectFields: projectFields,
        createdAt: quoteData?.createdAt,
        subtotal: subtotal,
        taxAmount: taxAmount,
        totalAmount: totalAmount,
        notes: quoteData?.notes,
      };


      const response = await fetch('/api/quotes/export-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(htmlData),
      });

      if (!response.ok) {
        throw new Error(`HTML生成失败: ${response.status}`);
      }

      const html = await response.text();

      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
      } else {
        alert('请允许浏览器弹出窗口');
      }

    } catch (error) {
      console.error('[QuoteTable] HTML 导出失败:', error);
      alert(`HTML导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 获取分组后的产品
  const getGroupedProducts = () => {
    const products = safeProducts;

    if (groupBy === 'none') {
      return { 全部产品: products };
    }

    const groups: Record<string, Product[]> = {};

    products.forEach((product) => {
      if (!product) return;

      let groupKey = '其他';
      if (groupBy === 'category' && product.category) {
        groupKey = product.category;
      } else if (groupBy === 'brand' && product.brand) {
        groupKey = product.brand;
      } else if (groupBy === 'system') {
        const name = product.name || '';
        if (name.includes('搅拌')) groupKey = '搅拌系统';
        else if (name.includes('泵')) groupKey = '泵系统';
        else if (name.includes('阀')) groupKey = '阀门系统';
        else if (name.includes('罐')) groupKey = '储罐系统';
        else if (name.includes('电机')) groupKey = '动力系统';
        else groupKey = '其他系统';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(product);
    });

    return groups;
  };

  // 切换行展开状态
  const toggleRowExpand = (rowIndex: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowIndex]: !prev[rowIndex],
    }));
  };

  // 切换备注显示
  const toggleNoteShow = (rowIndex: number) => {
    setShowNotes((prev) => ({
      ...prev,
      [rowIndex]: !prev[rowIndex],
    }));
  };

  const groupedProducts = getGroupedProducts();
  const quoteTitle = getQuoteTitle(safeProducts);

  const marketPriceCount = Object.values(marketPrices).filter((m) => m?.data).length;

  return (
    <div className="export-container bg-white">
      {/* 页眉 - 公司信息 */}
      <div className="bg-gradient-to-r from-[#0a4a7a] to-[#2c8c99] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {actualSupplierInfo?.logoUrl ? (
              <img
                src={actualSupplierInfo.logoUrl}
                alt={actualSupplierInfo.companyName}
                className="h-12 w-12 object-contain bg-white rounded-lg p-1"
              />
            ) : (
              <div className="p-2 bg-white/20 rounded-lg">
                <Building2 className="h-8 w-8 text-[#f9a825]" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">
                {actualSupplierInfo?.companyName || '报价单'}
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-white/80">
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {actualSupplierInfo?.phone}
                </span>
                <span className="flex items-center gap-1">
                  <MailIcon className="h-3.5 w-3.5" />
                  {actualSupplierInfo?.email}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-white/90 text-sm">报价单号</div>
            <div className="text-white font-bold text-lg">{quoteData?.quoteNumber || ''}</div>
            <div className="text-white/80 text-xs mt-1">
              日期：{formatDate(quoteData?.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {/* 标题区域 */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{quoteTitle}</h2>
            <p className="text-sm text-slate-500 mt-1">
              生成时间：{new Date().toLocaleString('zh-CN')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 自动填充开关 */}
            <div className="flex items-center gap-2 mr-2">
              <span className="text-sm text-slate-600">自动填充</span>
              <Switch checked={autoFillEnabled} onCheckedChange={setAutoFillEnabled} />
            </div>

            {/* 批量填充按钮 */}
            {hasZeroPriceProducts && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFillPrices}
                      disabled={fillPricesLoading}
                      className="border-[#f9a825] text-[#f9a825] hover:bg-[#f9a825] hover:text-white"
                    >
                      {fillPricesLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          填充中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          填充市场价
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>自动填充所有零价格产品的市场参考价</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* 批量查价 */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSearchAllMarketPrices}
                    disabled={isSearchingAll}
                    className="border-[#2c8c99] text-[#2c8c99] hover:bg-[#2c8c99] hover:text-white"
                  >
                    {isSearchingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        查询中...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        批量查价
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>查询所有产品的市场参考价</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 应用所有价格按钮 */}
            {marketPriceCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleApplyAllMarketPrices}
                      className="border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      应用全部 ({marketPriceCount})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>应用所有已查询到的市场价</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* 重新生成按钮 */}
            {onRegenerate && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      className="border-slate-300"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      重新生成
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>重新生成报价单</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* 导出按钮 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-300"
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      导出中...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      导出
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleDownloadExcel} className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
                  Excel文件
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportHTML} className="cursor-pointer">
                  <FileText className="h-4 w-4 mr-2 text-blue-600" />
                  HTML预览（可打印/保存PDF）
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 项目概况 */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            项目概况
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTempProjectFields(projectFields);
              setShowProjectConfig(true);
            }}
            className="h-8 text-xs"
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            自定义字段
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {/* 客户名称 */}
          <div key="project-field-客户名称" className="col-span-1">
            <div className="text-xs text-slate-500 mb-1">客户名称</div>
            {editingField && editingField.rowIndex === 0 ? (
              <Input
                value={editingField.value}
                onChange={(e) => handleProjectFieldChange(e.target.value)}
                onBlur={() => handleProjectFieldSave('name')}
                onKeyDown={(e) => e.key === 'Enter' && handleProjectFieldSave('name')}
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <div
                className="text-sm font-medium cursor-pointer hover:text-[#0a4a7a] hover:underline flex items-center gap-1 group"
                onClick={() => handleProjectFieldEdit('name', quoteData?.customerInfo?.name || '')}
              >
                {quoteData?.customerInfo?.name || '未填写'}
                <Edit className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100" />
              </div>
            )}
          </div>

          {/* 项目名称 */}
          <div key="project-field-项目名称" className="col-span-1">
            <div className="text-xs text-slate-500 mb-1">项目名称</div>
            {editingField && editingField.rowIndex === 1 ? (
              <Input
                value={editingField.value}
                onChange={(e) => handleProjectFieldChange(e.target.value)}
                onBlur={() => handleProjectFieldSave('projectName')}
                onKeyDown={(e) => e.key === 'Enter' && handleProjectFieldSave('projectName')}
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <div
                className="text-sm font-medium cursor-pointer hover:text-[#0a4a7a] hover:underline flex items-center gap-1 group"
                onClick={() =>
                  handleProjectFieldEdit('projectName', quoteData?.customerInfo?.projectName || '')
                }
              >
                {quoteData?.customerInfo?.projectName || '未填写'}
                <Edit className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100" />
              </div>
            )}
          </div>

          {/* 自定义项目字段 */}
          {projectFields.map((field, index) => {
            const fieldIndex = index;
            return (
              <div key={`project-field-${field.id}-${index}`} className="col-span-1 relative group">
                <div className="text-xs text-slate-500 mb-1">{field.name}</div>
                {editingCustomField?.fieldIndex === fieldIndex ? (
                  <Input
                    value={editingCustomField.value}
                    onChange={(e) => handleCustomFieldChange(e.target.value)}
                    onBlur={() => handleCustomFieldSave(fieldIndex)}
                    onKeyDown={(e) => handleCustomFieldKeyDown(e, fieldIndex)}
                    className="h-8 text-sm"
                    autoFocus
                  />
                ) : (
                  <div
                    className="text-sm font-medium cursor-pointer hover:text-[#0a4a7a] hover:underline flex items-center gap-1 group"
                    onClick={() => handleCustomFieldEdit(fieldIndex, field.value)}
                  >
                    {field.value || '-'}
                    <Edit className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 产品清单表格 */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Package className="h-4 w-4" />
            产品清单
          </h3>
          <div className="flex items-center gap-2">
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="分组方式" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((option) => (
                  <SelectItem key={`group-option-${option.key}`} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTempSelectedColumns(selectedColumns);
                setShowColumnConfig(true);
              }}
              className="h-8 text-xs"
            >
              <Settings className="h-3.5 w-3.5 mr-1" />
              显示列
            </Button>
          </div>
        </div>

        {/* 表格容器 */}
        <div
          className="quote-table-container rounded-lg border border-slate-200 overflow-auto"
          style={{ maxHeight: '600px' }}
        >
          <Table className="config-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHeader className="bg-[#0a4a7a] sticky top-0 z-10">
              <TableRow>
                {columns
                  .filter((col) => selectedColumns.includes(col.key))
                  .sort((a, b) => a.priority - b.priority)
                  .map((column) => (
                    <TableHead
                      key={`header-${column.key}`}
                      className={`text-white font-semibold py-3 px-4 ${
                        column.align === 'right'
                          ? 'text-right'
                          : column.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      }`}
                      style={{
                        width:
                          column.key === 'parameter_description'
                            ? '30%'
                            : column.key === 'name'
                              ? '20%'
                              : 'auto',
                        minWidth:
                          column.key === 'parameter_description'
                            ? '250px'
                            : column.key === 'name'
                              ? '150px'
                              : '80px',
                      }}
                    >
                      {column.label}
                    </TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedProducts).map(([groupName, products], groupIndex) => {
                const groupKey = `group-${groupName}-${groupIndex}`;
                return (
                  <React.Fragment key={groupKey}>
                    {groupName !== '全部产品' && (
                      <TableRow key={`group-header-${groupKey}`} className="bg-slate-100">
                        <TableCell
                          colSpan={selectedColumns.length}
                          className="py-2 px-4 font-semibold text-slate-700"
                        >
                          {groupName}
                        </TableCell>
                      </TableRow>
                    )}

                    {products
                      .filter((p) => p != null)
                      .map((product, idx) => {
                        if (!product) return null;

                        const actualIndex = safeProducts.findIndex(
                          (p) =>
                            p &&
                            p.name === product.name &&
                            p.model === product.model &&
                            p.parameter_description === product.parameter_description
                        );

                        const safeIndex = actualIndex !== -1 ? actualIndex : idx;
                        const marketData = marketPrices[safeIndex];
                        const isExpanded = expandedRows[safeIndex] || false;

                        const marketPriceValue =
                          marketData?.data?.averageMarketPrice ||
                          marketData?.data?.price ||
                          marketData?.data?.marketPrice ||
                          marketData?.data?.value ||
                          marketData?.data?.unitPrice ||
                          0;

                        const priceDiff =
                          marketPriceValue > 0
                            ? calculatePriceDiff(product.unitPrice || 0, marketPriceValue)
                            : null;

                        const productUniqueKey = product.id
                          ? `product-${product.id}`
                          : `product-${safeIndex}-${product.name || ''}-${product.model || ''}`;

                        return (
                          <TableRow
                            key={productUniqueKey}
                            className={`${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                            } hover:bg-slate-100 transition-colors`}
                          >
                            {selectedColumns.includes('index') && (
                              <TableCell
                                key={`cell-index-${productUniqueKey}`}
                                className="text-center py-3 px-4 text-sm"
                              >
                                {safeIndex + 1}
                              </TableCell>
                            )}

                            {selectedColumns.includes('name') && (
                              <TableCell
                                key={`cell-name-${productUniqueKey}`}
                                className="py-3 px-4"
                                style={{
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  maxWidth: '200px',
                                  minWidth: '150px',
                                }}
                              >
                                <div className="flex items-start gap-1">
                                  <span
                                    className="font-medium text-sm"
                                    style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                  >
                                    {product.name || ''}
                                  </span>
                                  {product.note && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Info className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{product.note}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {(product.parameter_description?.length || 0) > 100 && (
                                    <button
                                      onClick={() => toggleRowExpand(safeIndex)}
                                      className="text-[#2c8c99] hover:text-[#1e6a73] ml-1 flex-shrink-0"
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            )}

                            {selectedColumns.includes('parameter_description') && (
                              <TableCell
                                key={`cell-specs-${productUniqueKey}`}
                                className="py-3 px-4"
                                style={{
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  maxWidth: '400px',
                                  minWidth: '250px',
                                }}
                              >
                                <div
                                  className="text-sm text-slate-600"
                                  style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                >
                                  {isExpanded
                                    ? product.parameter_description
                                    : product.parameter_description &&
                                        product.parameter_description.length > 150
                                      ? product.parameter_description.substring(0, 150) + '...'
                                      : product.parameter_description || '-'}
                                </div>
                              </TableCell>
                            )}

                            {selectedColumns.includes('brand') && (
                              <TableCell
                                key={`cell-brand-${productUniqueKey}`}
                                className="py-3 px-4 text-sm"
                              >
                                {product.brand || '-'}
                              </TableCell>
                            )}

                            {selectedColumns.includes('unit') && (
                              <TableCell
                                key={`cell-unit-${productUniqueKey}`}
                                className="text-center py-3 px-4 text-sm"
                              >
                                {product.unit || '个'}
                              </TableCell>
                            )}

                            {selectedColumns.includes('quantity') && (
                              <TableCell
                                key={`cell-quantity-${productUniqueKey}`}
                                className="text-center py-3 px-4"
                              >
                                {editingQuantity && editingQuantity.rowIndex === safeIndex ? (
                                  <Input
                                    type="number"
                                    value={editingQuantity.value}
                                    onChange={(e) => handleQuantityChange(e.target.value)}
                                    onBlur={() => handleQuantitySave(safeIndex)}
                                    onKeyDown={(e) => handleKeyDown(e, safeIndex, 'quantity')}
                                    className="w-20 h-8 px-2 text-center text-sm cursor-pointer focus:ring-2 focus:ring-[#0a4a7a]"
                                    autoFocus
                                    min="0.01"
                                    step="0.01"
                                  />
                                ) : (
                                  <div
                                    className="cursor-pointer hover:text-[#0a4a7a] hover:underline px-2 py-1 text-sm"
                                    onClick={() =>
                                      handleQuantityEdit(safeIndex, product.quantity || 1)
                                    }
                                  >
                                    {product.quantity || 1}
                                  </div>
                                )}
                              </TableCell>
                            )}

                            {selectedColumns.includes('unitPrice') && (
                              <TableCell
                                key={`cell-unitPrice-${productUniqueKey}`}
                                className="text-right py-3 px-4"
                              >
                                {editingPrice && editingPrice.rowIndex === safeIndex ? (
                                  <Input
                                    type="number"
                                    value={editingPrice.value}
                                    onChange={(e) => handlePriceChange(e.target.value)}
                                    onBlur={() => handlePriceSave(safeIndex)}
                                    onKeyDown={(e) => handleKeyDown(e, safeIndex, 'price')}
                                    className="w-24 h-8 px-2 text-right text-sm cursor-pointer focus:ring-2 focus:ring-[#0a4a7a]"
                                    autoFocus
                                    min="0"
                                    step="0.01"
                                  />
                                ) : (
                                  <div
                                    className="cursor-pointer hover:text-[#0a4a7a] hover:underline px-2 py-1 font-bold text-[#d32f2f] text-sm"
                                    onClick={() =>
                                      handlePriceEdit(safeIndex, product.unitPrice || 0)
                                    }
                                  >
                                    {formatCurrency(product.unitPrice || 0)}
                                  </div>
                                )}
                              </TableCell>
                            )}

                            {selectedColumns.includes('totalPrice') && (
                              <TableCell
                                key={`cell-totalPrice-${productUniqueKey}`}
                                className="text-right py-3 px-4 font-bold text-sm"
                              >
                                {formatCurrency(product.totalPrice || 0)}
                              </TableCell>
                            )}

                            {selectedColumns.includes('marketPrice') && (
                              <TableCell
                                key={`cell-marketPrice-${productUniqueKey}`}
                                className="text-right py-3 px-4"
                              >
                                {marketData?.loading ? (
                                  <div className="flex items-center justify-end gap-2 text-[#2c8c99]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-sm">搜索中</span>
                                  </div>
                                ) : marketData?.data ? (
                                  <div className="text-right space-y-2">
                                    <div>
                                      <div className="font-semibold text-[#2c8c99] text-sm">
                                        {(() => {
                                          const data = marketData.data;
                                          const priceValue =
                                            data.averageMarketPrice ||
                                            data.price ||
                                            data.marketPrice ||
                                            data.value ||
                                            data.unitPrice ||
                                            0;
                                          return priceValue > 0
                                            ? `¥${priceValue.toFixed(2)}`
                                            : '价格待确认';
                                        })()}
                                      </div>
                                      {priceDiff && (
                                        <div
                                          className={`text-xs font-semibold flex items-center justify-end gap-1 ${
                                            priceDiff.isLower ? 'text-green-600' : 'text-red-600'
                                          }`}
                                        >
                                          {priceDiff.isLower ? (
                                            <TrendingDown className="h-3 w-3" />
                                          ) : (
                                            <TrendingUp className="h-3 w-3" />
                                          )}
                                          <span>{Math.abs(priceDiff.percentage).toFixed(1)}%</span>
                                        </div>
                                      )}
                                    </div>

                                    {marketData.showConfirm && (
                                      <div className="flex items-center justify-end gap-1 pt-2 border-t border-slate-200">
                                        <Button
                                          size="sm"
                                          className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                                          onClick={() => handleApplyMarketPrice(safeIndex)}
                                        >
                                          <CheckCircle2 className="h-3 w-3 mr-1" />
                                          应用
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => handleDismissMarketPrice(safeIndex)}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 text-[#2c8c99]"
                                          onClick={() => handleSearchMarketPrice(safeIndex)}
                                        >
                                          <Search className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>获取市场参考价</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </TableCell>
                            )}

                            {selectedColumns.includes('rating') && (
                              <TableCell key={`cell-rating-${productUniqueKey}`} className="text-center py-3 px-4">
                                {product.rating != null && product.rating > 0
                                  ? <span className="text-yellow-500 text-sm">{'★'.repeat(Math.round(product.rating))}{'☆'.repeat(5 - Math.round(product.rating))} {product.rating.toFixed(1)}</span>
                                  : <span className="text-xs text-muted-foreground">-</span>
                                }
                              </TableCell>
                            )}

                            {selectedColumns.includes('quoteCount') && (
                              <TableCell key={`cell-quoteCount-${productUniqueKey}`} className="text-center py-3 px-4">
                                {product.quoteCount != null && product.quoteCount > 0
                                  ? <span className="text-sm">{product.quoteCount}</span>
                                  : <span className="text-xs text-muted-foreground">-</span>
                                }
                              </TableCell>
                            )}

                            {selectedColumns.includes('actions') && (
                              <TableCell
                                key={`cell-actions-${productUniqueKey}`}
                                className="text-center py-3 px-4"
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setExpandedRows((prev) => ({
                                          ...prev,
                                          [safeIndex]: !prev[safeIndex],
                                        }));
                                      }}
                                    >
                                      {isExpanded ? (
                                        <>
                                          <ChevronUp className="h-4 w-4 mr-2" />
                                          收起规格
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="h-4 w-4 mr-2" />
                                          展开规格
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (product.note) {
                                          toggleNoteShow(safeIndex);
                                        }
                                      }}
                                      disabled={!product.note}
                                    >
                                      <Info className="h-4 w-4 mr-2" />
                                      查看备注
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={() => handleRemoveProduct(safeIndex)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      移除
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 费用汇总 */}
      <div className="px-6 py-4 border-t border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            费用汇总
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTempFeeConfig(feeConfig);
              setShowFeeConfig(true);
            }}
            className="h-8 text-xs"
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            费用配置
          </Button>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">小计：</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 flex items-center gap-1">
                  税费 ({feeConfig.taxRate}%)：
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleFeeEdit('taxRate', feeConfig.taxRate)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </span>
                {editingFee?.field === 'taxRate' ? (
                  <Input
                    type="number"
                    value={editingFee.value}
                    onChange={(e) => handleFeeChange(e.target.value)}
                    onBlur={() => handleFeeSave('taxRate')}
                    onKeyDown={(e) => e.key === 'Enter' && handleFeeSave('taxRate')}
                    className="w-20 h-7 text-right text-sm"
                    autoFocus
                    min="0"
                    max="100"
                    step="1"
                  />
                ) : (
                  <span className="font-medium">{formatCurrency(taxAmount)}</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 flex items-center gap-1">
                  运费：
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleFeeEdit('shipping', feeConfig.shipping)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </span>
                {editingFee?.field === 'shipping' ? (
                  <Input
                    type="number"
                    value={editingFee.value}
                    onChange={(e) => handleFeeChange(e.target.value)}
                    onBlur={() => handleFeeSave('shipping')}
                    onKeyDown={(e) => e.key === 'Enter' && handleFeeSave('shipping')}
                    className="w-20 h-7 text-right text-sm"
                    autoFocus
                    min="0"
                    step="0.01"
                  />
                ) : (
                  <span className="font-medium">{formatCurrency(feeConfig.shipping)}</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 flex items-center gap-1">
                  安装调试费：
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleFeeEdit('installation', feeConfig.installation)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </span>
                {editingFee?.field === 'installation' ? (
                  <Input
                    type="number"
                    value={editingFee.value}
                    onChange={(e) => handleFeeChange(e.target.value)}
                    onBlur={() => handleFeeSave('installation')}
                    onKeyDown={(e) => e.key === 'Enter' && handleFeeSave('installation')}
                    className="w-20 h-7 text-right text-sm"
                    autoFocus
                    min="0"
                    step="0.01"
                  />
                ) : (
                  <span className="font-medium">{formatCurrency(feeConfig.installation)}</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 flex items-center gap-1">
                  其他费用：
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => handleFeeEdit('otherFees', feeConfig.otherFees)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </span>
                {editingFee?.field === 'otherFees' ? (
                  <Input
                    type="number"
                    value={editingFee.value}
                    onChange={(e) => handleFeeChange(e.target.value)}
                    onBlur={() => handleFeeSave('otherFees')}
                    onKeyDown={(e) => e.key === 'Enter' && handleFeeSave('otherFees')}
                    className="w-20 h-7 text-right text-sm"
                    autoFocus
                    min="0"
                    step="0.01"
                  />
                ) : (
                  <span className="font-medium">{formatCurrency(feeConfig.otherFees)}</span>
                )}
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-base">
                <span>总计（含税）：</span>
                <span className="text-[#d32f2f]">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>大写金额：</span>
                <span>{formatAmountToChinese(totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 商务条款 */}
      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          商务条款
        </h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500 mb-1">付款方式</div>
            <div className="font-medium">{feeConfig.paymentTerms}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">质保期</div>
            <div className="font-medium">{feeConfig.warrantyTerms}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">交货期</div>
            <div className="font-medium">{feeConfig.deliveryTerms}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">报价有效期</div>
            <div className="font-medium">{formatDate(feeConfig.validUntil)}</div>
          </div>
        </div>
      </div>

      {/* 备注 */}
      {quoteData?.notes && (
        <div className="px-6 py-3 border-t border-slate-200 text-sm text-slate-600">
          <span className="font-medium">备注：</span> {quoteData.notes}
        </div>
      )}

      {/* 账户信息 */}
      <div className="px-6 py-4 border-t border-slate-200 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span>开户银行：{actualSupplierInfo?.bankName || '未填写'}</span>
          <span>银行账号：{actualSupplierInfo?.bankAccount || '未填写'}</span>
          <span>统一社会信用代码：{actualSupplierInfo?.taxNumber || '未填写'}</span>
        </div>
      </div>

      {/* 页脚 */}
      <div className="px-6 py-3 text-center text-xs text-slate-400 border-t border-slate-200">
        本报价单由我司工程师校核生成，如有疑问请联系我们【电话：
        {actualSupplierInfo?.phone || '待填写'}】
      </div>

      {/* 费用配置弹窗 */}
      <Dialog open={showFeeConfig} onOpenChange={setShowFeeConfig}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>费用配置</DialogTitle>
            <DialogDescription>设置税率、运费和其他费用，以及商务条款。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">费用设置</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taxRate">税率 (%)</Label>
                  <Select
                    value={tempFeeConfig.taxRate.toString()}
                    onValueChange={(value) =>
                      setTempFeeConfig({ ...tempFeeConfig, taxRate: parseFloat(value) })
                    }
                  >
                    <SelectTrigger id="taxRate">
                      <SelectValue placeholder="选择税率" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TAX_RATES.map((rate) => (
                        <SelectItem key={`tax-${rate}`} value={rate.toString()}>
                          {rate}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping">运费 (元)</Label>
                  <Input
                    id="shipping"
                    type="number"
                    value={tempFeeConfig.shipping}
                    onChange={(e) =>
                      setTempFeeConfig({
                        ...tempFeeConfig,
                        shipping: parseFloat(e.target.value) || 0,
                      })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="installation">安装调试费 (元)</Label>
                  <Input
                    id="installation"
                    type="number"
                    value={tempFeeConfig.installation}
                    onChange={(e) =>
                      setTempFeeConfig({
                        ...tempFeeConfig,
                        installation: parseFloat(e.target.value) || 0,
                      })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otherFees">其他费用 (元)</Label>
                  <Input
                    id="otherFees"
                    type="number"
                    value={tempFeeConfig.otherFees}
                    onChange={(e) =>
                      setTempFeeConfig({
                        ...tempFeeConfig,
                        otherFees: parseFloat(e.target.value) || 0,
                      })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-medium text-sm">商务条款</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">付款方式</Label>
                  <Input
                    id="paymentTerms"
                    value={tempFeeConfig.paymentTerms}
                    onChange={(e) =>
                      setTempFeeConfig({ ...tempFeeConfig, paymentTerms: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warrantyTerms">质保期</Label>
                  <Input
                    id="warrantyTerms"
                    value={tempFeeConfig.warrantyTerms}
                    onChange={(e) =>
                      setTempFeeConfig({ ...tempFeeConfig, warrantyTerms: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliveryTerms">交货期</Label>
                  <Input
                    id="deliveryTerms"
                    value={tempFeeConfig.deliveryTerms}
                    onChange={(e) =>
                      setTempFeeConfig({ ...tempFeeConfig, deliveryTerms: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validUntil">报价有效期</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={tempFeeConfig.validUntil}
                    onChange={(e) =>
                      setTempFeeConfig({ ...tempFeeConfig, validUntil: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelFeeConfig}>
              取消
            </Button>
            <Button onClick={handleSaveFeeConfig}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 显示列配置弹窗 */}
      <Dialog open={showColumnConfig} onOpenChange={setShowColumnConfig}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>显示列配置</DialogTitle>
            <DialogDescription>选择要在表格中显示的列。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {columns.map((column) => {
              const isRequired = column.key === 'unitPrice' || column.key === 'totalPrice';
              return (
                <div
                  key={`column-${column.key}`}
                  className={`flex items-center space-x-2 ${isRequired ? 'opacity-60' : ''}`}
                >
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={tempSelectedColumns.includes(column.key)}
                    disabled={isRequired}
                    onCheckedChange={() => toggleColumnVisibility(column.key)}
                  />
                  <Label
                    htmlFor={`col-${column.key}`}
                    className={isRequired ? 'flex items-center gap-1' : ''}
                  >
                    {column.label}
                    {isRequired && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        必选
                      </Badge>
                    )}
                  </Label>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelColumnConfig}>
              取消
            </Button>
            <Button onClick={handleSaveColumnConfig}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 自定义字段配置弹窗 */}
      <Dialog open={showProjectConfig} onOpenChange={setShowProjectConfig}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>自定义字段</DialogTitle>
            <DialogDescription>添加、编辑或删除项目概况中的自定义字段。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {tempProjectFields.map((field, index) => (
                <div
                  key={`field-${field.id}-${index}`}
                  className="flex items-center gap-2 p-2 border rounded-md"
                >
                  <Input
                    value={field.name}
                    onChange={(e) => handleUpdateProjectField(field.id, 'name', e.target.value)}
                    placeholder="字段名称"
                    className="flex-1"
                  />
                  <Input
                    value={field.value}
                    onChange={(e) => handleUpdateProjectField(field.id, 'value', e.target.value)}
                    placeholder="字段值"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-600"
                    onClick={() => handleRemoveProjectField(field.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 p-2 border rounded-md bg-slate-50">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="新字段名称"
                className="flex-1"
              />
              <Input
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                placeholder="字段值"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-green-600"
                onClick={handleAddProjectField}
                disabled={!newFieldName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelProjectFields}>
              取消
            </Button>
            <Button onClick={handleSaveProjectFields}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
