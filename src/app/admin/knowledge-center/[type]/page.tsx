'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import KnowledgeLibrary from '@/components/knowledge-center/knowledge-library';

const typeMap: Record<string, { title: string; type: string }> = {
  'price-library':    { title: '产品价格库', type: 'price' },
  'document-library': { title: '技术文档库', type: 'document' },
  'case-library':     { title: '案例库',     type: 'case' },
  'standard-library': { title: '标准规范库', type: 'standard' },
  'drawing-library':  { title: '图纸图片库', type: 'drawing' },
  'quota-library':    { title: '定额库',     type: 'quota' },
};

/**
 * 资料中心分类页（#[20260827-1430]：支持 ?search= 外部搜索词直达定位，
 * 聊天「前往资料中心查看」跳转后自动过滤对应文件）
 */
function KnowledgeTypeInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const config = typeMap[params.type as string];
  const externalSearch = searchParams.get('search') || undefined;

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        页面不存在
      </div>
    );
  }

  return (
    <KnowledgeLibrary
      title={config.title}
      type={config.type}
      forceCanEdit
      search={externalSearch}
    />
  );
}

export default function KnowledgeTypePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-96 text-muted-foreground">
          加载中...
        </div>
      }
    >
      <KnowledgeTypeInner />
    </Suspense>
  );
}
