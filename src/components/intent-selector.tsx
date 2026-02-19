'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface IntentSelectorProps {
  fileGroupId: string;
  files: any[];
  currentChoice?: string; // 当前选中的选项
  isLoading?: boolean;     // 是否正在加载
}

export default function IntentSelector({
  fileGroupId,
  files,
  currentChoice,
  isLoading
}: IntentSelectorProps) {
  // 根据文件类型获取推荐
  const getRecommendation = () => {
    const hasExcel = files.some(f =>
      f.type?.includes('sheet') ||
      f.type?.includes('excel') ||
      f.productCount > 0
    );
    const hasDocs = files.some(f =>
      f.type?.includes('pdf') ||
      f.type?.includes('image') ||
      f.productCount === undefined
    );

    if (hasExcel && !hasDocs) return 'quote';
    if (!hasExcel && hasDocs) return 'proposal';
    if (hasExcel && hasDocs) return 'both';
    return 'quote';
  };

  const recommendation = getRecommendation();

  // 按钮样式
  const getButtonStyle = (choice: string) => {
    const baseStyle = "px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium";

    if (isLoading) {
      return `${baseStyle} opacity-50 cursor-not-allowed`;
    }

    if (currentChoice === choice) {
      // 当前选中的选项
      switch (choice) {
        case 'quote':
          return `${baseStyle} bg-blue-600 text-white ring-2 ring-blue-300 shadow-md`;
        case 'proposal':
          return `${baseStyle} bg-green-600 text-white ring-2 ring-green-300 shadow-md`;
        case 'both':
          return `${baseStyle} bg-purple-600 text-white ring-2 ring-purple-300 shadow-md`;
        default:
          return `${baseStyle} bg-gray-600 text-white`;
      }
    } else {
      // 未选中的选项
      switch (choice) {
        case 'quote':
          return `${baseStyle} bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200`;
        case 'proposal':
          return `${baseStyle} bg-green-100 text-green-700 hover:bg-green-200 border border-green-200`;
        case 'both':
          return `${baseStyle} bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200`;
        default:
          return `${baseStyle} bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200`;
      }
    }
  };

  // 获取推荐标签文本
  const getRecommendationLabel = () => {
    switch (recommendation) {
      case 'quote': return '推荐';
      case 'proposal': return '推荐';
      case 'both': return '推荐';
      default: return '推荐';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            console.log('[IntentSelector] 点击生成报价单按钮, fileGroupId:', fileGroupId, 'currentChoice:', currentChoice);
            // 触发自定义事件通知父组件
            const event = new CustomEvent('intent-select', {
              detail: { fileGroupId, choice: 'quote' }
            });
            console.log('[IntentSelector] 触发 intent-select 事件:', event.detail);
            window.dispatchEvent(event);
          }}
          disabled={isLoading}
          className={getButtonStyle('quote')}
        >
          {currentChoice === 'quote' ? '✅' : '📊'} 生成报价单
          {recommendation === 'quote' && !currentChoice && (
            <span className="ml-1 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full">
              {getRecommendationLabel()}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            const event = new CustomEvent('intent-select', {
              detail: { fileGroupId, choice: 'proposal' }
            });
            window.dispatchEvent(event);
          }}
          disabled={isLoading}
          className={getButtonStyle('proposal')}
        >
          {currentChoice === 'proposal' ? '✅' : '📝'} 生成方案
          {recommendation === 'proposal' && !currentChoice && (
            <span className="ml-1 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full">
              {getRecommendationLabel()}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            const event = new CustomEvent('intent-select', {
              detail: { fileGroupId, choice: 'both' }
            });
            window.dispatchEvent(event);
          }}
          disabled={isLoading}
          className={getButtonStyle('both')}
        >
          {currentChoice === 'both' ? '✅' : '📑'} 生成方案（内含报价）
          {recommendation === 'both' && !currentChoice && (
            <span className="ml-1 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full">
              {getRecommendationLabel()}
            </span>
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span>正在生成，请稍候...</span>
        </div>
      )}
    </div>
  );
}
