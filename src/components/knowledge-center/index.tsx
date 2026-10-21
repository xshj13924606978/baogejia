'use client';

import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import PriceLibrary from './price-library';
import DocumentLibrary from './document-library';
import CaseLibrary from './case-library';
import StandardLibrary from './standard-library';
import DrawingLibrary from './drawing-library';
import QuotaLibrary from './quota-library';
import GlobalSearch from './global-search';
import MyUploads from './my-uploads';
import { usePermission } from '@/hooks/usePermission';
import type { KnowledgeAssetReferenceFile } from '@/lib/intent-recognizer';

/** 资料类型 -> 资料中心 tab id 映射（#[20260827-2000]-2：跳转定位到对应资料库列表） */
const CATEGORY_TO_MODULE: Record<string, string> = {
  price: 'price',
  document: 'document',
  case: 'case',
  standard: 'standard',
  drawing: 'drawing',
  quota: 'quota',
  // 中文兜底
  产品价格: 'price',
  技术文档: 'document',
  案例: 'case',
  标准规范: 'standard',
  图纸图片: 'drawing',
  定额: 'quota',
};

interface KnowledgeCenterProps {
  initialModule: string | null;
  /** 初始搜索关键词：定位到"全局搜索" tab 时自动搜索（#[20260827-1800]） */
  initialSearch?: string;
  /** 直接定位的命中文件（#[20260827-2000]-2）：打开对应资料库 tab 并在列表中高亮目标文件 */
  directFile?: KnowledgeAssetReferenceFile | null;
  onClose: () => void;
}

function resolveTargetModule(directFile?: KnowledgeAssetReferenceFile | null, fallback?: string | null) {
  if (directFile?.category) {
    const mapped = CATEGORY_TO_MODULE[directFile.category];
    if (mapped) return mapped;
  }
  return fallback || 'price';
}

export default function KnowledgeCenter({
  initialModule,
  initialSearch,
  directFile,
  onClose,
}: KnowledgeCenterProps) {
  const [activeTab, setActiveTab] = useState(() => resolveTargetModule(directFile, initialModule));
  const [highlightId, setHighlightId] = useState<string | undefined>(directFile?.id || undefined);
  const { canUseAction, loading: permissionLoading } = usePermission();
  const canView = canUseAction('knowledge:view');

  // directFile 变化时切到对应 tab 并高亮目标文件
  useEffect(() => {
    if (directFile?.id) {
      setActiveTab(resolveTargetModule(directFile, initialModule));
      setHighlightId(directFile.id);
    }
  }, [directFile, initialModule]);

  // 模块配置
  const modules = [
    { id: 'price', name: '产品价格库', icon: '📊', color: 'blue', component: PriceLibrary },
    { id: 'document', name: '技术文档库', icon: '📄', color: 'green', component: DocumentLibrary },
    { id: 'case', name: '案例库', icon: '🏗️', color: 'purple', component: CaseLibrary },
    { id: 'standard', name: '标准规范库', icon: '📋', color: 'yellow', component: StandardLibrary },
    { id: 'drawing', name: '图纸图片库', icon: '🖼️', color: 'pink', component: DrawingLibrary },
    { id: 'quota', name: '定额库', icon: '📊', color: 'orange', component: QuotaLibrary },
    { id: 'my-uploads', name: '我的上传', icon: '📁', color: 'indigo', component: MyUploads },
    { id: 'search', name: '全局搜索', icon: '🔍', color: 'gray', component: GlobalSearch },
  ];

  // 获取当前活跃组件（price 为锁定功能单独渲染，不参与高亮透传 #[20260827-2000]-2）
  const ActiveComponent =
    (activeTab === 'document'
      ? DocumentLibrary
      : activeTab === 'case'
        ? CaseLibrary
        : activeTab === 'standard'
          ? StandardLibrary
          : activeTab === 'drawing'
            ? DrawingLibrary
            : activeTab === 'quota'
              ? QuotaLibrary
              : undefined) as ComponentType<{ highlightId?: string }> | undefined;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* 标题栏 */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          📚 资料中心
        </h2>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors"
        >
          <span>✕</span> 关闭
        </button>
      </div>

      {/* 标签页导航 */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-x-auto">
        {modules.map((module) => (
          <button
            key={module.id}
            data-tab={module.id}
            onClick={() => setActiveTab(module.id)}
            className={`
              px-4 py-3 whitespace-nowrap flex items-center gap-2 text-sm border-b-2 transition-colors
              ${
                activeTab === module.id
                  ? `border-${module.color}-500 text-${module.color}-600 font-medium`
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }
            `}
          >
            <span className="text-lg">{module.icon}</span>
            <span>{module.name}</span>
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6 bg-slate-50 dark:bg-slate-950">
        {!permissionLoading && !canView ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <span className="text-5xl mb-4">🔒</span>
            <div className="text-lg font-medium">暂无资料查看权限</div>
            <p className="text-sm text-slate-400 mt-2">请联系管理员分配权限</p>
          </div>
        ) : activeTab === 'search' ? (
          <GlobalSearch onJump={(type) => setActiveTab(type)} initialKeyword={initialSearch} />
        ) : activeTab === 'my-uploads' ? (
          <MyUploads onJump={(type) => setActiveTab(type)} highlightId={highlightId} />
        ) : activeTab === 'price' ? (
          <PriceLibrary />
        ) : ActiveComponent ? (
          <ActiveComponent highlightId={highlightId} />
        ) : null}
      </div>
    </div>
  );
}
