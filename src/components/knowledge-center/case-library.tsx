'use client';

import { useState, useMemo } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { toast } from 'sonner';
import { CASE_PROJECT_TYPES } from '@/types/knowledge';

export default function CaseLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const metadataFilter = useMemo(() => {
    if (filterType === 'all') return undefined;
    return { project_type: filterType };
  }, [filterType]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('case', {
    include_mine: true,
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading } = useKnowledgeUpload('case');

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
          <Button size="sm" variant="outline" onClick={refresh}>
            <span>🔄</span> 刷新
          </Button>
        </div>
      </div>

      {/* 分类标签 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['全部', ...CASE_PROJECT_TYPES].map((type) => (
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
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="text-center py-10 text-gray-500">加载中...</div>
      )}

      {/* 案例列表 */}
      {!loading && (
        <div className="space-y-4">
          {items.map((item) => {
            const m = item.metadata || {};
            return (
              <div key={item.id} className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${item.status !== 'approved' ? 'opacity-70' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-bold text-base mb-2">{item.title}</h4>
                    {item.status !== 'approved' ? (
                      <>
                        <span className={`inline-block mb-2 px-2 py-0.5 rounded text-xs ${
                          item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.status === 'pending' ? '待审核' : '已拒绝'}
                        </span>
                        {item.reject_reason && (
                          <p className="text-xs text-red-500 mb-1">拒绝原因：{item.reject_reason}</p>
                        )}
                      </>
                    ) : (
                      <>
                        {item.description && <p className="text-sm text-gray-600 mb-3">{item.description}</p>}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          {m.project_type && (
                            <div>
                              <span className="text-gray-500">类型：</span>
                              <span className="font-medium">{m.project_type}</span>
                            </div>
                          )}
                          {m.industry && (
                            <div>
                              <span className="text-gray-500">行业：</span>
                              <span className="font-medium">{m.industry}</span>
                            </div>
                          )}
                          {m.scale && (
                            <div>
                              <span className="text-gray-500">规模：</span>
                              <span className="font-medium">{m.scale}</span>
                            </div>
                          )}
                          {m.budget && (
                            <div>
                              <span className="text-gray-500">预算：</span>
                              <span className="font-medium text-red-600">{m.budget}</span>
                            </div>
                          )}
                          {m.completion_date && (
                            <div className="col-span-2 md:col-span-4">
                              <span className="text-gray-500">完成时间：</span>
                              <span className="font-medium">{m.completion_date}</span>
                            </div>
                          )}
                        </div>
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {item.tags.map((tag) => (
                              <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3 pt-2 border-t">
                  <span className="text-xs text-gray-400">{item.created_at?.split('T')[0]}</span>
                  {item.status === 'approved' && item.file_url && permissions.can_download && (
                    <button
                      onClick={() => handleDownload(item.id)}
                      className="text-xs text-green-600 hover:text-green-800"
                    >
                      下载附件{permissions.download_cost > 0 ? `(-${permissions.download_cost}积分)` : ''}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 空状态 */}
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🏗️</div>
          <div>暂无案例</div>
          <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
            添加第一个案例
          </Button>
        </div>
      )}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <UserUploadDialog
          type="case"
          metadataFields={[
            { key: 'project_type', label: '项目类型', type: 'select', options: CASE_PROJECT_TYPES },
            { key: 'industry', label: '行业', type: 'text', placeholder: '如：环保工程' },
            { key: 'scale', label: '规模', type: 'text', placeholder: '如：5000m³/d' },
            { key: 'budget', label: '预算', type: 'text', placeholder: '如：1200万元' },
            { key: 'completion_date', label: '完成日期', type: 'date' },
          ]}
          onClose={() => setShowUploadDialog(false)}
          onSubmit={handleUpload}
          uploading={uploading}
        />
      )}
    </div>
  );
}
