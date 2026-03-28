'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { DOCUMENT_CATEGORIES } from '@/types/knowledge';

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
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const metadataFilter = useMemo(() => {
    if (category === 'all') return undefined;
    return { category };
  }, [category]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('document', {
    include_mine: true,
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading } = useKnowledgeUpload('document');

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

  const handleUpload = async (params: { file: File; title: string; description: string; metadata: Record<string, any>; tags: string[] }) => {
    await uploadFile(params);
    refresh();
  };

  const handleDirectDownload = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    a.click();
  };

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
          <Button size="sm" variant="outline" onClick={refresh}>
            <span>🔄</span> 刷新
          </Button>
        </div>
      </div>

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
        {DOCUMENT_CATEGORIES.map((cat) => (
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
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="text-center py-10 text-gray-500">加载中...</div>
      )}

      {/* 文档列表 - 网格视图 */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((doc) => (
            <div key={doc.id} className={`border rounded-lg p-3 hover:shadow-md transition-shadow ${doc.status !== 'approved' ? 'opacity-70' : ''}`}>
              <div className="flex items-start gap-3">
                {doc.status === 'approved' && <span className="text-3xl">{getFileIcon(doc.file_name)}</span>}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" title={doc.title}>{doc.title}</div>
                  {doc.status !== 'approved' && (
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                      doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {doc.status === 'pending' ? '待审核' : '已拒绝'}
                    </span>
                  )}
                  {doc.reject_reason && (
                    <div className="text-xs text-red-500 mt-1">拒绝原因：{doc.reject_reason}</div>
                  )}
                  {doc.status === 'approved' && (
                    <>
                      <div className="text-xs text-gray-500 mt-1">{formatFileSize(doc.file_size)}</div>
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {doc.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {doc.description && (
                        <div className="text-xs text-gray-600 mt-2 line-clamp-2">{doc.description}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center mt-3 pt-2 border-t">
                <span className="text-xs text-gray-400">{doc.created_at?.split('T')[0]}</span>
                {doc.status === 'approved' && doc.file_url && permissions.can_download && (
                  <button
                    onClick={() => handleDownload(doc.id)}
                    className="text-xs text-green-600 hover:text-green-800"
                  >
                    下载{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">📄</div>
          <div>暂无文档</div>
          <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
            上传第一个文档
          </Button>
        </div>
      )}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <UserUploadDialog
          type="document"
          metadataFields={[
            { key: 'category', label: '分类', type: 'select', options: DOCUMENT_CATEGORIES },
          ]}
          onClose={() => setShowUploadDialog(false)}
          onSubmit={handleUpload}
          uploading={uploading}
        />
      )}
    </div>
  );
}
