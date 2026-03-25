'use client';

import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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
  /** usePageConfig 返回的可见字段列表 */
  fields: FieldConfig[];
  /** 当前可见列状态（支持列排序/隐藏），不传则使用 fields 全量 */
  columns?: ColumnState[];
  /** 行操作按钮配置 */
  rowActions?: ActionConfig[];
  /** 自定义单元格渲染 */
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
    : fields.map(f => ({
        field_key: f.field_key,
        label_zh: f.label_zh,
        visible: true,
        className: (f.field_key === 'price' || f.field_key === 'cost_price' || f.field_key === 'min_price')
          ? 'text-right' : undefined,
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

  // ── 默认渲染：直接取 row[field_key] ──
  const defaultRender = (row: any, field: FieldConfig): React.ReactNode => {
    const val = row[field.field_key];
    if (val === null || val === undefined) return '-';
    if (field.field_type === 'date') {
      return <span className="text-xs">{new Date(val).toLocaleDateString('zh-CN')}</span>;
    }
    if (field.field_type === 'number') {
      return <span className={visibleColumns.find(c => c.field_key === field.field_key)?.className}>{val}</span>;
    }
    return String(val);
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
            {hasActions && <TableHead className="w-[60px]">操作</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(row => (
            <TableRow
              key={row[rowKey]}
              className={onRowClick ? 'cursor-pointer' : undefined}
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
                <TableCell onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {rowActions.map(action => (
                        <DropdownMenuItem
                          key={action.id}
                          className={action.config?.buttonType === 'danger' ? 'text-destructive' : undefined}
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
    <div className="flex items-center justify-between mt-4">
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
