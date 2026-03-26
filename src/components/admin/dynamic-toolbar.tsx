'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import type { ActionConfig } from '@/hooks/usePageConfig';
import {
  Plus, Download, Search, RefreshCw, Upload, Trash2, Edit, Filter,
  type LucideIcon,
} from 'lucide-react';

// 图标映射
const ACTION_ICONS: Record<string, LucideIcon> = {
  Plus, Download, Search, RefreshCw, Upload, Trash2, Edit, Filter,
  create: Plus, export: Download, refresh: RefreshCw, import: Upload,
  delete: Trash2, edit: Edit, search: Search, filter: Filter,
};

const getActionIcon = (icon?: string): LucideIcon | null => {
  if (!icon) return null;
  return ACTION_ICONS[icon] || ACTION_ICONS[icon.charAt(0).toUpperCase() + icon.slice(1)] || null;
};

export interface DynamicToolbarProps {
  /** 工具栏按钮（来自 usePageConfig actionsByPosition.toolbar） */
  actions: ActionConfig[];
  /** 按钮点击回调 */
  onAction?: (actionKey: string) => void;
  /** 搜索状态 */
  searchTerm?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onSearch?: () => void;
}

export function DynamicToolbar({
  actions,
  onAction,
  searchTerm = '',
  searchPlaceholder = '搜索...',
  onSearchChange,
  onSearch,
}: DynamicToolbarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch?.();
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* 搜索框 */}
      {onSearchChange && (
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[320px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-transparent text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          {onSearch && (
            <Button variant="outline" size="sm" onClick={onSearch}>搜索</Button>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {actions.length > 0 && (
        <div className="flex items-center gap-2">
          {actions.map(action => {
            const Icon = getActionIcon(action.config?.icon);
            const buttonType = action.config?.buttonType;
            const variant = buttonType === 'primary' ? 'default' : 'outline';
            return (
              <Button
                key={action.action_key}
                variant={variant}
                size="sm"
                onClick={() => onAction?.(action.action_key)}
                className="gap-1.5"
              >
                {Icon && <Icon className="h-4 w-4" />}
                {action.name_zh}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
