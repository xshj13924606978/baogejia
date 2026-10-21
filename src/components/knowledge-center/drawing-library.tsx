'use client';

import { useState, useMemo, useRef } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import KnowledgeUploader from './knowledge-uploader';
import { KnowledgeListSkeleton } from './skeleton';
import type { KnowledgeEntry } from '@/types/knowledge';
import { toast } from 'sonner';
import { DRAWING_TYPES } from '@/types/knowledge';
import { useCategories } from '@/hooks/useCategories';
import { getClientAuthHeaders } from '@/lib/client-utils';
import FileDownloadButton from './FileDownloadButton';
import { getKnowledgeFileName } from '@/lib/knowledge/utils';
import { useKnowledgeHighlight } from '@/hooks/useKnowledgeHighlight';

interface DrawingLibraryProps {
  highlightId?: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  uploading:  { label: '上传中', cls: 'bg-blue-100 text-blue-700' },
  pending:    { label: '审核中', cls: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: '已通过', cls: 'bg-green-100 text-green-700' },
  rejected:   { label: '已拒绝', cls: 'bg-red-100 text-red-700' },
};

export default function DrawingLibrary({ highlightId }: DrawingLibraryProps) {
  const highlight = useKnowledgeHighlight(highlightId);
  const [searchTerm, setSearchTerm] = useState('');
  const [drawingType, setDrawingType] = useState('all');
  const { categoryNames: dbDrawingTypes } = useCategories('drawing');
  const drawingTypes = dbDrawingTypes.length > 0 ? dbDrawingTypes : DRAWING_TYPES;
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<KnowledgeEntry[]>([]);
  const isFirstLoad = useRef(true);

  const metadataFilter = useMemo(() => {
    if (drawingType === 'all') return undefined;
    return { drawing_type: drawingType };
  }, [drawingType]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('drawing', {
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  if (!loading && isFirstLoad.current) {
    isFirstLoad.current = false;
  }

  const { uploadFile, uploading, progress: uploadProgress } = useKnowledgeUpload('drawing');

  const displayItems = useMemo(() => {
    const approvedIds = new Set(items.map(i => i.id));
    const kept = optimisticItems.filter(i => !approvedIds.has(i.id));
    if (kept.length !== optimisticItems.length) {
      setTimeout(() => setOptimisticItems(kept), 0);
    }
    return [...kept, ...items];
  }, [optimisticItems, items]);

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[]; onProgress?: (percent: number) => void }) => {
    const tempId = `temp_${Date.now()}`;
    const tempItem: KnowledgeEntry = {
      id: tempId, user_id: '', type: 'drawing', title: params.title, description: params.description,
      file_name: params.file.name, file_key: '', file_url: '', file_size: params.file.size, file_type: params.file.type,
      content: '', metadata: params.metadata, status: 'uploading' as any, reject_reason: null, reviewed_by: null, reviewed_at: null, views: 0, downloads: 0,
      uploader_name: '我', tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setOptimisticItems(prev => [tempItem, ...prev]);
    try {
      const result = await uploadFile(params);
      const realId = result?.data?.id;
      setOptimisticItems(prev => prev.map(i =>
        i.id === tempId ? { ...i, id: realId || i.id, status: 'pending' as any } : i
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
      setOptimisticItems(prev => prev.filter(i => i.id !== tempId));
      throw new Error('上传失败');
    }
  };

  const isImage = (fileType: string | null) => {
    return (
      fileType &&
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'].includes(fileType)
    );
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🖼️</span> 图纸图片库
          <span className="text-sm font-normal text-gray-500 ml-2">{total}个图纸</span>
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowUploadDialog(true)}>
            <span>📤</span> 上传图纸
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
        <button
          onClick={() => setDrawingType('all')}
          className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
            drawingType === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
          }`}
        >
          全部
        </button>
{drawingTypes.map((t) => (
              <button
                key={t}
                onClick={() => setDrawingType(t)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              drawingType === t ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索图纸名称、项目..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border rounded"
        />
        {searchTerm && (
          <Button size="sm" variant="ghost" onClick={() => setSearchTerm('')}>清除</Button>
        )}
      </div>

      {/* 加载骨架屏（仅首次加载） */}
      {loading && isFirstLoad.current && <KnowledgeListSkeleton variant="card" count={2} />}

      {/* 网格视图 */}
      {!loading || !isFirstLoad.current ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayItems.map((item) => {
              const isOptimistic = item.id.startsWith('temp_');
              const badge = STATUS_BADGE[item.status];
              const isPendingLike = item.status === 'uploading' || item.status === 'pending' || item.status === 'rejected';
              const m = item.metadata || {};
              return (
                <div
                  key={item.id}
                  className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${isOptimistic ? 'border-yellow-200' : ''} ${highlight(item.id).active ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 border-blue-500' : ''}`}
                  {...highlight(item.id).attrs}
                >
                  {/* 缩略图或占位 */}
                  <div className="h-36 bg-gray-100 flex items-center justify-center">
                    {isPendingLike ? (
                      <span className="text-4xl opacity-30">🔒</span>
                    ) : !isOptimistic && isImage(item.file_type) ? (
                      <img
                        src={item.file_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : !isOptimistic ? (
                      <span className="text-4xl opacity-30">📐</span>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-sm truncate" title={item.title}>{item.title}</div>
                    {badge && item.status !== 'approved' && (
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                    {item.status === 'rejected' && item.reject_reason && (
                      <div className="text-xs text-red-500 mt-1">拒绝原因：{item.reject_reason}</div>
                    )}
                    {!isOptimistic && item.status === 'approved' && (
                      <>
                        <div className="flex gap-2 mt-1 text-xs text-gray-500">
                          {m.drawing_type && <span>{m.drawing_type}</span>}
                          {m.project && <span>· {m.project}</span>}
                        </div>
                        {m.version && (
                          <div className="text-xs text-gray-400 mt-1">版本：{m.version}</div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between items-center mt-2 pt-2 border-t">
                      <span className="text-xs text-gray-400">{item.created_at?.split('T')[0]}</span>
                      {item.status === 'uploading' ? (
                        <span className="text-xs text-blue-500">上传中...</span>
                      ) : item.status === 'pending' ? (
                        <span className="text-xs text-yellow-600">等待审核</span>
                      ) : item.status === 'rejected' ? (
                        <span className="text-xs text-red-500">已拒绝</span>
                      ) : item.file_url && permissions.can_download ? (
                        <FileDownloadButton entryId={item.id} fileName={getKnowledgeFileName(item)} cost={permissions.download_cost}>
                          下载{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                        </FileDownloadButton>
                      ) : item.file_url ? (
                        <span className="text-xs text-gray-400">暂无权限</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 空状态 */}
          {displayItems.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              {searchTerm ? (
                <>
                  <div className="text-5xl mb-3">🔍</div>
                  <div>未找到匹配的图纸</div>
                </>
              ) : (
                <>
                  <div className="text-5xl mb-3">🖼️</div>
                  <div>暂无图纸</div>
                  <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                    上传第一个图纸
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      ) : null}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <KnowledgeUploader
          type="drawing"
          metadataFields={[
            { key: 'drawing_type', label: '图纸类型', type: 'select', options: drawingTypes },
            { key: 'project', label: '所属项目', type: 'text', placeholder: '项目名称' },
            { key: 'version', label: '版本号', type: 'text', placeholder: '如：V1.0' },
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
