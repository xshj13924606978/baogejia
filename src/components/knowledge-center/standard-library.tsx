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
import { STANDARD_TYPES, STANDARD_STATUSES } from '@/types/knowledge';
import { useCategories } from '@/hooks/useCategories';
import { getClientAuthHeaders } from '@/lib/client-utils';
import FileDownloadButton from './FileDownloadButton';
import { getKnowledgeFileName } from '@/lib/knowledge/utils';
import { useKnowledgeHighlight } from '@/hooks/useKnowledgeHighlight';

interface StandardLibraryProps {
  highlightId?: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  uploading:  { label: '上传中', cls: 'bg-blue-100 text-blue-700' },
  pending:    { label: '审核中', cls: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: '已通过', cls: 'bg-green-100 text-green-700' },
  rejected:   { label: '已拒绝', cls: 'bg-red-100 text-red-700' },
};

export default function StandardLibrary({ highlightId }: StandardLibraryProps) {
  const highlight = useKnowledgeHighlight(highlightId);
  const [searchTerm, setSearchTerm] = useState('');
  const [stdType, setStdType] = useState('all');
  const [effectiveStatus, setEffectiveStatus] = useState('all');
  const { categoryNames: dbStdTypes } = useCategories('standard');
  const stdTypes = dbStdTypes.length > 0 ? dbStdTypes : STANDARD_TYPES;
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<KnowledgeEntry[]>([]);
  const isFirstLoad = useRef(true);

  const metadataFilter = useMemo(() => {
    const filter: Record<string, any> = {};
    if (stdType !== 'all') filter.standard_type = stdType;
    if (effectiveStatus !== 'all') filter.effective_status = effectiveStatus;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }, [stdType, effectiveStatus]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('standard', {
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

  const { uploadFile, uploading, progress: uploadProgress } = useKnowledgeUpload('standard');

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[]; onProgress?: (percent: number) => void }) => {
    const tempId = `temp_${Date.now()}`;
    const tempItem: KnowledgeEntry = {
      id: tempId, user_id: '', type: 'standard', title: params.title, description: params.description,
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

  const statusColors: Record<string, string> = {
    '现行': 'text-green-600 bg-green-50',
    '废止': 'text-red-600 bg-red-50',
    '修订中': 'text-orange-600 bg-orange-50',
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📖</span> 标准规范库
          <span className="text-sm font-normal text-gray-500 ml-2">{total}个标准</span>
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowUploadDialog(true)}>
            <span>📤</span> 上传标准
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
            <span>{optimisticItems.length}个标准等待审核</span>
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

      {/* 双重筛选 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 mr-4">
          {['全部', ...stdTypes].map((t) => (
            <button
              key={t}
              onClick={() => setStdType(t === '全部' ? 'all' : t)}
              className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                (t === '全部' ? 'all' : t) === stdType ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {['全部', ...STANDARD_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setEffectiveStatus(s === '全部' ? 'all' : s)}
              className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                (s === '全部' ? 'all' : s) === effectiveStatus ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索 */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索标准名称、编号..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded"
        />
        {searchTerm && (
          <Button size="sm" variant="ghost" onClick={() => { setSearchTerm(''); setStdType('all'); setEffectiveStatus('all'); }}>清除</Button>
        )}
      </div>

      {/* 骨架屏 */}
      {loading && isFirstLoad.current && <KnowledgeListSkeleton variant="table" count={4} />}

      {/* 列表 */}
      {!loading || !isFirstLoad.current ? (
        <>
          {/* 表格 */}
          {displayItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border">标准编号</th>
                    <th className="text-left p-2 border">标准名称</th>
                    <th className="text-left p-2 border">类型</th>
                    <th className="text-left p-2 border">行业</th>
                    <th className="text-left p-2 border">发布日期</th>
                    <th className="text-left p-2 border">状态</th>
                    <th className="text-left p-2 border">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => {
                    const m = item.metadata || {};
                    const isOptimistic = item.id.startsWith('temp_');
                    const badge = STATUS_BADGE[item.status];
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50 ${isOptimistic ? 'bg-yellow-50' : ''} ${highlight(item.id).active ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                        {...highlight(item.id).attrs}
                      >
                        <td className="p-2 border font-mono text-xs">{m.standard_code || '-'}</td>
                        <td className="p-2 border">
                          <div>{item.title}</div>
                          {badge && item.status !== 'approved' && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                          {item.status === 'rejected' && item.reject_reason && (
                            <span className="text-xs text-red-500 ml-1">{item.reject_reason}</span>
                          )}
                        </td>
                        <td className="p-2 border">{m.standard_type || '-'}</td>
                        <td className="p-2 border">{m.industry || '-'}</td>
                        <td className="p-2 border text-xs">{m.publish_date || '-'}</td>
                        <td className="p-2 border">
                          {m.effective_status && (
                            <span className={`px-2 py-0.5 rounded text-xs ${statusColors[m.effective_status] || ''}`}>
                              {m.effective_status}
                            </span>
                          )}
                        </td>
                        <td className="p-2 border">
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
                          ) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 空状态 */}
          {displayItems.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <div className="text-5xl mb-3">📖</div>
              {searchTerm ? (
                <div>
                  <div>未找到匹配"{searchTerm}"的标准</div>
                  <div className="text-sm mt-1">请尝试其他关键词或清除筛选条件</div>
                </div>
              ) : (
                <>
                  <div>暂无标准规范</div>
                  <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                    上传第一个标准
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
          type="standard"
          metadataFields={[
            { key: 'standard_code', label: '标准编号', type: 'text', placeholder: '如：GB 50014-2021' },
            { key: 'standard_type', label: '标准类型', type: 'select', options: stdTypes },
            { key: 'industry', label: '行业', type: 'text', placeholder: '如：建筑给排水' },
            { key: 'publish_date', label: '发布日期', type: 'date' },
            { key: 'effective_status', label: '实施状态', type: 'select', options: STANDARD_STATUSES },
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
