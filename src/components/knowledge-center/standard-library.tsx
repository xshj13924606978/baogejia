'use client';

import { useState, useMemo } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { toast } from 'sonner';
import { STANDARD_TYPES, STANDARD_STATUSES } from '@/types/knowledge';

export default function StandardLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stdType, setStdType] = useState('all');
  const [effectiveStatus, setEffectiveStatus] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const metadataFilter = useMemo(() => {
    const filter: Record<string, any> = {};
    if (stdType !== 'all') filter.standard_type = stdType;
    if (effectiveStatus !== 'all') filter.effective_status = effectiveStatus;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }, [stdType, effectiveStatus]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('standard', {
    include_mine: true,
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading } = useKnowledgeUpload('standard');

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[] }) => {
    await uploadFile(params);
    refresh();
  };

  const handleDownload = async (entryId: string) => {
    try {
      const res = await fetch('/api/knowledge/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          <Button size="sm" variant="outline" onClick={refresh}>
            <span>🔄</span> 刷新
          </Button>
        </div>
      </div>

      {/* 双重筛选 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 mr-4">
          {['全部', ...STANDARD_TYPES].map((t) => (
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
      </div>

      {/* 加载 */}
      {loading && <div className="text-center py-10 text-gray-500">加载中...</div>}

      {/* 表格 */}
      {!loading && items.length > 0 && (
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
              {items.map((item) => {
                const m = item.metadata || {};
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="p-2 border font-mono text-xs">{m.standard_code || '-'}</td>
                    <td className="p-2 border">
                      <div>{item.title}</div>
                      {item.status !== 'approved' && (
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.status === 'pending' ? '待审核' : '已拒绝'}
                          {item.reject_reason && `：${item.reject_reason}`}
                        </span>
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
                      {item.status === 'approved' && item.file_url && permissions.can_download ? (
                        <button
                          onClick={() => handleDownload(item.id)}
                          className="text-xs text-green-600 hover:text-green-800"
                        >
                          下载{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                        </button>
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
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">📖</div>
          <div>暂无标准规范</div>
          <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
            上传第一个标准
          </Button>
        </div>
      )}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <UserUploadDialog
          type="standard"
          metadataFields={[
            { key: 'standard_code', label: '标准编号', type: 'text', placeholder: '如：GB 50014-2021' },
            { key: 'standard_type', label: '标准类型', type: 'select', options: STANDARD_TYPES },
            { key: 'industry', label: '行业', type: 'text', placeholder: '如：建筑给排水' },
            { key: 'publish_date', label: '发布日期', type: 'date' },
            { key: 'effective_status', label: '实施状态', type: 'select', options: STANDARD_STATUSES },
          ]}
          onClose={() => setShowUploadDialog(false)}
          onSubmit={handleUpload}
          uploading={uploading}
        />
      )}
    </div>
  );
}
