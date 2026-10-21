'use client';

import { useState, useMemo, useRef } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import KnowledgeUploader from './knowledge-uploader';
import { toast } from 'sonner';
import { CASE_PROJECT_TYPES } from '@/types/knowledge';
import { useCategories } from '@/hooks/useCategories';
import { KnowledgeListSkeleton } from './skeleton';
import type { KnowledgeEntry } from '@/types/knowledge';
import { getClientAuthHeaders } from '@/lib/client-utils';
import FileDownloadButton from './FileDownloadButton';
import { getKnowledgeFileName } from '@/lib/knowledge/utils';
import { useKnowledgeHighlight } from '@/hooks/useKnowledgeHighlight';

interface CaseLibraryProps {
  highlightId?: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  uploading:  { label: '上传中', cls: 'bg-blue-100 text-blue-700' },
  pending:    { label: '审核中', cls: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: '已通过', cls: 'bg-green-100 text-green-700' },
  rejected:   { label: '已拒绝', cls: 'bg-red-100 text-red-700' },
};

export default function CaseLibrary({ highlightId }: CaseLibraryProps) {
  const highlight = useKnowledgeHighlight(highlightId);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const { categoryNames: dbCategories } = useCategories('case');
  const projectTypes = dbCategories.length > 0 ? dbCategories : CASE_PROJECT_TYPES;
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<KnowledgeEntry[]>([]);
  const isFirstLoad = useRef(true);

  const metadataFilter = useMemo(() => {
    if (filterType === 'all') return undefined;
    return { project_type: filterType };
  }, [filterType]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('case', {
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  if (!loading && isFirstLoad.current) {
    isFirstLoad.current = false;
  }

  const displayItems = useMemo(() => {
    const approvedIds = new Set(items.map(i => i.id));
    const kept = optimisticItems.filter(i => !approvedIds.has(i.id));
    if (kept.length !== optimisticItems.length) {
      setTimeout(() => setOptimisticItems(kept), 0);
    }
    return [...kept, ...items];
  }, [optimisticItems, items]);

  const { uploadFile, uploading, progress: uploadProgress } = useKnowledgeUpload('case');

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[]; onProgress?: (percent: number) => void }) => {
    const tempItem: KnowledgeEntry = {
      id: `temp_${Date.now()}`, user_id: '', type: 'case', title: params.title, description: params.description,
      file_name: params.file.name, file_key: '', file_url: '', file_size: params.file.size, file_type: params.file.type,
      content: '', metadata: params.metadata, status: 'uploading' as any, reject_reason: null, reviewed_by: null, reviewed_at: null, views: 0, downloads: 0,
      uploader_name: '我', tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setOptimisticItems(prev => [tempItem, ...prev]);
    try {
      const result = await uploadFile(params);
      const realId = result?.data?.id;
      setOptimisticItems(prev => prev.map(i =>
        i.id === tempItem.id ? { ...i, id: realId || i.id, status: 'pending' as any } : i
      ));
      refresh();
      toast.success('文件上传成功，等待管理员审核', {
        action: { label: '查看审核进度', onClick: () => {
          const tab = document.querySelector('[data-tab="my-uploads"]') as HTMLElement;
          tab?.click();
        }},
        duration: 6000,
      });
    } catch {
      setOptimisticItems(prev => prev.filter(i => i.id !== tempItem.id));
      throw new Error('上传失败');
    }
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🏗️</span> 案例库
          <span className="text-sm font-normal text-gray-500 ml-2">{total}个案例</span>
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowUploadDialog(true)}>
            <span>📥</span> 导入案例
          </Button>
          <Button size="sm" variant="outline" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 审核进展提示条 */}
      {optimisticItems.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-yellow-700">
            <span>⏳</span>
            <span>{optimisticItems.length}个文件等待审核</span>
          </div>
          <button
            data-tab="my-uploads"
            className="text-sm text-yellow-700 hover:text-yellow-900 underline"
            onClick={() => {
              const tab = document.querySelector('[data-tab="my-uploads"]') as HTMLElement;
              tab?.click();
            }}
          >
            查看详情
          </button>
        </div>
      )}

      {/* 分类标签 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['全部', ...projectTypes].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type === '全部' ? 'all' : type)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              (type === '全部' ? 'all' : type) === filterType
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索案例名称..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border rounded"
        />
        {searchTerm && (
          <Button size="sm" variant="ghost" onClick={() => { setSearchTerm(''); setFilterType('all'); }}>清除</Button>
        )}
      </div>

      {/* 骨架屏加载 */}
      {loading && isFirstLoad.current && <KnowledgeListSkeleton variant="wide" count={3} />}

      {/* 案例列表 */}
      {!loading || !isFirstLoad.current ? (
        <>
          {displayItems.length > 0 ? (
            <div className="space-y-4">
              {displayItems.map((doc) => {
                const m = doc.metadata || {};
                const isOptimistic = doc.id.startsWith('temp_');
                const badge = STATUS_BADGE[doc.status];
                const isPendingLike = doc.status === 'uploading' || doc.status === 'pending' || doc.status === 'rejected';
                return (
                  <div
                    key={doc.id}
                    className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${isOptimistic ? 'border-yellow-200' : ''} ${highlight(doc.id).active ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 border-blue-500' : ''}`}
                    {...highlight(doc.id).attrs}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {isPendingLike && <span className="text-sm">🔒</span>}
                          <h4 className="font-bold text-base">{doc.title}</h4>
                          {badge && doc.status !== 'approved' && (
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        {doc.description && <p className="text-sm text-gray-600 mt-1 mb-3">{doc.description}</p>}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          {m.project_type && (<div><span className="text-gray-500">类型：</span><span className="font-medium">{m.project_type}</span></div>)}
                          {m.industry && (<div><span className="text-gray-500">行业：</span><span className="font-medium">{m.industry}</span></div>)}
                          {m.scale && (<div><span className="text-gray-500">规模：</span><span className="font-medium">{m.scale}</span></div>)}
                          {m.budget && (<div><span className="text-gray-500">预算：</span><span className="font-medium text-red-600">{m.budget}</span></div>)}
                          {m.completion_date && (<div className="col-span-2 md:col-span-4"><span className="text-gray-500">完成时间：</span><span className="font-medium">{m.completion_date}</span></div>)}
                        </div>
                        {doc.status === 'rejected' && doc.reject_reason && (
                          <div className="text-xs text-red-500 mt-1">拒绝原因：{doc.reject_reason}</div>
                        )}
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {doc.tags.map((tag) => (<span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{tag}</span>))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-2 border-t">
                      <span className="text-xs text-gray-400">{doc.created_at?.split('T')[0]}</span>
                      {doc.status === 'uploading' ? (
                        <span className="text-xs text-blue-500">上传中...</span>
                      ) : doc.status === 'pending' ? (
                        <span className="text-xs text-yellow-600">等待审核</span>
                      ) : doc.status === 'rejected' ? (
                        <span className="text-xs text-red-500">已拒绝</span>
                      ) : doc.file_url && permissions.can_download ? (
                        <FileDownloadButton entryId={doc.id} fileName={getKnowledgeFileName(doc)} cost={permissions.download_cost}>
                          下载附件{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                        </FileDownloadButton>
                      ) : doc.file_url ? (
                        <span className="text-xs text-gray-400">当前角色暂无下载权限</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchTerm ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-medium">未找到相关案例</div>
              <p className="text-sm text-gray-400 mt-1">尝试其他关键词，或清空搜索条件</p>
              <Button size="sm" variant="link" className="mt-2" onClick={() => { setSearchTerm(''); setFilterType('all'); }}>清空搜索</Button>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-3">🏗️</div>
              <div className="font-medium">暂无案例</div>
              <p className="text-sm text-gray-400 mt-1">点击上方按钮导入你的第一个案例</p>
              <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                <span>📥</span> 导入案例
              </Button>
            </div>
          )}
        </>
      ) : null}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <KnowledgeUploader
          type="case"
          metadataFields={[
            { key: 'project_type', label: '项目类型', type: 'select', options: projectTypes },
            { key: 'industry', label: '行业', type: 'text', placeholder: '如：环保工程' },
            { key: 'scale', label: '规模', type: 'text', placeholder: '如：5000m³/d' },
            { key: 'budget', label: '预算', type: 'text', placeholder: '如：1200万元' },
            { key: 'completion_date', label: '完成日期', type: 'date' },
          ]}
          onClose={() => setShowUploadDialog(false)}
          onSubmit={handleUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );
}
