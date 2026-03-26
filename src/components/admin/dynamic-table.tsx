'use client';

import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, MoreHorizontal, Inbox } from 'lucide-react';
import type { FieldConfig, ActionConfig } from '@/hooks/usePageConfig';

// ── 类型 ──

interface ColumnState {
  field_key: string;
  label_zh: string;
  visible: boolean;
  width?: number;
  className?: string;
}

export interface DynamicTableProps {
  /** 行数据数组 */
  data: any[];
  /** 行唯一标识字段 */
  rowKey?: string;
  /** usePageConfig 返回的字段列表 */
  fields: FieldConfig[];
  /** 当前可见列状态（支持列排序/隐藏），不传则使用 fields 全量 */
  columns?: ColumnState[];
  /** 行操作按钮配置 */
  rowActions?: ActionConfig[];
  /** 自定义单元格渲染（优先级最高） */
  renderCell?: (row: any, field: FieldConfig) => React.ReactNode;
  /** 行操作点击回调 */
  onAction?: (actionKey: string, row: any) => void;
  /** 加载状态 */
  loading?: boolean;
  /** 空数据文案 */
  emptyText?: string;
  /** 空数据副标题 */
  emptyHint?: string;
  /** 行点击 */
  onRowClick?: (row: any) => void;
}

// ── 工具函数 ──

/** 从 optionsConfig 中查找选项标签 */
function findOptionLabel(field: FieldConfig, value: string): string {
  if (!value) return '-';
  const options = field.options_config;
  if (!options) return String(value);
  if (Array.isArray(options)) {
    const opt = options.find((o: any) => o.value === value);
    return opt?.label || String(value);
  }
  if (options.type === 'static' && Array.isArray(options.options)) {
    const opt = options.options.find((o: any) => o.value === value);
    return opt?.label || String(value);
  }
  return String(value);
}

/** 根据选项值获取颜色 */
function findOptionColor(field: FieldConfig, value: string): string {
  const options = field.options_config;
  if (options && options.type === 'static' && Array.isArray(options.options)) {
    const opt = options.options.find((o: any) => o.value === value);
    if (opt?.color) return opt.color;
  }
  // 默认颜色映射
  const defaultColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    enabled: 'bg-green-100 text-green-700',
    approved: 'bg-green-100 text-green-700',
    disabled: 'bg-red-100 text-red-700',
    rejected: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
  };
  return defaultColors[value] || 'bg-gray-100 text-gray-700';
}

// ── 组件 ──

export function DynamicTable({
  data,
  rowKey = 'id',
  fields,
  columns,
  rowActions = [],
  renderCell,
  onAction,
  loading = false,
  emptyText = '暂无数据',
  emptyHint,
  onRowClick,
}: DynamicTableProps) {
  // 使用 columns（支持排序/隐藏）或从 fields 生成
  const visibleColumns: ColumnState[] = columns
    ? columns.filter(c => c.visible)
    : fields
        .filter(f => f.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(f => ({
          field_key: f.field_key,
          label_zh: f.label_zh,
          visible: true,
          className: (f.field_key === 'price' || f.field_key === 'cost_price' || f.field_key === 'min_price' || f.field_key === 'totalAmount' || f.field_key === 'subtotal' || f.field_key === 'taxAmount' || f.field_key === 'discountAmount')
            ? 'text-right'
            : (f.config?.align ? `text-${f.config.align}` : undefined),
          width: f.config?.width,
        }));

  const hasActions = rowActions.length > 0;

  // ── 加载 ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  // ── 空数据 ──
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-lg mb-2">{emptyText}</p>
        {emptyHint && (
          <p className="text-sm text-muted-foreground/70">{emptyHint}</p>
        )}
      </div>
    );
  }

  // ── 默认单元格渲染器 ──
  const defaultRender = (row: any, field: FieldConfig): React.ReactNode => {
    const val = row[field.field_key];

    // null/undefined
    if (val === null || val === undefined) return <span className="text-muted-foreground">-</span>;

    switch (field.field_type) {
      case 'select': {
        // 使用 Badge 渲染 select 类型
        const label = findOptionLabel(field, String(val));
        const color = findOptionColor(field, String(val));
        return <Badge variant="secondary" className={color}>{label}</Badge>;
      }
      case 'date': {
        const d = new Date(val);
        const formatted = d.toLocaleDateString('zh-CN');
        const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return (
          <span className="text-xs">
            {formatted}
            {timeStr !== '00:00' && <span className="text-muted-foreground ml-1">{timeStr}</span>}
          </span>
        );
      }
      case 'number': {
        const precision = field.config?.precision;
        const formatted = precision != null ? Number(val).toFixed(precision) : Number(val).toLocaleString();
        return <span className={visibleColumns.find(c => c.field_key === field.field_key)?.className}>{formatted}</span>;
      }
      case 'image': {
        return (
          <Avatar className="h-8 w-8">
            {val && <AvatarImage src={val} />}
            <AvatarFallback>{String(row.name?.[0] || '?')}</AvatarFallback>
          </Avatar>
        );
      }
      case 'email': {
        return <a href={`mailto:${val}`} className="text-blue-600 hover:underline text-sm">{val}</a>;
      }
      case 'url': {
        return <a href={val} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm truncate max-w-[200px] block">{val}</a>;
      }
      case 'phone': {
        return <span className="text-sm">{val}</span>;
      }
      case 'switch': {
        return val ? <Badge variant="secondary" className="bg-green-100 text-green-700">是</Badge> : <Badge variant="secondary" className="bg-gray-100 text-gray-500">否</Badge>;
      }
      case 'json': {
        if (Array.isArray(val)) {
          return <span className="text-xs text-muted-foreground">[{val.length} 项]</span>;
        }
        if (typeof val === 'object') {
          return <span className="text-xs text-muted-foreground">{JSON.stringify(val).slice(0, 50)}</span>;
        }
        return <span className="text-xs">{String(val)}</span>;
      }
      case 'textarea': {
        return <span className="text-sm text-gray-600 line-clamp-2 max-w-[300px] block">{String(val)}</span>;
      }
      default:
        return <span className="text-sm">{String(val)}</span>;
    }
  };

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleColumns.map(col => (
              <TableHead key={col.field_key} className={col.className} style={col.width ? { width: col.width } : undefined}>
                {col.label_zh}
              </TableHead>
            ))}
            {hasActions && <TableHead className="w-[60px] text-right">操作</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(row => (
            <TableRow
              key={row[rowKey]}
              className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : undefined}
              onClick={() => onRowClick?.(row)}
            >
              {visibleColumns.map(col => {
                const field = fields.find(f => f.field_key === col.field_key);
                return (
                  <TableCell key={`${row[rowKey]}-${col.field_key}`} className={col.className}>
                    {field
                      ? (renderCell ? renderCell(row, field) : defaultRender(row, field))
                      : String(row[col.field_key] ?? '-')}
                  </TableCell>
                );
              })}
              {hasActions && (
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {rowActions.map(action => (
                        <DropdownMenuItem
                          key={action.action_key}
                          className={
                            action.config?.buttonType === 'danger' || action.action_key === 'delete'
                              ? 'text-destructive'
                              : undefined
                          }
                          onClick={() => onAction?.(action.action_key, row)}
                        >
                          {action.name_zh}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── 分页组件 ──

export interface DynamicPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function DynamicPagination({ page, totalPages, totalCount, onPageChange }: DynamicPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between p-4 border-t">
      <span className="text-sm text-muted-foreground">
        第 {page}/{totalPages} 页，共 {totalCount} 条
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          上一页
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          下一页
        </Button>
      </div>
    </div>
  );
}
