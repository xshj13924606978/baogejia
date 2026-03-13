'use client';

import { useState } from 'react';
import PriceLibrary from './price-library';
import DocumentLibrary from './document-library';
import CaseLibrary from './case-library';
import StandardLibrary from './standard-library';
import DrawingLibrary from './drawing-library';
import QuotaLibrary from './quota-library';
import GlobalSearch from './global-search';

interface KnowledgeCenterProps {
  initialModule: string | null;
  onClose: () => void;
}

export default function KnowledgeCenter({ initialModule, onClose }: KnowledgeCenterProps) {
  const [activeTab, setActiveTab] = useState(initialModule || 'price');

  // 模块配置
  const modules = [
    { id: 'price', name: '产品价格库', icon: '📊', color: 'blue', component: PriceLibrary },
    { id: 'document', name: '技术文档库', icon: '📄', color: 'green', component: DocumentLibrary },
    { id: 'case', name: '案例库', icon: '🏗️', color: 'purple', component: CaseLibrary },
    { id: 'standard', name: '标准规范库', icon: '📋', color: 'yellow', component: StandardLibrary },
    { id: 'drawing', name: '图纸图片库', icon: '🖼️', color: 'pink', component: DrawingLibrary },
    { id: 'quota', name: '定额库', icon: '📊', color: 'orange', component: QuotaLibrary },
    { id: 'search', name: '全局搜索', icon: '🔍', color: 'gray', component: GlobalSearch },
  ];

  // 获取当前活跃组件
  const ActiveComponent = modules.find((m) => m.id === activeTab)?.component || PriceLibrary;

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
        <ActiveComponent />
      </div>
    </div>
  );
}
