'use client';

import { useState, useEffect } from 'react';
import { domToPng, domToSvg } from 'modern-screenshot';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Phone,
  Mail,
  User,
  Search,
  TrendingUp,
  TrendingDown,
  Loader2,
  Building2,
  DollarSign,
  Calendar,
  CheckCircle,
  FileDown,
  AlertCircle,
  Edit,
  Plus,
  X,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Truck,
  Wrench,
  MoreHorizontal,
  CreditCard,
  MapPin,
  FileText as FileIcon,
  Info as InfoIcon,
  Heart,
  CheckCircle2
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type {
  SupplierInfo,
  QuoteData,
  TableColumnConfig,
  GroupType,
  FeeConfig,
  FeeSummary,
  ProjectField,
  Product
} from '@/types/quote';
import {
  calculateFeeSummary,
  groupProducts,
  formatAmountToChinese,
  getQuoteTitle,
  getTotalTitle,
  calculatePriceDiff,
  calculateProductTotal
} from '@/lib/quote-utils';
import { DEFAULT_TABLE_COLUMNS, DEFAULT_PROJECT_FIELDS, DEFAULT_FEE_CONFIG, COMMON_TAX_RATES } from '@/types/quote';

interface QuoteTableProps {
  data: QuoteData;
  supplierInfo?: SupplierInfo;
  onUpdateProductPrice?: (productIndex: number, newPrice: number) => void;
  onUpdateFeeConfig?: (feeConfig: FeeConfig) => void;
  onAddProjectField?: () => void;
  onUpdateProjectField?: (fieldIndex: number, field: ProjectField) => void;
  onRemoveProjectField?: (fieldIndex: number) => void;
}

