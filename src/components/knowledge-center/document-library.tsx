'use client';

import { useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { KnowledgeListSkeleton } from './skeleton';
import { DOCUMENT_CATEGORIES } from '@/types/knowledge';
import { useCategories } from '@/hooks/useCategories';
import type { KnowledgeEntry } from '@/types/knowledge';
import { getClientAuthHeaders } from '@/lib/client-utils';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  uploading:  { label: '上传中', cls: 'bg-blue-100 text-blue-700' },
  pending:    { label: '审核中', cls: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: '已通过', cls: 'bg-green-100 text-green-700' },
  rejected:   { label: '已拒绝', cls: 'bg-red-100 text-red-700' },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'doc' || ext === 'docx') return '📘';
  if (ext === 'xls' || ext === 'xlsx') return '📗';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
  return '📄';
}

export default function DocumentLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const { categoryNames: dbCategories } = useCategories('document');
  const categories = dbCategories.length > 0 ? dbCategories : DOCUMENT_CATEGORIES;
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<KnowledgeEntry[]>([]);
  const isFirstLoad = useRef(true);

  const metadataFilter = useMemo(() => {
    if (category === 'all') return undefined;
    return { category };
  }, [category]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('document', {
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading, progress: uploadProgress } = useKnowledgeUpload('document');

  if (!loading && isFirstLoad.current) {
    isFirstLoad.current = false;
  }

  // 合并乐观更新数据，同时清除已被 approved 列表收录的条目
  const displayItems = useMemo(() => {
    const approvedIds = new Set(items.map(i => i.id));
    const kept = optimisticItems.filter(i => !approvedIds.has(i.id));
    if (kept.length !== optimisticItems.length) {
      // 异步清理，避免在 useMemo 中 setState
      setTimeout(() => setOptimisticItems(kept), 0);
    }
    return [...kept, ...items];
  }, [optimisticItems, items]);

  const handleDownload = async (entryId: string) => {
    try {
      const res = await fetch('/api/knowledge/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.points_deducted > 0) toast.info(data.message);
        const a = document.createElement('a');
        a.href = data.file_url;
        a.download = data.file_name;
        a.target = '_blank';
        a.click();
      } else {
        toast.error(data.error || '下载失败');
      }
    } catch { toast.error('网络错误'); }
  };

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[]; onProgress?: (percent: number) => void }) => {
    const tempId = `temp_${Date.now()}`;
    const tempItem: KnowledgeEntry = {
      id: tempId, user_id: '', type: 'document', title: params.title,
      description: params.description, file_name: params.file.name, file_key: '',
      file_url: '', file_size: params.file.size, file_type: params.file.type,
      content: '', metadata: params.metadata, status: 'uploading' as any,
      reject_reason: null, reviewed_by: null, reviewed_at: null,
      views: 0, downloads: 0, uploader_name: '我', tags: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setOptimisticItems(prev => [tempItem, ...prev]);

    try {
      const result = await uploadFile(params);
      // 上传完成：用真实 id 替换临时 id，并刷新 API 数据
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
      // 上传失败：移除并标记错误
      setOptimisticItems(prev => prev.filter(i => i.id !== tempId));
      throw new Error('上传失败');
    }
  };

  const clearSearch = () => { setSearchTerm(''); setCategory('all'); };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📄</span> 技术文档库
          <span className="text-sm font-normal text-gray-500 ml-2">{total}个文档</span>
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowUploadDialog(true)}>
            <span>📤</span> 上传文档
          </Button>
          <Button size="sm" variant="outline" onClick={() => refresh()}>
            <span>🔄</span> 刷新
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
          onClick={() => setCategory('all')}
          className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
            category === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
          }`}
        >
          全部
        </button>
{categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                  category === cat ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索文档名称..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border rounded"
        />
        {searchTerm && (
          <Button size="sm" variant="ghost" onClick={clearSearch}>清除</Button>
        )}
      </div>

      {/* 骨架屏加载 */}
      {loading && isFirstLoad.current && <KnowledgeListSkeleton variant="card" count={2} />}

      {/* 文档列表 - 网格视图 */}
      {!loading || !isFirstLoad.current ? (
        <>
          {displayItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayItems.map((doc) => {
                const isOptimistic = doc.id.startsWith('temp_');
                const badge = STATUS_BADGE[doc.status];
                const isPendingLike = doc.status === 'uploading' || doc.status === 'pending' || doc.status === 'rejected';
                return (
                  <div key={doc.id} className={`border rounded-lg p-3 hover:shadow-md transition-shadow ${isOptimistic ? 'border-yellow-200' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{isPendingLike ? '🔒' : getFileIcon(doc.file_name)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={doc.title}>{doc.title}</div>
                        {/* 状态标签：基于 doc.status 显示，不仅限 isOptimistic */}
                        {badge && doc.status !== 'approved' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                        {doc.status === 'rejected' && doc.reject_reason && (
                          <div className="text-xs text-red-500 mt-1">拒绝原因：{doc.reject_reason}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">{formatFileSize(doc.file_size)}</div>
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.tags.map((tag) => (
                              <span key={tag} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{tag}</span>
                            ))}
                          </div>
                        )}
                        {doc.description && (
                          <div className="text-xs text-gray-600 mt-2 line-clamp-2">{doc.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-2 border-t">
                      <span className="text-xs text-gray-400">{doc.created_at?.split('T')[0]}</span>
                      {doc.status === 'uploading' ? (
                        <span className="text-xs text-blue-500">上传中 {uploadProgress}%</span>
                      ) : doc.status === 'pending' ? (
                        <span className="text-xs text-yellow-600">等待审核</span>
                      ) : doc.status === 'rejected' ? (
                        <span className="text-xs text-red-500">已拒绝</span>
                      ) : doc.file_url && permissions.can_download ? (
                        <button onClick={() => handleDownload(doc.id)} className="text-xs text-green-600 hover:text-green-800">
                          下载{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                        </button>
                      ) : doc.file_url ? (
                        <span className="text-xs text-gray-400">当前等级暂无下载权限</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchTerm ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-medium">未找到相关文档</div>
              <p className="text-sm text-gray-400 mt-1">尝试其他关键词，或清空搜索条件</p>
              <Button size="sm" variant="link" className="mt-2" onClick={clearSearch}>清空搜索</Button>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-3">📄</div>
              <div className="font-medium">暂无文档</div>
              <p className="text-sm text-gray-400 mt-1">点击上方按钮上传你的第一个文档</p>
              <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                <span>📤</span> 上传文档
              </Button>
            </div>
          )}
        </>
      ) : null}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <UserUploadDialog
          type="document"
          metadataFields={[
            { key: 'category', label: '分类', type: 'select', options: categories },
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
