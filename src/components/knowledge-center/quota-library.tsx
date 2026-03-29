'use client';

import { useState, useMemo, useRef } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { KnowledgeListSkeleton } from './skeleton';
import type { KnowledgeEntry } from '@/types/knowledge';
import { toast } from 'sonner';
import { QUOTA_TYPES } from '@/types/knowledge';
import { getClientAuthHeaders } from '@/lib/client-utils';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  uploading:  { label: '上传中', cls: 'bg-blue-100 text-blue-700' },
  pending:    { label: '审核中', cls: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: '已通过', cls: 'bg-green-100 text-green-700' },
  rejected:   { label: '已拒绝', cls: 'bg-red-100 text-red-700' },
};

export default function QuotaLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [quotaType, setQuotaType] = useState('all');
  const [region, setRegion] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<KnowledgeEntry[]>([]);
  const isFirstLoad = useRef(true);

  const metadataFilter = useMemo(() => {
    const filter: Record<string, any> = {};
    if (quotaType !== 'all') filter.quota_type = quotaType;
    if (region !== 'all') filter.region = region;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }, [quotaType, region]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('quota', {
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading, progress: uploadProgress } = useKnowledgeUpload('quota');

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

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[]; onProgress?: (percent: number) => void }) => {
    const tempId = `temp_${Date.now()}`;
    const tempItem: KnowledgeEntry = {
      id: tempId, user_id: '', type: 'quota', title: params.title,
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

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🧮</span> 定额库
          <span className="text-sm font-normal text-gray-500 ml-2">{total}条定额</span>
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowUploadDialog(true)}>
            <span>📤</span> 上传定额
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

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 mr-4">
          {['全部', ...QUOTA_TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setQuotaType(t === '全部' ? 'all' : t)}
              className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                (t === '全部' ? 'all' : t) === quotaType ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索 */}
      <div className="mb-4 flex gap-2 items-center">
        <input
          type="text"
          placeholder="搜索定额名称、编号..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded"
        />
        {searchTerm && (
          <Button size="sm" variant="ghost" onClick={() => setSearchTerm('')}>清除</Button>
        )}
      </div>

      {/* 首次加载骨架屏 */}
      {loading && isFirstLoad.current && <KnowledgeListSkeleton variant="table" count={3} />}

      {/* 列表内容 */}
      {!loading || !isFirstLoad.current ? (
        <>
          {/* 表格 */}
          {displayItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border">定额编号</th>
                    <th className="text-left p-2 border">定额名称</th>
                    <th className="text-left p-2 border">类型</th>
                    <th className="text-left p-2 border">单位</th>
                    <th className="text-right p-2 border">基价</th>
                    <th className="text-right p-2 border">人工费</th>
                    <th className="text-right p-2 border">材料费</th>
                    <th className="text-right p-2 border">机械费</th>
                    <th className="text-left p-2 border">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => {
                    const m = item.metadata || {};
                    const isOptimistic = item.id.startsWith('temp_');
                    const badge = STATUS_BADGE[item.status];
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 ${isOptimistic ? 'bg-yellow-50' : ''}`}>
                        <td className="p-2 border font-mono text-xs">{m.quota_code || '-'}</td>
                        <td className="p-2 border">
                          <div>{item.title}</div>
                          {badge && item.status !== 'approved' && (
                            <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                          {item.status === 'rejected' && item.reject_reason && (
                            <div className="text-xs text-red-500 mt-1">拒绝原因：{item.reject_reason}</div>
                          )}
                        </td>
                        <td className="p-2 border text-xs">{m.quota_type || '-'}</td>
                        <td className="p-2 border text-xs">{m.unit || '-'}</td>
                        <td className="p-2 border text-right">{m.base_price != null ? Number(m.base_price).toFixed(2) : '-'}</td>
                        <td className="p-2 border text-right">{m.labor_cost != null ? Number(m.labor_cost).toFixed(2) : '-'}</td>
                        <td className="p-2 border text-right">{m.material_cost != null ? Number(m.material_cost).toFixed(2) : '-'}</td>
                        <td className="p-2 border text-right">{m.machine_cost != null ? Number(m.machine_cost).toFixed(2) : '-'}</td>
                        <td className="p-2 border">
                          {item.status === 'uploading' ? (
                            <span className="text-xs text-blue-500">上传中...</span>
                          ) : item.status === 'pending' ? (
                            <span className="text-xs text-yellow-600">等待审核</span>
                          ) : item.status === 'rejected' ? (
                            <span className="text-xs text-red-500">已拒绝</span>
                          ) : item.file_url && permissions.can_download ? (
                            <button
                              onClick={() => handleDownload(item.id)}
                              className="text-xs text-green-600 hover:text-green-800"
                            >
                              下载{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                            </button>
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

          {/* 搜索无结果 */}
          {displayItems.length === 0 && searchTerm && (
            <div className="text-center py-10 text-gray-500">
              <div className="text-5xl mb-3">🔍</div>
              <div>未找到匹配的定额数据</div>
            </div>
          )}

          {/* 正常空状态 */}
          {displayItems.length === 0 && !searchTerm && (
            <div className="text-center py-10 text-gray-500">
              <div className="text-5xl mb-3">🧮</div>
              <div>暂无定额数据</div>
              <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                上传定额数据
              </Button>
            </div>
          )}
        </>
      ) : null}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <UserUploadDialog
          type="quota"
          metadataFields={[
            { key: 'quota_type', label: '定额类型', type: 'select', options: QUOTA_TYPES },
            { key: 'region', label: '地区', type: 'text', placeholder: '如：全国、广东' },
            { key: 'industry', label: '行业', type: 'text', placeholder: '如：环保工程' },
            { key: 'quota_code', label: '定额编号', type: 'text', placeholder: '如：D1-001' },
            { key: 'unit', label: '单位', type: 'text', placeholder: '如：m³、台' },
            { key: 'base_price', label: '基价', type: 'number' },
            { key: 'labor_cost', label: '人工费', type: 'number' },
            { key: 'material_cost', label: '材料费', type: 'number' },
            { key: 'machine_cost', label: '机械费', type: 'number' },
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