export default function QuoteTable({
  data,
  supplierInfo,
  onUpdateProductPrice,
  onUpdateFeeConfig,
  onAddProjectField,
  onUpdateProjectField,
  onRemoveProjectField
}: QuoteTableProps) {
  const actualSupplierInfo = data.supplierInfo || supplierInfo;

  // 表格配置
  const [columns, setColumns] = useState<TableColumnConfig[]>(
    data.tableConfig?.columns || DEFAULT_TABLE_COLUMNS
  );
  const [groupType, setGroupType] = useState<GroupType>(
    data.tableConfig?.groupType || 'none'
  );

  // 项目概况字段
  const [projectFields, setProjectFields] = useState<ProjectField[]>(
    data.projectFields?.length > 0 ? data.projectFields : DEFAULT_PROJECT_FIELDS
  );

  // 费用配置
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(data.feeConfig || DEFAULT_FEE_CONFIG);

  // 费用汇总
  const [feeSummary, setFeeSummary] = useState<FeeSummary>(
    data.feeSummary || calculateFeeSummary(data.products || [], feeConfig)
  );

  // 编辑状态
  const [editingField, setEditingField] = useState<number | null>(null);

  // 市场价数据状态
  const [marketPrices, setMarketPrices] = useState<Record<number, {
    loading: boolean;
    data: any;
    error: string | null;
    showConfirm: boolean;
  }>>({});

  // 填充价格加载状态
  const [isFillingPrices, setIsFillingPrices] = useState(false);

  // 检测是否有0价格产品
  const hasZeroPriceProducts = data.products && data.products.some(p => !p.unitPrice || p.unitPrice === 0);

  // 计算费用汇总
  useEffect(() => {
    const summary = calculateFeeSummary(data.products || [], feeConfig);
    setFeeSummary(summary);
  }, [data.products, feeConfig]);

  // 监听费用配置变化
  useEffect(() => {
    if (onUpdateFeeConfig) {
      onUpdateFeeConfig(feeConfig);
    }
  }, [feeConfig, onUpdateFeeConfig]);

  // 动态调整表格布局
  useEffect(() => {
    const adjustTableLayout = () => {
      const tables = document.querySelectorAll('.config-table');
      tables.forEach((table) => {
        if (!(table instanceof HTMLTableElement)) return;

        const container = table.parentElement;
        if (!container) return;

        const containerWidth = container.clientWidth;

        // 获取所有单元格内容
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) return;

        const columnCount = rows[0]?.cells.length || 0;
        if (columnCount === 0) return;

        // 计算每列内容的最大宽度
        const maxWidths = new Array(columnCount).fill(0);

        rows.forEach((row) => {
          Array.from(row.cells).forEach((cell, index) => {
            // 创建临时元素测量实际内容宽度
            const span = document.createElement('span');
            span.style.visibility = 'hidden';
            span.style.position = 'absolute';
            span.style.whiteSpace = 'nowrap';
            span.style.fontSize = window.getComputedStyle(cell).fontSize;
            span.style.fontWeight = window.getComputedStyle(cell).fontWeight;
            span.textContent = cell.textContent || '';

            document.body.appendChild(span);
            const width = span.offsetWidth + 20; // 加一些padding
            document.body.removeChild(span);

            maxWidths[index] = Math.max(maxWidths[index], width);
          });
        });

        // 判断是否需要横向布局
        const totalWidth = maxWidths.reduce((a, b) => a + b, 0);
        const needsLandscape = totalWidth > containerWidth;

        // 如果需要横向布局，记录日志
        if (needsLandscape) {
          console.log('[Table] 表格较宽，建议使用横向PDF');
        }

        // 移除固定宽度，让浏览器自动计算
        Array.from(table.querySelectorAll('th')).forEach((th) => {
          th.style.width = 'auto';
        });
      });
    };

    // 延迟执行，确保DOM已渲染
    const timer = setTimeout(() => {
      adjustTableLayout();
    }, 100);

    // 监听窗口大小变化
    const handleResize = () => {
      adjustTableLayout();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [data.products, columns]);

  // 一键填充市场参考价
  const handleFillPrices = async () => {
    if (!data.products || data.products.length === 0) return;

    setIsFillingPrices(true);

    try {
      const zeroPriceProducts = data.products.map((p, idx) => ({ ...p, originalIndex: idx }))
        .filter(p => !p.unitPrice || p.unitPrice === 0);

      if (zeroPriceProducts.length === 0) {
        alert('没有需要填充价格的产品');
        setIsFillingPrices(false);
        return;
      }

      const response = await fetch('/api/quotes/batch-market-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: zeroPriceProducts.map(p => ({
            originalIndex: p.originalIndex,
            name: p.name,
            specifications: p.specifications || p.model || '',
          })),
        }),
      });

      const result = await response.json();

      if (response.ok && result.data) {
        // 批量更新价格
        let updatedCount = 0;
        result.data.forEach((item: any) => {
          if (item.originalIndex !== undefined && item.averageMarketPrice) {
            if (onUpdateProductPrice) {
              onUpdateProductPrice(item.originalIndex, item.averageMarketPrice);
              updatedCount++;
            }
          }
        });

        alert(`成功填充 ${updatedCount} 个产品的市场参考价`);
        
        // 触发填充完成事件，通知父组件更新消息状态
        window.dispatchEvent(new CustomEvent('fill-market-prices-complete', {
          detail: {
            success: true,
            count: updatedCount,
            quoteNumber: data.quoteNumber
          }
        }));
      } else {
        alert('填充失败：' + (result.error || '未知错误'));
        
        // 触发填充失败事件
        window.dispatchEvent(new CustomEvent('fill-market-prices-complete', {
          detail: {
            success: false,
            error: result.error || '未知错误',
            quoteNumber: data.quoteNumber
          }
        }));
      }
    } catch (error) {
      console.error('填充市场价失败:', error);
      alert('网络错误，请稍后重试');
    } finally {
      setIsFillingPrices(false);
    }
  };

  // 监听填充价格事件
  useEffect(() => {
    const handleFillPricesEvent = () => {
      console.log('[QuoteTable] 收到填充价格事件');
      
      // 检查是否是页面上最新的QuoteTable（只填充最新的报价单）
      const allQuoteTables = document.querySelectorAll('.export-container');
      const thisTable = document.querySelector(`[data-quote-id="${data.quoteNumber}"]`);
      
      if (allQuoteTables.length > 1 && thisTable) {
        // 如果有多个QuoteTable，检查这个是否是最后一个
        const lastIndex = allQuoteTables.length - 1;
        if (allQuoteTables[lastIndex] !== thisTable) {
          console.log('[QuoteTable] 不是最新的报价单，跳过填充');
          return;
        }
      }
      
      handleFillPrices();
    };

    window.addEventListener('fill-market-prices', handleFillPricesEvent);

    return () => {
      window.removeEventListener('fill-market-prices', handleFillPricesEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜索市场参考价
  const handleSearchMarketPrice = async (productIndex: number) => {
    const product = data.products[productIndex];
    if (!product) return;

    setMarketPrices(prev => ({
      ...prev,
      [productIndex]: {
        loading: true,
        data: null,
        error: null,
        showConfirm: false,
      },
    }));

    try {
      const response = await fetch('/api/quotes/market-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: product.name,
          specifications: product.specifications || product.model || '',
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setMarketPrices(prev => ({
          ...prev,
          [productIndex]: {
            loading: false,
            data: result,
            error: null,
            showConfirm: true,
          },
        }));
      } else {
        setMarketPrices(prev => ({
          ...prev,
          [productIndex]: {
            loading: false,
            data: null,
            error: result.error || '获取失败',
            showConfirm: false,
          },
        }));
      }
    } catch (error) {
      setMarketPrices(prev => ({
        ...prev,
        [productIndex]: {
          loading: false,
          data: null,
          error: '网络错误',
          showConfirm: false,
        },
      }));
    }
  };

  // 应用市场参考价
  const handleApplyMarketPrice = (productIndex: number) => {
    const marketData = marketPrices[productIndex];
    if (!marketData?.data?.averageMarketPrice || !onUpdateProductPrice) return;

    onUpdateProductPrice(productIndex, marketData.data.averageMarketPrice);

    setMarketPrices(prev => ({
      ...prev,
      [productIndex]: {
        ...prev[productIndex],
        showConfirm: false,
      },
    }));
  };

  // 放弃市场参考价
  const handleDismissMarketPrice = (productIndex: number) => {
    setMarketPrices(prev => ({
      ...prev,
      [productIndex]: {
        loading: false,
        data: null,
        error: null,
        showConfirm: false,
      },
    }));
  };

  // 更新费用配置
  const handleUpdateFeeConfig = (field: keyof FeeConfig, value: number) => {
    setFeeConfig(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // 更新项目概况字段
  const handleUpdateProjectField = (fieldIndex: number, value: string) => {
    const updatedFields = [...projectFields];
    updatedFields[fieldIndex].value = value;
    setProjectFields(updatedFields);

    if (onUpdateProjectField) {
      onUpdateProjectField(fieldIndex, updatedFields[fieldIndex]);
    }
  };

  // 添加项目概况字段
  const handleAddProjectField = () => {
    const newField: ProjectField = {
      label: '新字段',
      value: '',
      editable: true,
    };
    setProjectFields([...projectFields, newField]);

    if (onAddProjectField) {
      onAddProjectField();
    }
  };

  // 删除项目概况字段
  const handleRemoveProjectField = (fieldIndex: number) => {
    const updatedFields = projectFields.filter((_, index) => index !== fieldIndex);
    setProjectFields(updatedFields);

    if (onRemoveProjectField) {
      onRemoveProjectField(fieldIndex);
    }
  };

  // 下载Excel
  const handleDownloadExcel = async () => {
    try {
      const response = await fetch('/api/quotes/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            ...data,
            projectFields,
            feeConfig,
            feeSummary,
            tableConfig: {
              columns,
              groupType,
            },
          },
          format: 'excel'
        }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${getQuoteTitle(data.products || [])}_${data.quoteNumber}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download Excel:', error);
    }
  };

  // 检测是否需要强制分页
  const needsPageBreak = (element: HTMLElement, pageHeight: number = 1123): boolean => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > pageHeight;
  };

  // 在导出前添加分页标记
  const addPageBreaks = () => {
    // 移除之前可能存在的分页标记和续表表头
    const existingMarkers = document.querySelectorAll('.page-break-marker');
    existingMarkers.forEach(marker => marker.remove());

    const existingContinueHeaders = document.querySelectorAll('.continue-table-indicator');
    existingContinueHeaders.forEach(header => header.closest('tr')?.remove());

    // 设置A4纸尺寸（像素，2倍scale）
    const pageWidth = 1588; // A4宽度（210mm @ 96dpi * 2scale = 794px）
    const pageHeight = 2246; // A4高度（297mm @ 96dpi * 2scale = 1123px）
    const margin = 40;
    const contentHeight = pageHeight - 2 * margin;

    // 获取导出容器
    const container = document.querySelector('.export-container') as HTMLElement;
    if (!container) return;

    // 计算容器在截图时的实际宽度（scale=2）
    const containerWidth = 1600; // 固定宽度
    const containerHeight = container.scrollHeight;

    // 移除所有可能的overflow限制，确保scrollHeight准确
    const overflowElements = [container, ...Array.from(container.querySelectorAll('*'))] as HTMLElement[];
    overflowElements.forEach(el => {
      const computedStyle = window.getComputedStyle(el);
      if (computedStyle.overflow === 'hidden' || 
          computedStyle.overflowX === 'hidden' || 
          computedStyle.overflowY === 'hidden') {
        // 临时记录原始overflow值
        if (!el.dataset.originalOverflowBreak) {
          el.dataset.originalOverflowBreak = el.style.overflow;
        }
        el.style.overflow = 'visible';
      }
    });

    // 强制浏览器重新计算布局
    void container.offsetHeight;

    // 使用scrollHeight作为最终高度
    const finalContainerHeight = container.scrollHeight;

    console.log('[PageBreak] 容器尺寸:', {
      containerWidth,
      scrollHeight: container.scrollHeight,
      scrollWidth: container.scrollWidth,
      clientHeight: container.clientHeight,
      最终容器高度: finalContainerHeight,
      contentHeight
    });

    // 计算需要多少页
    const pageCount = Math.ceil(finalContainerHeight / contentHeight);
    console.log('[PageBreak] 需要的页数:', pageCount);

    // 计算每个分页点的位置（像素）
    const breakPoints: number[] = [];
    for (let i = 1; i < pageCount; i++) {
      breakPoints.push(i * contentHeight);
    }

    console.log('[PageBreak] 分页点位置:', breakPoints);

    // 特殊处理表格分页 - 确保表格行不被截断
    const table = document.querySelector('.config-table') as HTMLElement;
    if (table) {
      const tableTop = table.offsetTop;
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const headerHeight = table.querySelector('thead tr')?.clientHeight || 40;

      console.log('[PageBreak] 表格位置:', tableTop);
      console.log('[PageBreak] 表格行数:', rows.length);
      console.log('[PageBreak] 表头高度:', headerHeight);

      // 计算每个表格行的位置
      let currentY = tableTop + headerHeight;
      const rowPositions: Array<{ element: HTMLElement; top: number; bottom: number }> = [];

      rows.forEach((row) => {
        const rowHeight = row.clientHeight;
        const rowElement = row as HTMLElement;
        rowPositions.push({
          element: rowElement,
          top: currentY,
          bottom: currentY + rowHeight
        });
        currentY += rowHeight;
      });

      console.log('[PageBreak] 表格行位置:', rowPositions.map(r => ({
        top: r.top,
        bottom: r.bottom,
        height: r.bottom - r.top
      })));

      // 调整分页点，确保不在表格行的中间
      const adjustedBreakPoints = breakPoints.map(breakPoint => {
        // 查找该分页点所在的表格行
        const affectedRow = rowPositions.find(r => breakPoint > r.top && breakPoint < r.bottom);

        if (affectedRow) {
          // 如果分页点在表格行的中间，移动到该行的顶部
          console.log('[PageBreak] 分页点', breakPoint, '在表格行中间，移动到', affectedRow.top);
          return affectedRow.top;
        }

        return breakPoint;
      });

      console.log('[PageBreak] 调整后的分页点:', adjustedBreakPoints);

      // 在每个分页点插入视觉标记（用于调试，实际可以删除）
      adjustedBreakPoints.forEach((point, index) => {
        const marker = document.createElement('div');
        marker.className = 'page-break-marker';
        marker.style.position = 'absolute';
        marker.style.top = `${point}px`;
        marker.style.left = '0';
        marker.style.right = '0';
        marker.style.height = '2px';
        marker.style.background = 'transparent'; // 改为透明
        marker.style.zIndex = '9999';
        marker.dataset.pageBreakIndex = index.toString();
        marker.dataset.pageBreakValue = point.toString(); // 保存分页点的值
        container.appendChild(marker);
        console.log('[PageBreak] 插入分页标记 at', point, 'index:', index);
      });

      // 在需要分页的表格行前添加表头（续表）
      if (pageCount > 1 && adjustedBreakPoints.length > 0) {
        adjustedBreakPoints.forEach((point, index) => {
          const rowIndex = rowPositions.findIndex(r => r.top === point);
          if (rowIndex > 0 && rowIndex < rows.length) {
            const headerRow = table.querySelector('thead tr')?.cloneNode(true) as HTMLElement;
            if (headerRow) {
              // 添加续表标识
              const headerCell = headerRow.querySelector('th');
              if (headerCell) {
                const continueText = document.createElement('div');
                continueText.className = 'continue-table-indicator';
                continueText.textContent = '（续表）';
                continueText.style.fontSize = '12px';
                continueText.style.color = '#666';
                continueText.style.marginBottom = '4px';
                headerCell.insertBefore(continueText, headerCell.firstChild);
              }

              // 在分页点后的第一个表格行前插入表头
              const nextRow = rows[rowIndex];
              if (nextRow) {
                nextRow.parentNode?.insertBefore(headerRow, nextRow);
                console.log('[PageBreak] 在行', rowIndex, '前插入续表表头');
              }
            }
          }
        });
      }
    }
  };

  // 强制应用列宽
  const forceColumnWidths = () => {
    const table = document.querySelector('.config-table');
    if (!table) return;
    
    // 确保 table-layout 为 fixed
    (table as HTMLElement).style.setProperty('table-layout', 'fixed', 'important');
    (table as HTMLElement).style.setProperty('width', '100%', 'important');
    
    // 获取所有可见的表头（不包含hidden的）
    const headers = Array.from(table.querySelectorAll('th')).filter(th => !th.classList.contains('hidden'));
    const columnWidths = [
      '4%',   // 序号
      '14%',  // 产品名称 - 超宽强制换行
      '22%',  // 规格型号 - 超宽强制换行
      '8%',   // 品牌 - 超宽强制换行
      '5%',   // 单位 - 超宽强制换行
      '6%',   // 数量 - 超宽强制换行
      '12%',  // 单价 - 超宽强制换行
      '15%'   // 总价 - 超宽强制换行
    ];
    
    if (headers.length >= 8) {
      // 设置每个表头的宽度（百分比），使用!important确保生效
      columnWidths.forEach((width, index) => {
        (headers[index] as HTMLElement).style.setProperty('width', width, 'important');
        (headers[index] as HTMLElement).style.setProperty('max-width', width, 'important');
        (headers[index] as HTMLElement).style.setProperty('min-width', width, 'important');
      });
    }
    
    // 同时也设置表格中所有单元格的列宽（只设置可见的单元格）
    const allRows = table.querySelectorAll('tr');
    allRows.forEach(row => {
      const visibleCells = Array.from(row.querySelectorAll('td, th')).filter(cell => !cell.classList.contains('hidden'));
      visibleCells.forEach((cell, index) => {
        if (index < columnWidths.length) {
          (cell as HTMLElement).style.setProperty('width', columnWidths[index], 'important');
          (cell as HTMLElement).style.setProperty('max-width', columnWidths[index], 'important');
          (cell as HTMLElement).style.setProperty('min-width', columnWidths[index], 'important');
        }
      });
    });

    // 确保所有表格行有最小高度
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      (row as HTMLElement).style.minHeight = '40px';
    });
  };

  // 下载PDF（使用截图方式，解决中文乱码问题）
  const handleDownloadPDF = async () => {
    let loading: HTMLElement | null = null;
    
    try {
      // 显示加载提示
      loading = document.createElement('div');
      loading.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
      loading.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-lg p-6 flex items-center gap-3 shadow-xl">
          <div class="animate-spin h-6 w-6 border-3 border-[#0a4a7a] border-t-transparent rounded-full"></div>
          <span class="text-slate-900 dark:text-slate-100">正在生成PDF...</span>
        </div>
      `;
      document.body.appendChild(loading);

      // 获取所有可能产生滚动条的元素
      const container = document.querySelector('.quote-table-container');
      const pageContainer = document.querySelector('.page-container');
      const quoteCard = document.querySelector('.quote-card');
      const body = document.body;
      const html = document.documentElement;
      const element = document.querySelector('.export-container') as HTMLElement;
      
      if (!element) {
        loading.remove();
        alert('未找到导出元素');
        return;
      }
      
      // 彻底重置所有可能产生滚动条的元素样式
      const allElements = [html, body, container, pageContainer, quoteCard, element].filter(Boolean) as HTMLElement[];
      
      // 保存原始样式
      const originalStyles: Record<string, any> = {};
      allElements.forEach((el, index) => {
        const key = `el${index}`;
        originalStyles[key] = {
          overflow: el.style.overflow,
          overflowX: el.style.overflowX,
          overflowY: el.style.overflowY,
          maxHeight: el.style.maxHeight,
          height: el.style.height,
          minHeight: el.style.minHeight,
          scrollbarWidth: el.style.scrollbarWidth
        };
        
        // 彻底重置样式，使用!important确保生效
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('overflow-x', 'visible', 'important');
        el.style.setProperty('overflow-y', 'visible', 'important');
        el.style.setProperty('max-height', 'none', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('min-height', 'auto', 'important');
        el.style.setProperty('scrollbar-width', 'none', 'important');
        el.style.setProperty('-ms-overflow-style', 'none', 'important');
      });
      
      // 添加导出专用类
      document.documentElement.classList.add('pdf-export-mode');
      document.body.classList.add('pdf-export-mode');
      if (container) {
        container.classList.add('pdf-export-mode');
        // 确保表格容器有足够高度显示所有内容，且无滚动条
        (container as HTMLElement).style.setProperty('height', 'auto', 'important');
        (container as HTMLElement).style.setProperty('min-height', 'auto', 'important');
        (container as HTMLElement).style.setProperty('max-height', 'none', 'important');
        (container as HTMLElement).style.setProperty('overflow', 'visible', 'important');
        (container as HTMLElement).style.setProperty('overflow-x', 'visible', 'important');
        (container as HTMLElement).style.setProperty('overflow-y', 'visible', 'important');
      }
      if (pageContainer) {
        pageContainer.classList.add('pdf-export-mode');
        (pageContainer as HTMLElement).style.setProperty('height', 'auto', 'important');
        (pageContainer as HTMLElement).style.setProperty('min-height', 'auto', 'important');
        (pageContainer as HTMLElement).style.setProperty('max-height', 'none', 'important');
      }
      (element as HTMLElement).classList.add('pdf-export-mode');
      (element as HTMLElement).style.setProperty('height', 'auto', 'important');
      (element as HTMLElement).style.setProperty('min-height', 'auto', 'important');
      (element as HTMLElement).style.setProperty('max-height', 'none', 'important');
      (element as HTMLElement).style.setProperty('overflow', 'visible', 'important');

      // 确保容器高度足够包含所有内容
      // 使用scrollHeight作为基础，因为它是浏览器计算的总高度
      // 但为了保险，我们检查是否有overflow隐藏的情况
      
      // 先移除所有可能的overflow限制，确保scrollHeight准确
      const overflowElements = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
      overflowElements.forEach(el => {
        const computedStyle = window.getComputedStyle(el);
        if (computedStyle.overflow === 'hidden' || 
            computedStyle.overflowX === 'hidden' || 
            computedStyle.overflowY === 'hidden') {
          // 临时记录原始overflow值
          if (!el.dataset.originalOverflow) {
            el.dataset.originalOverflow = el.style.overflow;
          }
          el.style.overflow = 'visible';
        }
      });

      // 强制浏览器重新计算布局
      void element.offsetHeight;

      // 使用scrollHeight作为最终高度
      const finalHeight = element.scrollHeight + 200; // 加上缓冲
      (element as HTMLElement).style.height = `${finalHeight}px`;

      console.log('[PDF] 导出容器设置:', {
        原始scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        offsetHeight: element.offsetHeight,
        最终设置高度: finalHeight,
        直接子元素数: element.children.length
      });

      // 添加分页标记，避免在内容中间分页
      addPageBreaks();

      // 强制展开所有表格内容
      const tables = element.querySelectorAll('.config-table');
      tables.forEach(table => {
        (table as HTMLElement).style.width = '100%';
        (table as HTMLElement).style.tableLayout = 'fixed'; // 改为fixed以精确控制列宽
        (table as HTMLElement).style.setProperty('overflow', 'visible', 'important');
        (table as HTMLElement).style.setProperty('overflow-x', 'visible', 'important');
        (table as HTMLElement).style.setProperty('overflow-y', 'visible', 'important');
        (table as HTMLElement).style.setProperty('height', 'auto', 'important');
        (table as HTMLElement).style.setProperty('max-height', 'none', 'important');
      });

      // 确保所有表格行不被拆分
      const tableRows = element.querySelectorAll('.config-table tbody tr');
      tableRows.forEach(row => {
        (row as HTMLElement).style.pageBreakInside = 'avoid';
        (row as HTMLElement).style.breakInside = 'avoid';
      });

      // 确保所有表格单元格不被拆分
      const allTableCells = element.querySelectorAll('.config-table tbody td');
      allTableCells.forEach(cell => {
        (cell as HTMLElement).style.pageBreakInside = 'avoid';
        (cell as HTMLElement).style.breakInside = 'avoid';
      });

      // 临时隐藏不需要导出的元素
      const noExportElements = document.querySelectorAll('.no-export');
      noExportElements.forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });

      // 临时隐藏不需要导出的列（市场参考价和操作列）
      const excludeColumnKeys = ['marketPrice', 'actions'];
      const hiddenColumnsStates: Array<{ element: HTMLElement; wasHidden: boolean }> = [];
      
      const tableCells = element.querySelectorAll('th, td');
      tableCells.forEach(cell => {
        const cellElement = cell as HTMLElement;
        const columnKey = cellElement.getAttribute('data-column-key');
        
        if (columnKey && excludeColumnKeys.includes(columnKey)) {
          if (!cellElement.classList.contains('hidden')) {
            hiddenColumnsStates.push({ element: cellElement, wasHidden: false });
            cellElement.classList.add('hidden');
          }
        }
      });

      // 临时显示所有必要的列（原来hidden但需要导出的）
      const necessaryColumnKeys = ['index', 'name', 'specifications', 'brand', 'unit', 'quantity', 'unitPrice', 'totalPrice'];
      const hiddenStates: Array<{ element: HTMLElement; wasHidden: boolean }> = [];
      
      tableCells.forEach(cell => {
        const cellElement = cell as HTMLElement;
        const columnKey = cellElement.getAttribute('data-column-key');
        
        if (columnKey) {
          if (necessaryColumnKeys.includes(columnKey)) {
            if (cellElement.classList.contains('hidden')) {
              hiddenStates.push({ element: cellElement, wasHidden: true });
              cellElement.classList.remove('hidden');
            }
          }
        }
      });

      // 在隐藏和显示列之后，强制应用列宽（此时只包含8列）
      forceColumnWidths();

      // 检测表格宽度，决定横向或竖向
      const table = element.querySelector('.config-table');
      let needsLandscape = false;

      if (table) {
        const tableWidth = (table as HTMLElement).scrollWidth;
        const containerWidth = element.clientWidth;
        needsLandscape = tableWidth > containerWidth * 1.2;
        const firstRow = table.querySelector('tr');
        const columnCount = firstRow?.cells.length || 0;
        if (columnCount > 6) {
          needsLandscape = true;
        }
        console.log(`[PDF] 表格宽度: ${tableWidth}, 容器宽度: ${containerWidth}, 列数: ${columnCount}, 需要横向: ${needsLandscape}`);
      }

      // 使用modern-screenshot将DOM转为PNG图片
      const dataUrl = await domToPng(element as HTMLElement, {
        scale: 2, // 提高清晰度
        backgroundColor: '#ffffff',
        style: {
          overflow: 'visible',
          overflowX: 'visible',
          overflowY: 'visible',
          height: 'auto',
          maxHeight: 'none',
          minHeight: 'auto',
          width: '100%', // 让容器自然布局，不要强制宽度
          maxWidth: 'none',
          minWidth: 'auto',
          margin: '0 auto',
          padding: '20px',
          scrollbarWidth: 'none',
          position: 'relative'
        },
        filter: (node) => {
          // 过滤掉不需要导出的元素
          const nodeElement = node as HTMLElement;
          if (nodeElement.classList?.contains('no-export')) return false;
          if (nodeElement.classList?.contains('action-buttons')) return false;
          if (nodeElement.classList?.contains('page-break-marker')) return false; // 过滤分页标记
          return true;
        }
      });

      // 恢复所有原始样式
      document.documentElement.classList.remove('pdf-export-mode');
      document.body.classList.remove('pdf-export-mode');
      if (container) container.classList.remove('pdf-export-mode');
      if (pageContainer) pageContainer.classList.remove('pdf-export-mode');
      (element as HTMLElement).classList.remove('pdf-export-mode');
      
      // 恢复所有元素的原始样式
      allElements.forEach((el, index) => {
        const key = `el${index}`;
        const styles = originalStyles[key];
        if (styles) {
          el.style.overflow = styles.overflow;
          el.style.overflowX = styles.overflowX;
          el.style.overflowY = styles.overflowY;
          el.style.maxHeight = styles.maxHeight;
          el.style.height = styles.height;
          el.style.minHeight = styles.minHeight;
          el.style.scrollbarWidth = styles.scrollbarWidth;
        }
      });

      // 恢复overflow设置（在导出PDF过程中临时修改的）
      const restoreOverflowElements = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
      restoreOverflowElements.forEach(el => {
        if (el.dataset.originalOverflow) {
          el.style.overflow = el.dataset.originalOverflow;
          delete el.dataset.originalOverflow;
        }
        if (el.dataset.originalOverflowBreak) {
          el.style.overflow = el.dataset.originalOverflowBreak;
          delete el.dataset.originalOverflowBreak;
        }
      });

      // 恢复表格的原始样式
      tables.forEach(table => {
        (table as HTMLElement).style.width = '';
        (table as HTMLElement).style.tableLayout = '';
        (table as HTMLElement).style.overflow = '';
      });

      // 恢复隐藏的元素
      noExportElements.forEach(el => {
        (el as HTMLElement).style.display = '';
      });

      // 恢复临时隐藏的列
      hiddenColumnsStates.forEach(({ element, wasHidden }) => {
        if (!wasHidden) {
          element.classList.remove('hidden');
        }
      });

      // 恢复列的 hidden 状态
      hiddenStates.forEach(({ element, wasHidden }) => {
        if (wasHidden) {
          element.classList.add('hidden');
        }
      });

      // 创建Image对象获取图片尺寸
      const img = new Image();
      img.src = dataUrl;
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      // 计算PDF尺寸（A4纸张）
      const pdfWidthPortrait = 595.28; // A4竖向宽度（pt）
      const pdfHeightPortrait = 841.89; // A4竖向高度（pt）
      const pdfWidthLandscape = 841.89; // A4横向宽度（pt）
      const pdfHeightLandscape = 595.28; // A4横向高度（pt）
      const margin = 40; // 页边距

      const pdfWidth = needsLandscape ? pdfWidthLandscape : pdfWidthPortrait;
      const pdfHeight = needsLandscape ? pdfHeightLandscape : pdfHeightPortrait;

      // 计算图片尺寸
      const imgWidth = img.width;
      const imgHeight = img.height;
      const ratio = imgWidth / imgHeight;
      const pdfImgWidth = pdfWidth - margin; // 左右边距各20
      const pdfImgHeight = pdfImgWidth / ratio;

      // 计算每一页可用的内容高度
      const pageContentHeight = pdfHeight - margin; // 减去上下边距
      
      // 获取分页标记
      const breakMarkers = element.querySelectorAll('.page-break-marker');
      const breakPoints = Array.from(breakMarkers)
        .map(marker => {
          const top = parseInt((marker as HTMLElement).dataset.pageBreakValue || '0');
          return top;
        })
        .filter(point => point > 0)
        .sort((a, b) => a - b);

      console.log('[PDF] 分页点（DOM坐标）:', breakPoints);

      // 添加调试信息
      console.log('[PDF Debug] 开始导出，容器高度:', element.clientHeight);
      const debugTableRows = element.querySelectorAll('.config-table tbody tr');
      console.log('[PDF Debug] 表格行数:', debugTableRows.length);
      if (debugTableRows.length > 0) {
        console.log('[PDF Debug] 每行平均高度:', element.clientHeight / debugTableRows.length);
      }

      // 计算图片总高度和每个像素在图片中的比例
      // 使用设置后的高度，而不是scrollHeight
      const containerHeight = parseInt((element as HTMLElement).style.height) || element.scrollHeight;
      const pixelRatio = imgHeight / containerHeight;

      console.log('[PDF] 容器高度:', containerHeight, '图片高度:', imgHeight, '比例:', pixelRatio);
      console.log('[PDF] 预期分页点数:', breakPoints.length, '实际图片高度:', imgHeight);

      // 转换分页点到图片坐标
      const imageBreakPoints = breakPoints.map(point => point * pixelRatio);
      console.log('[PDF] 分页点（图片坐标）:', imageBreakPoints);

      // 计算需要的页数（基于分页标记）
      const pageCount = imageBreakPoints.length + 1;

      // 创建PDF，根据宽度选择方向
      const pdf = new jsPDF({
        orientation: needsLandscape ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      // 计算每页可显示的内容高度（减去页眉页脚）
      const pageHeight = pdf.internal.pageSize.getHeight();
      const headerHeight = 0;   // PDF内部没有页眉，全部内容都在图片中
      const footerHeight = 0;   // PDF内部没有页脚，全部内容都在图片中
      const availableHeight = pageHeight - headerHeight - footerHeight;

      // 计算图片缩放比例
      const scale = pdfWidth / imgWidth;
      const scaledImageHeight = imgHeight * scale;

      // 计算需要的页数
      const totalPages = Math.ceil(scaledImageHeight / availableHeight);

      console.log(`[PDF] 总页数: ${totalPages}, 图片高度: ${imgHeight}, 缩放后高度: ${scaledImageHeight}, 可用高度: ${availableHeight}`);
      console.log(`[PDF] 缩放比例: ${scale}, PDF宽度: ${pdfWidth}, 图片宽度: ${imgWidth}`);

      // 分页导出
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // 在每页（除第一页）顶部添加续表标记
        if (page > 0) {
          pdf.setFontSize(10);
          pdf.setTextColor(100, 100, 100); // 灰色
          pdf.text('（续表）', pdfWidth - 40, 15);
        }

        // 计算当前页要显示的区域
        const startY = page * (availableHeight / scale); // 原图中的起始Y坐标
        const endY = Math.min((page + 1) * (availableHeight / scale), imgHeight);
        const height = endY - startY;

        console.log(`[PDF] 第${page + 1}页: startY=${startY.toFixed(2)}, endY=${endY.toFixed(2)}, height=${height.toFixed(2)}`);

        // 如果当前页没有内容，跳过
        if (height <= 0) break;

        // 创建canvas截取对应区域
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = height;

        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(
            img,
            0, startY,           // 源图像起始坐标
            imgWidth, height,    // 源图像宽高
            0, 0,                 // 目标图像起始坐标
            imgWidth, height      // 目标图像宽高
          );
        }

        const pageDataUrl = pageCanvas.toDataURL('image/png');

        // 添加到PDF，调整位置使其从顶部开始
        const scaledHeight = height * scale;
        pdf.addImage(
          pageDataUrl,
          'PNG',
          0,
          headerHeight, // 留出页眉空间
          pdfWidth,
          scaledHeight
        );
      }

      // 保存PDF
      const quoteTitle = getQuoteTitle(data.products || []);
      pdf.save(`${quoteTitle}_${data.quoteNumber}.pdf`);

      // 移除分页标记
      const markersToRemove = element.querySelectorAll('.page-break-marker');
      markersToRemove.forEach(marker => marker.remove());

      // 移除续表表头
      const continueHeaders = element.querySelectorAll('.continue-table-indicator');
      continueHeaders.forEach(header => header.closest('tr')?.remove());

    } catch (error) {
      console.error('PDF导出失败:', error);
      alert('PDF导出失败，请重试');
    } finally {
      // 移除加载提示
      if (loading) loading.remove();
    }
  };

  // 获取分组后的产品
  const groupedProducts = groupProducts(data.products, groupType);

  return (
    <div className="quote-card w-full bg-white dark:bg-slate-950 rounded-xl shadow-lg overflow-hidden">
      {/* 导出容器 - 包含所有需要导出的内容 */}
      <div className="export-container" data-quote-id={data.quoteNumber}>
      {/* 页眉 - 蓝渐变背景 */}
      <div className="bg-gradient-to-r from-[#0a4a7a] to-[#2c8c99] px-6 py-5">
        {/* 公司信息一行排列 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 左侧：公司信息 */}
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/20 rounded-lg">
              <Building2 className="h-6 w-6 text-[#f9a825]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {actualSupplierInfo?.companyName || '报价公司'}
              </h1>
              <p className="text-sm text-white/80 mt-1">
                {actualSupplierInfo?.taxNumber && `统一社会信用代码：${actualSupplierInfo.taxNumber}`}
              </p>
            </div>
          </div>

          {/* 右侧：联系方式 */}
          <div className="flex flex-wrap items-center gap-4 text-white/90 text-sm">
            {actualSupplierInfo?.contactPerson && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#f9a825]" />
                <span>{actualSupplierInfo.contactPerson}</span>
              </div>
            )}
            {actualSupplierInfo?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#f9a825]" />
                <span>{actualSupplierInfo.phone}</span>
              </div>
            )}
            {actualSupplierInfo?.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#f9a825]" />
                <span>{actualSupplierInfo.email}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 标题区域 */}
      <div className="px-6 py-4 text-center border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold text-[#0a4a7a]">{getQuoteTitle(data.products || [])}</h2>
        <p className="text-xs text-slate-400 mt-1">
          报价单号：{data.quoteNumber} | 日期：{projectFields.find(f => f.label === '报价日期')?.value || new Date().toLocaleDateString('zh-CN')}
        </p>
      </div>

      {/* 操作按钮 - 不导出 */}
      <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center no-export">
        {/* 分组选择 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">分组方式：</span>
          <Select value={groupType} onValueChange={(value: GroupType) => setGroupType(value)}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不分组</SelectItem>
              <SelectItem value="category">按类别</SelectItem>
              <SelectItem value="brand">按品牌</SelectItem>
              <SelectItem value="system">按系统</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 导出按钮 */}
        <div className="flex justify-end gap-2">
          {/* 填充市场价按钮 - 仅当有0价格产品时显示 */}
          {hasZeroPriceProducts && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleFillPrices}
              disabled={isFillingPrices}
              className="border-[#f9a825] text-[#f9a825] hover:bg-[#f9a825] hover:text-white transition-colors"
            >
              {isFillingPrices ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  填充中...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  填充市场价
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="border-[#2c8c99] text-[#2c8c99] hover:bg-[#2c8c99] hover:text-white transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            className="border-[#0a4a7a] text-[#0a4a7a] hover:bg-[#0a4a7a] hover:text-white transition-colors"
          >
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 项目概况 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#0a4a7a]" />
              <h3 className="text-lg font-bold text-[#0a4a7a]">项目概况</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[#0a4a7a] to-transparent ml-4"></div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddProjectField}
              className="h-8 px-2 text-[#2c8c99] hover:bg-[#2c8c99]/10 no-export"
            >
              <Plus className="h-4 w-4 mr-1" />
              添加字段
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectFields.map((field, index) => (
                <div key={field.label} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap w-24">
                    {field.label}
                  </span>
                  <span className="text-slate-900 dark:text-slate-100">:</span>
                  {editingField === index && field.editable !== false ? (
                    <Input
                      value={field.value}
                      onChange={(e) => handleUpdateProjectField(index, e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingField(null);
                      }}
                      className="flex-1 h-8 text-sm"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded"
                      onClick={() => setEditingField(index)}
                    >
                      {field.value || '-'}
                    </span>
                  )}
                  {field.editable !== false && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveProjectField(index)}
                      className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 no-export"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 产品清单 */}
        {groupedProducts.map((group, groupIndex) => (
          <div key={groupIndex}>
            {groupType !== 'none' && (
              <div className="flex items-center gap-2 mb-4">
                <FileDown className="h-5 w-5 text-[#0a4a7a]" />
                <h3 className="text-lg font-bold text-[#0a4a7a]">{group.name}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-[#0a4a7a] to-transparent ml-4"></div>
              </div>
            )}

            <div className="quote-table-container rounded-lg border border-slate-200 dark:border-slate-800">
              <Table className="config-table">
                <TableHeader className="bg-[#0a4a7a]">
                  <TableRow>
                    {columns.map((column) => {
                      return (
                        <TableHead
                          key={column.key}
                          data-column-key={column.key}
                          className={`text-white ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''} ${column.visible ? '' : 'hidden'}`}
                        >
                          {column.label}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.products.map((product, productIndex) => {
                    const actualIndex = data.products.findIndex(p => p === product);
                    const marketData = marketPrices[actualIndex];
                    const isEven = productIndex % 2 === 0;
                    const productKey = `${product.name}-${product.model || ''}-${actualIndex}`;

                    return (
                      <TableRow
                        key={productKey}
                        className={`hover:bg-[#2c8c99]/10 transition-colors ${
                          isEven ? 'bg-white' : 'bg-slate-50 dark:bg-slate-900/30'
                        }`}
                      >
                        {columns.map((column) => {
                          const alignClass = column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : '';
                          switch (column.key) {
                            case 'index':
                              return (
                                <TableCell key={column.key} data-column-key="index" className={`text-center font-medium text-slate-700 dark:text-slate-300 ${column.visible ? '' : 'hidden'}`}>
                                  {group.products.indexOf(product) + 1}
                                </TableCell>
                              );
                            case 'name':
                              return (
                                <TableCell key={column.key} data-column-key="name" className={`font-semibold text-[#0a4a7a] ${column.visible ? '' : 'hidden'}`}>
                                  {product.name}
                                </TableCell>
                              );
                            case 'specifications':
                              return (
                                <TableCell key={column.key} data-column-key="specifications" className={`text-sm text-slate-600 dark:text-slate-400 ${column.visible ? '' : 'hidden'}`}>
                                  {product.specifications || product.model || '-'}
                                </TableCell>
                              );
                            case 'brand':
                              return (
                                <TableCell key={column.key} data-column-key="brand" className={`text-sm text-slate-600 dark:text-slate-400 ${column.visible ? '' : 'hidden'}`}>
                                  {product.brand || '-'}
                                </TableCell>
                              );
                            case 'unit':
                              return (
                                <TableCell key={column.key} data-column-key="unit" className={`text-center text-sm text-slate-600 dark:text-slate-400 ${column.visible ? '' : 'hidden'}`}>
                                  {product.unit || '件'}
                                </TableCell>
                              );
                            case 'quantity':
                              return (
                                <TableCell key={column.key} data-column-key="quantity" className={`text-center ${column.visible ? '' : 'hidden'}`}>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={product.quantity || 1}
                                    onChange={(e) => {
                                      const newQuantity = parseInt(e.target.value) || 1;
                                      // 更新产品数量
                                      const updatedProducts = [...data.products];
                                      updatedProducts[actualIndex].quantity = newQuantity;
                                      // 重新计算总价
                                      const price = updatedProducts[actualIndex].unitPrice || 0;
                                      updatedProducts[actualIndex].totalPrice = price * newQuantity;
                                      // 触发更新
                                      if (onUpdateProductPrice) {
                                        onUpdateProductPrice(actualIndex, price);
                                      }
                                    }}
                                    onClick={(e) => {
                                      (e.target as HTMLInputElement).select();
                                    }}
                                    onDoubleClick={(e) => {
                                      (e.target as HTMLInputElement).select();
                                    }}
                                    className="w-14 h-8 px-2 text-center text-sm cursor-pointer focus:ring-2 focus:ring-[#0a4a7a]"
                                  />
                                </TableCell>
                              );
                            case 'unitPrice':
                              return (
                                <TableCell 
                                  key={column.key} 
                                  data-column-key="unitPrice" 
                                  className={`text-right font-bold text-[#d32f2f] pr-4 whitespace-nowrap ${column.visible ? '' : 'hidden'}`}
                                >
                                  ¥{product.unitPrice.toFixed(2)}
                                </TableCell>
                              );
                            case 'totalPrice':
                              return (
                                <TableCell 
                                  key={column.key} 
                                  data-column-key="totalPrice" 
                                  className={`text-right font-bold text-[#d32f2f] pr-4 whitespace-nowrap ${column.visible ? '' : 'hidden'}`}
                                >
                                  ¥{(product.totalPrice || 0).toFixed(2)}
                                </TableCell>
                              );
                            case 'marketPrice':
                              return (
                                <TableCell key={column.key} data-column-key="marketPrice" className={`text-right text-sm ${column.visible ? '' : 'hidden'}`}>
                                  {marketData?.loading ? (
                                    <div className="flex items-center justify-end gap-2 text-[#2c8c99]">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      <span>搜索中</span>
                                    </div>
                                  ) : marketData?.error ? (
                                    <div className="text-red-500 text-xs">{marketData.error}</div>
                                  ) : marketData?.data?.averageMarketPrice ? (
                                    <div className="text-right space-y-2">
                                      <div>
                                        <div className="font-semibold text-[#2c8c99]">
                                          ¥{marketData.data.averageMarketPrice.toFixed(2)}
                                        </div>
                                        {(() => {
                                          const priceDiff = calculatePriceDiff(product.unitPrice, marketData.data.averageMarketPrice);
                                          return (
                                            <div className={`text-xs font-semibold flex items-center justify-end gap-1 mt-1 ${
                                              priceDiff.isLower ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                              {priceDiff.isLower ? (
                                                <TrendingDown className="h-3 w-3" />
                                              ) : (
                                                <TrendingUp className="h-3 w-3" />
                                              )}
                                              <span>{priceDiff.percentage.toFixed(1)}%</span>
                                            </div>
                                          );
                                        })()}
                                      </div>

                                      {marketData.showConfirm && (
                                        <div className="flex items-center justify-end gap-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleApplyMarketPrice(actualIndex)}
                                            className="h-7 px-2 text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                                          >
                                            <CheckCircle className="h-3 w-3 mr-1" />
                                            应用
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDismissMarketPrice(actualIndex)}
                                            className="h-7 px-2 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                                          >
                                            放弃
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </TableCell>
                              );
                            case 'actions':
                              return (
                                <TableCell key={column.key} data-column-key="actions" className={`text-center ${column.visible ? '' : 'hidden'}`}>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleSearchMarketPrice(actualIndex)}
                                          disabled={marketData?.loading}
                                          className="h-8 w-8 p-0 hover:bg-[#2c8c99]/20 text-[#2c8c99]"
                                        >
                                          {marketData?.loading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Search className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>获取市场参考价</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                              );
                            default:
                              return null;
                          }
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        {/* 费用汇总 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-[#0a4a7a]" />
            <h3 className="text-lg font-bold text-[#0a4a7a]">费用汇总</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[#0a4a7a] to-transparent ml-4"></div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-6 bg-slate-50 dark:bg-slate-900/30">
            {/* 费用明细 */}
            <div className="space-y-3">
              {/* 小计 */}
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">小计</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  ¥{feeSummary.subtotal.toFixed(2)}
                </span>
              </div>

              {/* 税费 */}
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-400">税费</span>
                  <Select
                    value={feeConfig.taxRate.toString()}
                    onValueChange={(value) => handleUpdateFeeConfig('taxRate', parseFloat(value))}
                  >
                    <SelectTrigger className="h-7 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TAX_RATES.map((rate) => (
                        <SelectItem key={rate.value} value={rate.value.toString()}>
                          {rate.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  ¥{feeSummary.taxAmount.toFixed(2)}
                </span>
              </div>

              {/* 运费 */}
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-[#2c8c99]" />
                  <span className="text-slate-600 dark:text-slate-400">运费</span>
                  <Input
                    type="number"
                    value={feeConfig.shippingFee}
                    onChange={(e) => handleUpdateFeeConfig('shippingFee', parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-sm"
                  />
                </div>
                <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  ¥{feeSummary.shippingFee.toFixed(2)}
                </span>
              </div>

              {/* 安装调试费 */}
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-[#2c8c99]" />
                  <span className="text-slate-600 dark:text-slate-400">安装调试费</span>
                  <Input
                    type="number"
                    value={feeConfig.installationFee}
                    onChange={(e) => handleUpdateFeeConfig('installationFee', parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-sm"
                  />
                </div>
                <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  ¥{feeSummary.installationFee.toFixed(2)}
                </span>
              </div>

              {/* 其他费用 */}
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <MoreHorizontal className="h-4 w-4 text-[#2c8c99]" />
                  <span className="text-slate-600 dark:text-slate-400">其他费用</span>
                  <Input
                    type="number"
                    value={feeConfig.otherFee}
                    onChange={(e) => handleUpdateFeeConfig('otherFee', parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-sm"
                  />
                </div>
                <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  ¥{feeSummary.otherFee.toFixed(2)}
                </span>
              </div>

              {/* 总价 */}
              <div className="flex justify-between items-center py-4">
                <span className="text-lg font-bold text-[#0a4a7a] whitespace-nowrap">总价（含税）</span>
                <span className="text-2xl font-bold text-[#d32f2f] whitespace-nowrap">
                  ¥{feeSummary.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 大写金额 */}
            <div className="mt-6 p-4 bg-[#fff3cd] border-l-4 border-[#f9a825] rounded-r">
              <p className="text-sm text-slate-600 mb-1">大写金额</p>
              <p className="text-xl font-bold text-[#0a4a7a]">
                {formatAmountToChinese(feeSummary.totalAmount)}
              </p>
            </div>
          </div>
        </div>

        {/* 商务条款 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-[#0a4a7a]" />
            <h3 className="text-lg font-bold text-[#0a4a7a]">商务条款</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[#0a4a7a] to-transparent ml-4"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-[#2c8c99]" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">付款方式</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {data.terms?.payment || '预付30%，发货前付清'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-[#2c8c99]" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">质保期</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {data.terms?.warranty || '12个月'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="h-4 w-4 text-[#2c8c99]" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">交货期</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {data.terms?.delivery || '7个工作日'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-[#2c8c99]" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">报价有效期</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {data.terms?.validity || '15天'}
              </p>
            </div>
          </div>
        </div>

        {/* 备注 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <InfoIcon className="h-5 w-5 text-[#0a4a7a]" />
            <h3 className="text-lg font-bold text-[#0a4a7a]">备注</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[#0a4a7a] to-transparent ml-4"></div>
          </div>

          <div className="p-4 bg-slate-100 dark:bg-slate-900/50 border-l-4 border-slate-400 dark:border-slate-600 rounded-r">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              1. 本报价单仅供参考，最终价格以双方签订的合同为准。
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              2. 产品规格如有变更，价格将相应调整。
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              3. 如有疑问，请联系我们：{actualSupplierInfo?.phone || ''}
            </p>
          </div>
        </div>

        {/* 账户信息 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-5 w-5 text-[#0a4a7a]" />
            <h3 className="text-lg font-bold text-[#0a4a7a]">账户信息</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[#0a4a7a] to-transparent ml-4"></div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border-l-4 border-[#2c8c99] p-4 bg-slate-50 dark:bg-slate-900/30">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">开户银行</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {actualSupplierInfo?.bankName || '中国工商银行'}
              </p>
            </div>

            <div className="rounded-lg border-l-4 border-[#f9a825] p-4 bg-slate-50 dark:bg-slate-900/30">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">银行账号</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {actualSupplierInfo?.bankAccount || '6222 0000 0000 0000'}
              </p>
            </div>

            <div className="rounded-lg border-l-4 border-[#d32f2f] p-4 bg-slate-50 dark:bg-slate-900/30">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">统一社会信用代码</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {actualSupplierInfo?.taxNumber || '91000000000000000X'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 页脚 */}
      <div className="px-6 py-6 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Heart className="h-4 w-4 text-red-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              感谢您的信任，期待与您合作！
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-500">
            {actualSupplierInfo?.address && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{actualSupplierInfo.address}</span>
              </div>
            )}
            {actualSupplierInfo?.phone && (
              <div className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <span>{actualSupplierInfo.phone}</span>
              </div>
            )}
            {actualSupplierInfo?.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <span>{actualSupplierInfo.email}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
