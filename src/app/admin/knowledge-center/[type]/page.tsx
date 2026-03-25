'use client';

import { useParams } from 'next/navigation';
import KnowledgeLibrary from '@/components/knowledge-center/knowledge-library';

const typeMap: Record<string, { title: string; type: string }> = {
  'price-library':    { title: '产品价格库', type: 'price' },
  'document-library': { title: '技术文档库', type: 'document' },
  'case-library':     { title: '案例库',     type: 'case' },
  'standard-library': { title: '标准规范库', type: 'standard' },
  'drawing-library':  { title: '图纸图片库', type: 'drawing' },
  'quota-library':    { title: '定额库',     type: 'quota' },
};

export default function KnowledgeTypePage() {
  const params = useParams();
  const config = typeMap[params.type as string];

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        页面不存在
      </div>
    );
  }

  return <KnowledgeLibrary title={config.title} type={config.type} />;
}
