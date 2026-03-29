'use client';

import { useState, useEffect } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { Button } from '@/components/ui/button';
import { KnowledgeListSkeleton } from './skeleton';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
};

const TYPE_LABELS: Record<string, string> = {
  document: '技术文档',
  case: '案例',
  standard: '标准规范',
  drawing: '图纸图片',
  quota: '定额',
  price: '产品价格',
  other: '其他',
};

export default function MyUploads() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const { items, loading, total, page, setPage, totalPages, refresh } = useKnowledgeList('', {
    scope: 'mine',
    keyword: searchTerm || undefined,
  });

  // 检测登录状态：如果返回空数据且 total=0，可能是未登录
  useEffect(() => {
    if (!loading) {
      // 如果 scope=mine 返回空数据，视为未登录（API 对未登录返回空）
      setIsLoggedIn(items.length > 0 || total > 0);
    }
  }, [loading, items.length, total]);

  // 客户端状态过滤
  const filteredItems = items.filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📁</span> 我的上传
          {isLoggedIn !== false && <span className="text-sm font-normal text-gray-500 ml-2">{total}个文件</span>}
        </h3>
        <Button size="sm" variant="outline" onClick={refresh}>
          <span>🔄</span> 刷新
        </Button>
      </div>

      {/* 未登录提示 */}
      {isLoggedIn === false && !loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-5xl mb-3">🔒</div>
          <div className="font-medium">请先登录</div>
          <p className="text-sm text-gray-400 mt-1">登录后可查看自己的上传记录和审核进度</p>
        </div>
      )}

      {/* 已登录内容 */}
      {isLoggedIn !== false && (
        <>
          {/* 状态筛选标签 */}
          <div className="flex gap-2 mb-4">
            {[
              { key: 'all', label: '全部' },
              { key: 'pending', label: '待审核' },
              { key: 'approved', label: '已通过' },
              { key: 'rejected', label: '已拒绝' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                  statusFilter === s.key ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 搜索栏 */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="搜索文件名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 p-2 border rounded"
            />
            {searchTerm && (
              <Button size="sm" variant="ghost" onClick={() => setSearchTerm('')}>清除</Button>
            )}
          </div>

          {/* 骨架屏 */}
          {loading && <KnowledgeListSkeleton variant="wide" count={3} />}

          {/* 文件列表 */}
          {!loading && filteredItems.length > 0 && (
            <div className="space-y-3">
              {filteredItems.map((item) => {
                const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                return (
                  <div key={item.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{item.title}</span>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {TYPE_LABELS[item.type] || item.type}
                          </span>
                          {item.uploader_name && item.uploader_name !== '未知' && (
                            <span className="text-xs text-gray-400">· {item.uploader_name}</span>
                          )}
                        </div>
                        {item.file_name && (
                          <div className="text-xs text-gray-500">{item.file_name}</div>
                        )}
                        {item.status === 'rejected' && item.reject_reason && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded">
                            <div className="text-xs font-medium text-red-600">拒绝原因：</div>
                            <div className="text-xs text-red-500 mt-1">{item.reject_reason}</div>
                          </div>
                        )}
                        {/* 审核信息 */}
                        {item.status === 'approved' && item.reviewed_at && (
                          <div className="text-xs text-green-600 mt-1">
                            审核通过 · {item.reviewed_at?.split('T')[0]}
                          </div>
                        )}
                        {item.status === 'rejected' && item.reviewed_at && (
                          <div className="text-xs text-gray-400 mt-1">
                            审核时间：{item.reviewed_at?.split('T')[0]}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap ml-4">
                        {item.created_at?.split('T')[0]}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 分页 */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-500">第 {page}/{totalPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
              </div>
            </div>
          )}

          {/* 空状态 */}
          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-3">📁</div>
              <div>{searchTerm || statusFilter !== 'all' ? '没有匹配的上传记录' : '暂无上传记录'}</div>
              <p className="text-sm mt-2 text-gray-400">
                上传的文件会在这里显示，包括审核状态
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
