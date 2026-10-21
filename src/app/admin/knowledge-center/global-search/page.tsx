'use client';

import { useState, useMemo } from 'react';
import { Search, FileText, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import KnowledgeLibrary from '@/components/knowledge-center/knowledge-library';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const TYPE_TABS = [
  { value: 'all', label: '全部' },
  { value: 'price', label: '产品价格库' },
  { value: 'document', label: '技术文档库' },
  { value: 'case', label: '案例库' },
  { value: 'standard', label: '标准规范库' },
  { value: 'drawing', label: '图纸图片库' },
  { value: 'quota', label: '定额库' },
];

export default function GlobalSearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  // 搜索防抖 500ms（#[20260825-2350-1] 优化；#[20260901-1100] P2-11 收敛到共享 Hook）
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);
  const [activeType, setActiveType] = useState('all');

  const title = activeType === 'all'
    ? '全局搜索'
    : TYPE_TABS.find(t => t.value === activeType)?.label || '全局搜索';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">全局搜索</h1>

      {/* 搜索栏 */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索资料标题、描述..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 pr-9 h-10"
        />
        {searchTerm !== debouncedSearchTerm && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* 类型标签 */}
      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_TABS.map(tab => (
          <Badge
            key={tab.value}
            variant={activeType === tab.value ? 'default' : 'outline'}
            className="cursor-pointer px-3 py-1 text-sm hover:bg-primary/10"
            onClick={() => setActiveType(tab.value)}
          >
            {tab.label}
          </Badge>
        ))}
      </div>

      {/* 列表内容 */}
      {debouncedSearchTerm || activeType !== 'all' ? (
        <KnowledgeLibrary
          title={title}
          type={activeType === 'all' ? '' : activeType}
          search={debouncedSearchTerm}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">输入关键词搜索</p>
            <p className="text-sm mt-1">支持按类型筛选，搜索资料标题</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
