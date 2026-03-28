'use client';

import { useState, useMemo } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { useKnowledgeUpload } from '@/hooks/useKnowledgeUpload';
import { Button } from '@/components/ui/button';
import UserUploadDialog from './user-upload-dialog';
import { toast } from 'sonner';
import { QUOTA_TYPES } from '@/types/knowledge';

export default function QuotaLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [quotaType, setQuotaType] = useState('all');
  const [region, setRegion] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const metadataFilter = useMemo(() => {
    const filter: Record<string, any> = {};
    if (quotaType !== 'all') filter.quota_type = quotaType;
    if (region !== 'all') filter.region = region;
    return Object.keys(filter).length > 0 ? filter : undefined;
  }, [quotaType, region]);

  const { items, loading, total, permissions, refresh } = useKnowledgeList('quota', {
    include_mine: true,
    keyword: searchTerm || undefined,
    metadata_filter: metadataFilter,
  });

  const { uploadFile, uploading } = useKnowledgeUpload('quota');

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
          <Button size="sm" variant="outline" onClick={refresh}>
            <span>🔄</span> 刷新
          </Button>
        </div>
      </div>

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
      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索定额名称、编号..."
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
              {items.map((item) => {
                const m = item.metadata || {};
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="p-2 border font-mono text-xs">{m.quota_code || '-'}</td>
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
                    <td className="p-2 border text-xs">{m.quota_type || '-'}</td>
                    <td className="p-2 border text-xs">{m.unit || '-'}</td>
                    <td className="p-2 border text-right">{m.base_price != null ? Number(m.base_price).toFixed(2) : '-'}</td>
                    <td className="p-2 border text-right">{m.labor_cost != null ? Number(m.labor_cost).toFixed(2) : '-'}</td>
                    <td className="p-2 border text-right">{m.material_cost != null ? Number(m.material_cost).toFixed(2) : '-'}</td>
                    <td className="p-2 border text-right">{m.machine_cost != null ? Number(m.machine_cost).toFixed(2) : '-'}</td>
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
          <div className="text-5xl mb-3">🧮</div>
          <div>暂无定额数据</div>
          <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
            上传定额数据
          </Button>
        </div>
      )}

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
        />
      )}
    </div>
  );
}
