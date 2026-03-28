'use client';

import { useState, useMemo } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { toast } from 'sonner';
import { DRAWING_TYPES } from '@/types/knowledge';

export default function DrawingLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [drawingType, setDrawingType] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const metadataFilter = useMemo(() => {
    if (drawingType === 'all') return undefined;
    return { drawing_type: drawingType };
  }, [drawingType]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('drawing', {
    include_mine: true,
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading } = useKnowledgeUpload('drawing');

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

  const isImage = (fileType: string | null) => {
    return fileType && ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(fileType);
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
          <Button size="sm" variant="outline" onClick={refresh}>
            <span>🔄</span> 刷新
          </Button>
        </div>
      </div>

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
        {DRAWING_TYPES.map((t) => (
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
      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索图纸名称、项目..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      {/* 加载 */}
      {loading && <div className="text-center py-10 text-gray-500">加载中...</div>}

      {/* 网格视图 */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => {
            const m = item.metadata || {};
            return (
              <div key={item.id} className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${item.status !== 'approved' ? 'opacity-70' : ''}`}>
                {/* 缩略图或占位 - 仅已通过时显示 */}
                <div className="h-36 bg-gray-100 flex items-center justify-center">
                  {item.status === 'approved' && isImage(item.file_type) ? (
                    <img
                      src={item.file_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : item.status === 'approved' ? (
                    <span className="text-4xl opacity-30">📐</span>
                  ) : (
                    <span className="text-3xl opacity-30">{item.status === 'pending' ? '⏳' : '❌'}</span>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-sm truncate" title={item.title}>{item.title}</div>
                  {item.status !== 'approved' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {item.status === 'pending' ? '待审核' : '已拒绝'}
                    </span>
                  )}
                  {item.reject_reason && (
                    <div className="text-xs text-red-500 mt-1">拒绝原因：{item.reject_reason}</div>
                  )}
                  {item.status === 'approved' && (
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
                    {item.status === 'approved' && item.file_url && permissions.can_download && (
                      <button
                        onClick={() => handleDownload(item.id)}
                        className="text-xs text-green-600 hover:text-green-800"
                      >
                        下载{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 空状态 */}
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🖼️</div>
          <div>暂无图纸</div>
          <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
            上传第一个图纸
          </Button>
        </div>
      )}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <UserUploadDialog
          type="drawing"
          metadataFields={[
            { key: 'drawing_type', label: '图纸类型', type: 'select', options: DRAWING_TYPES },
            { key: 'project', label: '所属项目', type: 'text', placeholder: '项目名称' },
            { key: 'version', label: '版本号', type: 'text', placeholder: '如：V1.0' },
          ]}
          onClose={() => setShowUploadDialog(false)}
          onSubmit={handleUpload}
          uploading={uploading}
        />
      )}
    </div>
  );
}
